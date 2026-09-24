import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';

// Configure transformers for browser worker
env.allowLocalModels = false;
env.useBrowserCache = true;

let embedPipeline: FeatureExtractionPipeline | null = null;
let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (embedPipeline) return embedPipeline;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', {
    progress_callback: (progress: any) => {
      self.postMessage({
        type: 'PROGRESS',
        payload: progress,
      });
    },
  });

  embedPipeline = await pipelinePromise;
  return embedPipeline;
}

// Fallback deterministic 384-dimensional embedding generator if model download is blocked
function generateFallbackEmbedding(text: string): number[] {
  const dim = 384;
  const vec = new Float32Array(dim);
  const clean = text.toLowerCase();

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const pos = (code * 31 + i * 17) % dim;
    vec[pos] += 1.0;
  }

  // Normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1.0;
  const result: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) {
    result[i] = Number((vec[i] / norm).toFixed(6));
  }
  return result;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    if (type === 'INIT') {
      try {
        await getPipeline();
        self.postMessage({ id, type: 'INIT_SUCCESS' });
      } catch (err) {
        console.warn('Transformer pipeline init fallback to deterministic vectorizer:', err);
        self.postMessage({ id, type: 'INIT_SUCCESS', fallback: true });
      }
    } else if (type === 'EMBED_BATCH') {
      const texts: string[] = payload.texts;
      const embeddings: number[][] = [];

      try {
        const pipe = await getPipeline();
        for (let i = 0; i < texts.length; i++) {
          const text = texts[i];
          const out = await pipe(text, { pooling: 'mean', normalize: true });
          embeddings.push(Array.from(out.data as Float32Array));

          self.postMessage({
            type: 'BATCH_PROGRESS',
            payload: { current: i + 1, total: texts.length },
          });
        }
      } catch (err) {
        console.warn('Using fallback vectorizer for batch:', err);
        for (const text of texts) {
          embeddings.push(generateFallbackEmbedding(text));
        }
      }

      self.postMessage({ id, type: 'EMBED_BATCH_SUCCESS', payload: { embeddings } });
    } else if (type === 'EMBED_QUERY') {
      const query: string = payload.query;
      let embedding: number[];

      try {
        const pipe = await getPipeline();
        const out = await pipe(query, { pooling: 'mean', normalize: true });
        embedding = Array.from(out.data as Float32Array);
      } catch (err) {
        console.warn('Using fallback vectorizer for query:', err);
        embedding = generateFallbackEmbedding(query);
      }

      self.postMessage({ id, type: 'EMBED_QUERY_SUCCESS', payload: { embedding } });
    }
  } catch (error: any) {
    self.postMessage({ id, type: 'ERROR', error: error?.message || String(error) });
  }
};

