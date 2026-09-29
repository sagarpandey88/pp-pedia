import {
  CreateWebWorkerMLCEngine,
  WebWorkerMLCEngine,
  hasModelInCache,
  deleteModelAllInfoInCache,
  InitProgressReport,
  AppConfig,
} from '@mlc-ai/web-llm';

export const DEFAULT_GEMMA_MODEL = 'functiongemma-270m-it';

/**
 * Checks whether a WebLLM model ID supports native function calling (ChatCompletionRequest.tools).
 */
export function isNativeFunctionCallingSupported(_modelId: string): boolean {
  // FunctionGemma 270M uses specialized native tokens (<start_function_call>...) rather than OpenAI JSON grammar
  return false;
}

export const GEMMA_MODELS = [
  {
    id: 'functiongemma-270m-it',
    name: 'FunctionGemma 270M (Fast Tool Calling)',
    size: '~145 MB',
    vram: '~500 MB',
    recommended: true,
  },
];

export const FUNCTIONGEMMA_APP_CONFIG: AppConfig = {
  model_list: [
    {
      model: 'https://huggingface.co/conceptcodes/txpilot-functiongemma-270m-it-q4f32_1-mlc/resolve/main/mlc-q4f32_1/',
      model_id: 'functiongemma-270m-it',
      model_lib:
        'https://huggingface.co/conceptcodes/txpilot-functiongemma-270m-it-q4f32_1-mlc/resolve/main/libs/functiongemma-270m-q4f32_1-webgpu.wasm',
      vram_required_MB: 500,
    },
  ],
};

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
    return await hasModelInCache(modelId, FUNCTIONGEMMA_APP_CONFIG);
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
  await deleteModelAllInfoInCache(modelId, FUNCTIONGEMMA_APP_CONFIG);
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
        appConfig: FUNCTIONGEMMA_APP_CONFIG,
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
