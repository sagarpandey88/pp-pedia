import { DEFAULT_GEMMA_MODEL, GEMMA_MODELS, GemmaModelOption } from './gemmaConfig';

export { DEFAULT_GEMMA_MODEL, GEMMA_MODELS };
export type { GemmaModelOption };

/**
 * FunctionGemma 270M natively formats tool calls using official special tokens
 * defined in its Jinja chat template (<start_function_call>call:...<end_function_call>).
 */
export function isNativeFunctionCallingSupported(_modelId: string): boolean {
  return true;
}

export interface WebGPUStatus {
  supported: boolean;
  adapterName?: string;
  reason?: string;
}

let workerInstance: Worker | null = null;
let msgIdCounter = 0;
let isLoaded = false;
let activeModelId: string = DEFAULT_GEMMA_MODEL;

const pendingRequests = new Map<
  number,
  {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    onProgress?: (data: { text: string; progress: number }) => void;
    onToken?: (delta: string) => void;
  }
>();

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../../workers/gemma.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerInstance.onmessage = (e: MessageEvent) => {
      const { id, type, payload, error } = e.data || {};

      if (id !== undefined && pendingRequests.has(id)) {
        const req = pendingRequests.get(id)!;

        if (type === 'PROGRESS') {
          req.onProgress?.(payload);
          return;
        }

        if (type === 'TOKEN') {
          req.onToken?.(payload?.delta);
          return;
        }

        pendingRequests.delete(id);

        if (type === 'ERROR' || error) {
          req.reject(new Error(error || 'Worker error'));
        } else {
          req.resolve(payload);
        }
      }
    };

    workerInstance.onerror = (err) => {
      console.error('[FunctionGemma Engine] Worker error:', err);
    };
  }
  return workerInstance;
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
        'WebGPU is not enabled in this browser. Please enable chrome://flags/#enable-unsafe-webgpu or use Chrome/Edge 113+.',
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
      // Ignore adapter info error
    }

    return { supported: true, adapterName };
  } catch (err: any) {
    return {
      supported: false,
      reason: `WebGPU error: ${err?.message || err}`,
    };
  }
}

/**
 * Checks whether the FunctionGemma ONNX model weights are cached in browser CacheStorage.
 */
export async function isGemmaCached(modelId: string = DEFAULT_GEMMA_MODEL): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some(
      (req) =>
        req.url.includes('functiongemma') ||
        req.url.includes('model_q4')
    );
  } catch (err) {
    console.warn('[FunctionGemma Engine] Error checking cache:', err);
    return false;
  }
}

/**
 * Deletes model weights from browser CacheStorage to free up storage.
 */
export async function deleteGemmaCache(modelId: string = DEFAULT_GEMMA_MODEL): Promise<void> {
  await unloadGemmaEngine();
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open('transformers-cache');
      const keys = await cache.keys();
      for (const req of keys) {
        if (req.url.includes('functiongemma') || req.url.includes('onnx-community')) {
          await cache.delete(req);
        }
      }
      // Also clean up any legacy webllm / tvmjs caches if present
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.includes('webllm') || name.includes('tvmjs')) {
          await caches.delete(name);
        }
      }
    } catch (err) {
      console.warn('[FunctionGemma Engine] Error deleting cache:', err);
    }
  }
}

/**
 * Unloads the currently active Gemma worker to free VRAM.
 */
export async function unloadGemmaEngine(): Promise<void> {
  if (workerInstance) {
    try {
      const id = ++msgIdCounter;
      await new Promise<void>((resolve) => {
        pendingRequests.set(id, {
          resolve: () => resolve(),
          reject: () => resolve(),
        });
        workerInstance?.postMessage({ id, type: 'UNLOAD' });
        setTimeout(resolve, 300);
      });
    } catch {
      // Ignore
    }
    workerInstance.terminate();
    workerInstance = null;
  }
  isLoaded = false;
}

/**
 * Returns true if the Gemma engine is loaded in memory and ready for inference.
 */
export function isGemmaLoaded(): boolean {
  return isLoaded;
}

/**
 * Loads or initializes the FunctionGemma engine in the dedicated WebWorker.
 */
export async function getOrInitGemmaEngine(
  modelId: string = DEFAULT_GEMMA_MODEL,
  onProgress?: (report: { text: string; progress: number }) => void
): Promise<{ modelId: string }> {
  const w = getWorker();
  activeModelId = modelId;

  return new Promise((resolve, reject) => {
    const id = ++msgIdCounter;
    pendingRequests.set(id, {
      resolve: () => {
        isLoaded = true;
        resolve({ modelId });
      },
      reject: (err) => {
        isLoaded = false;
        reject(err);
      },
      onProgress,
    });

    w.postMessage({
      id,
      type: 'INIT',
      payload: { modelId },
    });
  });
}

export interface GemmaGenerateParams {
  messages: Array<{ role: string; content?: string; tool_calls?: any[] }>;
  tools?: any[];
  maxNewTokens?: number;
  temperature?: number;
  onToken?: (delta: string) => void;
}

/**
 * Generates completion from FunctionGemma via Transformers.js in WebWorker.
 */
export async function generateGemmaResponse(
  params: GemmaGenerateParams,
  modelId: string = DEFAULT_GEMMA_MODEL
): Promise<string> {
  const w = getWorker();

  return new Promise((resolve, reject) => {
    const id = ++msgIdCounter;
    pendingRequests.set(id, {
      resolve: (payload) => {
        resolve(payload?.text || '');
      },
      reject,
      onToken: params.onToken,
    });

    w.postMessage({
      id,
      type: 'GENERATE',
      payload: {
        modelId,
        messages: params.messages,
        tools: params.tools,
        max_new_tokens: params.maxNewTokens || 256,
        temperature: params.temperature ?? 0.1,
      },
    });
  });
}
