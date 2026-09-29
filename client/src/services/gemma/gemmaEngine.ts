import {
  CreateWebWorkerMLCEngine,
  WebWorkerMLCEngine,
  hasModelInCache,
  deleteModelAllInfoInCache,
  InitProgressReport,
} from '@mlc-ai/web-llm';
import {
  DEFAULT_GEMMA_MODEL,
  GEMMA_MODELS,
  FUNCTIONGEMMA_APP_CONFIG,
} from './gemmaConfig';

export { DEFAULT_GEMMA_MODEL, GEMMA_MODELS, FUNCTIONGEMMA_APP_CONFIG };

/**
 * Checks whether a WebLLM model ID supports native function calling (ChatCompletionRequest.tools).
 */
export function isNativeFunctionCallingSupported(_modelId: string): boolean {
  // FunctionGemma 270M uses specialized native tokens (<start_function_call>...) rather than OpenAI JSON grammar
  return false;
}

let engineInstance: WebWorkerMLCEngine | null = null;
let currentWorker: Worker | null = null;
let loadPromise: Promise<WebWorkerMLCEngine> | null = null;
let activeModelId: string = DEFAULT_GEMMA_MODEL;

export interface WebGPUStatus {
  supported: boolean;
  adapterName?: string;
  reason?: string;
}

/**
 * Checks whether WebGPU is available and an adapter can be acquired.
 */
export async function checkWebGPUSupport(): Promise<WebGPUStatus> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'Non-browser environment' };
  }

  const nav = navigator as any;
  if (!nav.gpu) {
    return {
      supported: false,
      reason:
        'WebGPU is not enabled or supported in this browser. Please enable chrome://flags/#enable-unsafe-webgpu or use Chrome/Edge 113+.',
    };
  }

  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        reason: 'WebGPU adapter could not be initialized. Your graphics driver may not support WebGPU.',
      };
    }

    let adapterName = 'WebGPU Graphics Adapter';
    try {
      const info =
        adapter.info ||
        (typeof adapter.requestAdapterInfo === 'function'
          ? await adapter.requestAdapterInfo().catch(() => null)
          : undefined);
      if (info?.vendor || info?.architecture) {
        adapterName = [info.vendor, info.architecture].filter(Boolean).join(' ');
      }
    } catch {
      // Ignore adapter info error, adapter itself is valid
    }

    return { supported: true, adapterName };
  } catch (err: any) {
    console.warn('[WebGPU Check] Error requesting adapter:', err);
    return {
      supported: false,
      reason: `WebGPU initialization error: ${err?.message || err}`,
    };
  }
}

/**
 * Checks whether the Gemma model weights are cached in browser CacheStorage.
 */
export async function isGemmaCached(modelId: string = DEFAULT_GEMMA_MODEL): Promise<boolean> {
  try {
    return await hasModelInCache(modelId, FUNCTIONGEMMA_APP_CONFIG);
  } catch (err) {
    console.warn('[FunctionGemma Engine] Error checking Gemma cache:', err);
    return false;
  }
}

/**
 * Deletes model weights from browser CacheStorage to free up storage.
 */
export async function deleteGemmaCache(modelId: string = DEFAULT_GEMMA_MODEL): Promise<void> {
  if (engineInstance) {
    await unloadGemmaEngine();
  }
  await deleteModelAllInfoInCache(modelId, FUNCTIONGEMMA_APP_CONFIG);
  await clearAllWebLLMCaches();
}

/**
 * Force clear all webllm CacheStorage instances to remove corrupt partial downloads.
 */
export async function clearAllWebLLMCaches(): Promise<void> {
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.includes('webllm') || key.includes('tvmjs')) {
          console.log('[FunctionGemma Engine] Deleting cache storage:', key);
          await caches.delete(key);
        }
      }
    } catch (err) {
      console.warn('[FunctionGemma Engine] Error deleting caches:', err);
    }
  }
}

/**
 * Unloads the currently active Gemma worker and engine instance to free VRAM.
 */
export async function unloadGemmaEngine(): Promise<void> {
  if (currentWorker) {
    currentWorker.terminate();
    currentWorker = null;
  }
  engineInstance = null;
  loadPromise = null;
}

/**
 * Returns true if the Gemma engine is currently loaded in memory and ready for inference.
 */
export function isGemmaLoaded(): boolean {
  return engineInstance !== null;
}

/**
 * Returns the currently loaded engine or null.
 */
export function getLoadedEngine(): WebWorkerMLCEngine | null {
  return engineInstance;
}

/**
 * Loads or returns the active WebWorkerMLCEngine for Gemma.
 */
export async function getOrInitGemmaEngine(
  modelId: string = DEFAULT_GEMMA_MODEL,
  onProgress?: (report: { text: string; progress: number }) => void
): Promise<WebWorkerMLCEngine> {
  if (engineInstance && activeModelId === modelId) {
    return engineInstance;
  }

  if (loadPromise && activeModelId === modelId) {
    return loadPromise;
  }

  loadPromise = (async () => {
    console.log('[FunctionGemma Engine] Spawning worker for model:', modelId);
    if (currentWorker) {
      currentWorker.terminate();
      currentWorker = null;
    }

    currentWorker = new Worker(
      new URL('../../workers/gemma.worker.ts', import.meta.url),
      { type: 'module' }
    );

    currentWorker.onerror = (e) => {
      console.error('[FunctionGemma Engine] Dedicated worker encountered error:', e.message, e);
    };

    activeModelId = modelId;

    console.log('[FunctionGemma Engine] Creating WebWorkerMLCEngine with config:', FUNCTIONGEMMA_APP_CONFIG);
    const engine = await CreateWebWorkerMLCEngine(
      currentWorker,
      modelId,
      {
        initProgressCallback: (report: InitProgressReport) => {
          console.log('[FunctionGemma Engine] Init progress:', report.text, report.progress);
          onProgress?.({
            text: report.text,
            progress: Math.min(1, Math.max(0, report.progress || 0)),
          });
        },
        appConfig: FUNCTIONGEMMA_APP_CONFIG,
      }
    );

    console.log('[FunctionGemma Engine] WebWorkerMLCEngine created successfully!');
    engineInstance = engine;
    return engine;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    console.error('[FunctionGemma Engine] Engine initialization failed:', err);
    loadPromise = null;
    engineInstance = null;
    if (currentWorker) {
      currentWorker.terminate();
      currentWorker = null;
    }
    throw err;
  }
}
