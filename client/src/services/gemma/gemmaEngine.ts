import {
  CreateWebWorkerMLCEngine,
  WebWorkerMLCEngine,
  hasModelInCache,
  deleteModelAllInfoInCache,
  InitProgressReport,
  functionCallingModelIds,
} from '@mlc-ai/web-llm';

export const DEFAULT_GEMMA_MODEL = 'gemma-2-2b-it-q4f32_1-MLC';

/**
 * Checks whether a WebLLM model ID supports native function calling (ChatCompletionRequest.tools).
 */
export function isNativeFunctionCallingSupported(modelId: string): boolean {
  try {
    return Array.isArray(functionCallingModelIds) && functionCallingModelIds.includes(modelId);
  } catch {
    return false;
  }
}

export const GEMMA_MODELS = [
  {
    id: 'gemma-2-2b-it-q4f32_1-MLC',
    name: 'Gemma 2 2B Instruct (FP32/Universal)',
    size: '~1.5 GB',
    vram: '2.5 GB',
    recommended: true,
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B Instruct (FP16/Fast)',
    size: '~1.4 GB',
    vram: '1.9 GB',
    recommended: false,
  },
  {
    id: 'gemma-2b-it-q4f32_1-MLC',
    name: 'Gemma 1.1 2B Instruct',
    size: '~1.4 GB',
    vram: '1.7 GB',
    recommended: false,
  },
  {
    id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC',
    name: 'Hermes 2 Pro Llama 3 8B (Native Tools)',
    size: '~4.5 GB',
    vram: '6.0 GB',
    recommended: false,
  },
  {
    id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
    name: 'Hermes 3 Llama 3.1 8B (Native Tools)',
    size: '~4.5 GB',
    vram: '6.0 GB',
    recommended: false,
  },
];

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
      reason: 'WebGPU is not supported or not enabled in your browser. Use Google Chrome 113+, Microsoft Edge 113+, or enable WebGPU flags.',
    };
  }

  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        reason: 'WebGPU adapter could not be initialized. Your GPU or graphics driver may not support WebGPU.',
      };
    }
    const info = (adapter as any).info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : undefined);
    const adapterName = info?.vendor || info?.architecture || 'WebGPU Graphics Adapter';
    return { supported: true, adapterName };
  } catch (err: any) {
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
    return await hasModelInCache(modelId);
  } catch (err) {
    console.warn('Error checking Gemma cache:', err);
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
  await deleteModelAllInfoInCache(modelId);
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
    if (currentWorker) {
      currentWorker.terminate();
      currentWorker = null;
    }

    currentWorker = new Worker(
      new URL('../../workers/gemma.worker.ts', import.meta.url),
      { type: 'module' }
    );

    activeModelId = modelId;

    const engine = await CreateWebWorkerMLCEngine(
      currentWorker,
      modelId,
      {
        initProgressCallback: (report: InitProgressReport) => {
          onProgress?.({
            text: report.text,
            progress: Math.min(1, Math.max(0, report.progress || 0)),
          });
        },
      }
    );

    engineInstance = engine;
    return engine;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    engineInstance = null;
    if (currentWorker) {
      currentWorker.terminate();
      currentWorker = null;
    }
    throw err;
  }
}
