import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Hook up WebLLM's dedicated worker message handler
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
