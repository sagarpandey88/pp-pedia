import '../services/gemma/wasmPolyfill';

import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';
import { FUNCTIONGEMMA_APP_CONFIG } from '../services/gemma/gemmaConfig';

console.log('[FunctionGemma Worker] Initializing WebWorkerMLCEngineHandler with patched WebAssembly...');

// Hook up WebLLM dedicated worker message handler with FunctionGemma AppConfig
const handler = new WebWorkerMLCEngineHandler();
try {
  handler.engine.setAppConfig(FUNCTIONGEMMA_APP_CONFIG);
  console.log('[FunctionGemma Worker] AppConfig successfully configured:', FUNCTIONGEMMA_APP_CONFIG.model_list[0].model_id);
} catch (err) {
  console.error('[FunctionGemma Worker] Failed to set initial AppConfig:', err);
}

self.onmessage = (msg: MessageEvent) => {
  console.log('[FunctionGemma Worker] Received message kind:', msg.data?.kind || msg.data);
  try {
    handler.onmessage(msg);
  } catch (err) {
    console.error('[FunctionGemma Worker] Error in onmessage handler:', err);
  }
};

self.onerror = (err) => {
  console.error('[FunctionGemma Worker] Uncaught worker error:', err);
};
