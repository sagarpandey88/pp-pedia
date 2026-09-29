import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  env,
} from '@huggingface/transformers';
import { DEFAULT_GEMMA_MODEL } from '../services/gemma/gemmaConfig';

// Configure transformers for in-browser execution
env.allowLocalModels = false;
env.useBrowserCache = true;

let tokenizer: any = null;
let model: any = null;
let activeModelId: string = '';
let loadingPromise: Promise<void> | null = null;

async function loadModel(
  modelId: string = DEFAULT_GEMMA_MODEL,
  onProgress?: (data: { text: string; progress: number }) => void
): Promise<void> {
  if (model && tokenizer && activeModelId === modelId) {
    return;
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    console.log('[FunctionGemma Worker] Loading model via Transformers.js:', modelId);
    activeModelId = modelId;

    const progressTracker: Record<string, { loaded: number; total: number; progress: number }> = {};

    const progressCallback = (info: any) => {
      if (!info) return;
      if (info.status === 'progress' && info.file) {
        progressTracker[info.file] = {
          loaded: info.loaded || 0,
          total: info.total || 0,
          progress: info.progress || 0,
        };

        let totalProgress = 0;
        let count = 0;
        for (const f of Object.values(progressTracker)) {
          totalProgress += f.progress;
          count++;
        }
        const avg = count > 0 ? totalProgress / count : 0;
        const pct = Math.min(100, Math.max(0, Math.round(avg)));
        onProgress?.({
          text: `Downloading ${info.file.split('/').pop()} (${pct}%)`,
          progress: Math.min(1, Math.max(0, avg / 100)),
        });
      } else if (info.status === 'initiate') {
        onProgress?.({
          text: `Initializing ${info.file ? info.file.split('/').pop() : 'model'}...`,
          progress: 0.05,
        });
      } else if (info.status === 'done') {
        onProgress?.({
          text: `Loaded ${info.file ? info.file.split('/').pop() : 'component'}`,
          progress: 0.95,
        });
      } else if (info.status === 'ready') {
        onProgress?.({
          text: 'FunctionGemma 270M engine ready',
          progress: 1,
        });
      }
    };

    console.log('[FunctionGemma Worker] Initializing AutoTokenizer...');
    tokenizer = await AutoTokenizer.from_pretrained(modelId, {
      progress_callback: progressCallback,
    });

    const isWebGPUSupported = typeof navigator !== 'undefined' && Boolean((navigator as any).gpu);
    const device = isWebGPUSupported ? 'webgpu' : 'wasm';
    console.log(`[FunctionGemma Worker] Initializing AutoModelForCausalLM on device: ${device}...`);

    model = await AutoModelForCausalLM.from_pretrained(modelId, {
      device,
      dtype: 'q4',
      progress_callback: progressCallback,
    });

    console.log('[FunctionGemma Worker] Model loaded successfully on device:', device);
  })();

  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data || {};

  try {
    if (type === 'INIT') {
      const modelId = payload?.modelId || DEFAULT_GEMMA_MODEL;
      await loadModel(modelId, (report) => {
        self.postMessage({ id, type: 'PROGRESS', payload: report });
      });
      self.postMessage({ id, type: 'INIT_SUCCESS' });
      return;
    }

    if (type === 'GENERATE') {
      const modelId = payload?.modelId || DEFAULT_GEMMA_MODEL;
      await loadModel(modelId);

      const messages = payload?.messages || [];
      const tools = payload?.tools;
      const maxNewTokens = payload?.max_new_tokens || 256;
      const temperature = payload?.temperature ?? 0.1;

      // Apply official chat template with tools
      const prompt = tokenizer.apply_chat_template(messages, {
        tools: tools && tools.length > 0 ? tools : undefined,
        tokenize: false,
        add_generation_prompt: true,
      });

      const inputs = await tokenizer(prompt);

      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: false,
        callback_function: (deltaText: string) => {
          self.postMessage({ id, type: 'TOKEN', payload: { delta: deltaText } });
        },
      });

      const outputs = await model.generate({
        ...inputs,
        max_new_tokens: maxNewTokens,
        temperature,
        do_sample: false,
        streamer,
      });

      const decoded = tokenizer.decode(outputs[0].slice(inputs.input_ids.dims[1]), {
        skip_special_tokens: false,
      });

      self.postMessage({
        id,
        type: 'GENERATE_SUCCESS',
        payload: { text: decoded },
      });
      return;
    }

    if (type === 'UNLOAD') {
      if (model?.dispose) {
        await model.dispose();
      }
      model = null;
      tokenizer = null;
      activeModelId = '';
      self.postMessage({ id, type: 'UNLOAD_SUCCESS' });
      return;
    }

    if (type === 'STATUS') {
      self.postMessage({
        id,
        type: 'STATUS_SUCCESS',
        payload: {
          isLoaded: Boolean(model && tokenizer),
          modelId: activeModelId,
        },
      });
      return;
    }
  } catch (err: any) {
    console.error('[FunctionGemma Worker] Error handling message:', type, err);
    self.postMessage({
      id,
      type: 'ERROR',
      error: err?.message || String(err),
    });
  }
};

self.onerror = (err) => {
  console.error('[FunctionGemma Worker] Unhandled worker error:', err);
};
