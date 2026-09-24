let worker: Worker | null = null;
let msgIdCounter = 0;
const pendingRequests = new Map<
  number,
  {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    onProgress?: (data: any) => void;
  }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('../workers/embedding.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent) => {
      const { id, type, payload, error } = e.data;

      if (type === 'BATCH_PROGRESS' || type === 'PROGRESS') {
        // Broadcast progress to active requests if applicable
        for (const req of pendingRequests.values()) {
          req.onProgress?.(payload);
        }
        return;
      }

      if (id !== undefined && pendingRequests.has(id)) {
        const req = pendingRequests.get(id)!;
        pendingRequests.delete(id);

        if (type === 'ERROR' || error) {
          req.reject(new Error(error || 'Worker error'));
        } else {
          req.resolve(payload);
        }
      }
    };

    worker.onerror = (err) => {
      console.error('Embedding worker error:', err);
    };
  }
  return worker;
}

export function initEmbeddings(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const w = getWorker();
      const id = ++msgIdCounter;
      pendingRequests.set(id, { resolve, reject });
      w.postMessage({ id, type: 'INIT' });
    } catch (err) {
      reject(err);
    }
  });
}

export function embedBatch(
  texts: string[],
  onProgress?: (current: number, total: number) => void
): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    if (texts.length === 0) {
      resolve([]);
      return;
    }

    try {
      const w = getWorker();
      const id = ++msgIdCounter;
      pendingRequests.set(id, {
        resolve: (payload) => resolve(payload.embeddings),
        reject,
        onProgress: (p) => {
          if (p?.current && p?.total && onProgress) {
            onProgress(p.current, p.total);
          }
        },
      });

      w.postMessage({
        id,
        type: 'EMBED_BATCH',
        payload: { texts },
      });
    } catch (err) {
      reject(err);
    }
  });
}

export function embedQuery(query: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    try {
      const w = getWorker();
      const id = ++msgIdCounter;
      pendingRequests.set(id, {
        resolve: (payload) => resolve(payload.embedding),
        reject,
      });

      w.postMessage({
        id,
        type: 'EMBED_QUERY',
        payload: { query },
      });
    } catch (err) {
      reject(err);
    }
  });
}

