import { PGlite, Transaction } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import {
  ProjectRecord,
  DocumentRecord,
  ChunkRecord,
  SimilarityResult,
  DatabaseStats,
} from '../types/db';

let dbInstance: PGlite | null = null;
let initPromise: Promise<PGlite> | null = null;
let hasVectorExtension = false;

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

export async function getDb(): Promise<PGlite> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const isBrowser = typeof window !== 'undefined' && 'indexedDB' in window;
      const dbLocation = isBrowser ? 'idb://pp_pedia_db' : undefined;

      const db = new PGlite(dbLocation, {
        extensions: {
          vector,
        },
      });

      await db.waitReady;

      // Try enabling pgvector
      try {
        await db.exec('CREATE EXTENSION IF NOT EXISTS vector;');
        hasVectorExtension = true;
      } catch (extErr) {
        console.warn('pgvector extension could not be initialized, falling back to client-side vector search:', extErr);
        hasVectorExtension = false;
      }

      // Create Projects Table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          unique_name TEXT NOT NULL,
          display_name TEXT NOT NULL,
          version TEXT NOT NULL,
          is_managed BOOLEAN NOT NULL DEFAULT false,
          publisher_name TEXT,
          description TEXT,
          ast_json JSONB,
          stats JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create Documents Table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          doc_type TEXT NOT NULL,
          title TEXT NOT NULL,
          slug TEXT NOT NULL,
          content_markdown TEXT NOT NULL,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create Document Chunks Table
      if (hasVectorExtension) {
        try {
          await db.exec(`
            CREATE TABLE IF NOT EXISTS document_chunks (
              id TEXT PRIMARY KEY,
              document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
              project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              chunk_index INTEGER NOT NULL,
              chunk_content TEXT NOT NULL,
              heading_context TEXT,
              embedding vector(384),
              metadata JSONB,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
          `);

          await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_chunks_project_id ON document_chunks(project_id);
          `);
        } catch {
          // If vector column type fails, fallback to text
          hasVectorExtension = false;
        }
      }

      if (!hasVectorExtension) {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS document_chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            chunk_content TEXT NOT NULL,
            heading_context TEXT,
            embedding TEXT,
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await db.exec(`
          CREATE INDEX IF NOT EXISTS idx_chunks_project_id ON document_chunks(project_id);
        `);
      }

      try {
        await db.exec(`
          CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON document_chunks USING gin(to_tsvector('english', chunk_content));
        `);
      } catch {
        // GIN index on expression is best-effort
      }

      dbInstance = db;
      return db;
    } catch (err) {
      console.error('Failed to initialize persistent PGlite database, using in-memory:', err);
      const fallbackDb = new PGlite();
      await fallbackDb.waitReady;
      hasVectorExtension = false;

      await fallbackDb.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          unique_name TEXT NOT NULL,
          display_name TEXT NOT NULL,
          version TEXT NOT NULL,
          is_managed BOOLEAN NOT NULL DEFAULT false,
          publisher_name TEXT,
          description TEXT,
          ast_json JSONB,
          stats JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          doc_type TEXT NOT NULL,
          title TEXT NOT NULL,
          slug TEXT NOT NULL,
          content_markdown TEXT NOT NULL,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS document_chunks (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          chunk_index INTEGER NOT NULL,
          chunk_content TEXT NOT NULL,
          heading_context TEXT,
          embedding TEXT,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      dbInstance = fallbackDb;
      return fallbackDb;
    }
  })();

  return initPromise;
}

async function saveProjectTx(tx: Transaction, project: ProjectRecord): Promise<void> {
  await tx.query(
    `
    INSERT INTO projects (
      id, unique_name, display_name, version, is_managed, publisher_name, description, ast_json, stats, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET
      unique_name = EXCLUDED.unique_name,
      display_name = EXCLUDED.display_name,
      version = EXCLUDED.version,
      is_managed = EXCLUDED.is_managed,
      publisher_name = EXCLUDED.publisher_name,
      description = EXCLUDED.description,
      ast_json = EXCLUDED.ast_json,
      stats = EXCLUDED.stats,
      updated_at = CURRENT_TIMESTAMP;
  `,
    [
      project.id,
      project.unique_name,
      project.display_name,
      project.version,
      project.is_managed,
      project.publisher_name || null,
      project.description || null,
      JSON.stringify(project.ast_json),
      JSON.stringify(project.stats),
    ]
  );
}

export async function saveProject(project: ProjectRecord): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.exec('SET LOCAL synchronous_commit = off;');
    await saveProjectTx(tx, project);
  });
}

export async function getProjects(): Promise<ProjectRecord[]> {
  const db = await getDb();
  const res = await db.query<ProjectRecord>(`
    SELECT id, unique_name, display_name, version, is_managed, publisher_name, description,
           ast_json, stats, created_at, updated_at
    FROM projects
    ORDER BY updated_at DESC;
  `);

  return res.rows.map((row) => ({
    ...row,
    ast_json:
      typeof row.ast_json === 'string'
        ? JSON.parse(row.ast_json)
        : row.ast_json,
    stats:
      typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats,
  }));
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  const db = await getDb();
  const res = await db.query<ProjectRecord>(
    `SELECT * FROM projects WHERE id = $1 LIMIT 1;`,
    [id]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    ...row,
    ast_json:
      typeof row.ast_json === 'string'
        ? JSON.parse(row.ast_json)
        : row.ast_json,
    stats:
      typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats,
  };
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.exec('SET LOCAL synchronous_commit = off;');
    await tx.query('DELETE FROM projects WHERE id = $1;', [id]);
  });
}

async function insertDocumentsTx(
  tx: Transaction,
  docs: DocumentRecord[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((doc, idx) => {
      const offset = idx * 7;
      values.push(
        doc.id,
        doc.project_id,
        doc.doc_type,
        doc.title,
        doc.slug,
        doc.content_markdown,
        doc.metadata ? JSON.stringify(doc.metadata) : null
      );
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
      );
    });

    await tx.query(
      `
      INSERT INTO documents (
        id, project_id, doc_type, title, slug, content_markdown, metadata
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        slug = EXCLUDED.slug,
        content_markdown = EXCLUDED.content_markdown,
        metadata = EXCLUDED.metadata;
    `,
      values
    );
  }
}

export async function saveDocuments(docs: DocumentRecord[]): Promise<void> {
  if (docs.length === 0) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.exec('SET LOCAL synchronous_commit = off;');
    await insertDocumentsTx(tx, docs);
  });
}

export async function getDocuments(projectId: string): Promise<DocumentRecord[]> {
  const db = await getDb();
  const res = await db.query<DocumentRecord>(
    `
    SELECT id, project_id, doc_type, title, slug, content_markdown, metadata, created_at
    FROM documents
    WHERE project_id = $1
    ORDER BY created_at ASC;
  `,
    [projectId]
  );
  return res.rows;
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  const db = await getDb();
  const res = await db.query<DocumentRecord>(
    `SELECT * FROM documents WHERE id = $1 LIMIT 1;`,
    [id]
  );
  return res.rows[0] || null;
}

export async function findDocumentBySlugOrId(
  slugOrId: string,
  projectId?: string
): Promise<DocumentRecord | null> {
  const db = await getDb();
  if (projectId) {
    const res = await db.query<DocumentRecord>(
      `SELECT * FROM documents WHERE (id = $1 OR slug = $1) AND project_id = $2 LIMIT 1;`,
      [slugOrId, projectId]
    );
    if (res.rows[0]) return res.rows[0];
  }
  const res = await db.query<DocumentRecord>(
    `SELECT * FROM documents WHERE id = $1 OR slug = $1 LIMIT 1;`,
    [slugOrId]
  );
  return res.rows[0] || null;
}

export async function getAllDocuments(): Promise<DocumentRecord[]> {
  const db = await getDb();
  const res = await db.query<DocumentRecord>(
    `SELECT id, project_id, doc_type, title, slug, content_markdown, metadata, created_at FROM documents ORDER BY created_at ASC;`
  );
  return res.rows;
}

async function insertChunksTx(
  tx: Transaction,
  chunks: ChunkRecord[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((chunk, idx) => {
      const offset = idx * 8;
      if (hasVectorExtension) {
        const vectorLiteral = `[${chunk.embedding.join(',')}]`;
        values.push(
          chunk.id,
          chunk.document_id,
          chunk.project_id,
          chunk.chunk_index,
          chunk.chunk_content,
          chunk.heading_context || null,
          vectorLiteral,
          chunk.metadata ? JSON.stringify(chunk.metadata) : null
        );
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::vector, $${offset + 8})`
        );
      } else {
        const embeddingText = JSON.stringify(chunk.embedding);
        values.push(
          chunk.id,
          chunk.document_id,
          chunk.project_id,
          chunk.chunk_index,
          chunk.chunk_content,
          chunk.heading_context || null,
          embeddingText,
          chunk.metadata ? JSON.stringify(chunk.metadata) : null
        );
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
        );
      }
    });

    await tx.query(
      `
      INSERT INTO document_chunks (
        id, document_id, project_id, chunk_index, chunk_content, heading_context, embedding, metadata
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        chunk_content = EXCLUDED.chunk_content,
        heading_context = EXCLUDED.heading_context,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata;
    `,
      values
    );
  }
}

export async function saveChunks(chunks: ChunkRecord[]): Promise<void> {
  if (chunks.length === 0) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.exec('SET LOCAL synchronous_commit = off;');
    await insertChunksTx(tx, chunks);
  });
}

/**
 * Persists an entire ingested project (metadata, documents, and chunks)
 * inside a single atomic transaction with multi-row batching and relaxed synchronous commit.
 * This guarantees consistency and reduces IndexedDB/VFS flush operations from hundreds to one.
 */
export async function saveFullProjectIngestion(
  project: ProjectRecord,
  docs: DocumentRecord[],
  chunks: ChunkRecord[]
): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.exec('SET LOCAL synchronous_commit = off;');
    await saveProjectTx(tx, project);
    if (docs.length > 0) {
      await insertDocumentsTx(tx, docs);
    }
    if (chunks.length > 0) {
      await insertChunksTx(tx, chunks);
    }
  });
}

/**
 * Extracts distinct normalized alphanumeric tokens from the user query.
 * Domain-agnostic: filters out trivial single characters, but retains technical acronyms.
 */
export function extractSearchTerms(queryText?: string): string[] {
  if (!queryText || !queryText.trim()) return [];

  const lower = queryText.toLowerCase();
  const words = lower
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const terms = new Set<string>();
  for (const w of words) {
    terms.add(w);
    if (w.includes('_')) {
      terms.add(w.replace(/_/g, ''));
    }
  }

  return Array.from(terms).slice(0, 10);
}

/**
 * Hybrid search combining dense vector retrieval and lexical keyword matching
 * fused via Reciprocal Rank Fusion (RRF).
 */
export async function querySimilarChunks(
  queryVector: number[],
  projectId?: string,
  limit = 10,
  rawQuery?: string
): Promise<SimilarityResult[]> {
  const db = await getDb();
  const searchTerms = extractSearchTerms(rawQuery);
  const candidateLimit = Math.max(limit * 2, 20);

  let vectorCandidates: SimilarityResult[] = [];
  let lexicalCandidates: SimilarityResult[] = [];

  // 1. Dense Vector Candidate Retrieval
  if (hasVectorExtension) {
    try {
      const vectorLiteral = `[${queryVector.join(',')}]`;
      let vecQuery: string;
      let vecParams: unknown[];

      if (projectId) {
        vecQuery = `
          SELECT c.id, c.chunk_content, c.heading_context, d.title, d.slug, d.project_id, p.display_name AS project_name,
                 1 - (c.embedding <=> $1::vector) AS similarity
          FROM document_chunks c
          JOIN documents d ON c.document_id = d.id
          JOIN projects p ON c.project_id = p.id
          WHERE c.project_id = $2
          ORDER BY c.embedding <=> $1::vector
          LIMIT $3;
        `;
        vecParams = [vectorLiteral, projectId, candidateLimit];
      } else {
        vecQuery = `
          SELECT c.id, c.chunk_content, c.heading_context, d.title, d.slug, d.project_id, p.display_name AS project_name,
                 1 - (c.embedding <=> $1::vector) AS similarity
          FROM document_chunks c
          JOIN documents d ON c.document_id = d.id
          JOIN projects p ON c.project_id = p.id
          ORDER BY c.embedding <=> $1::vector
          LIMIT $2;
        `;
        vecParams = [vectorLiteral, candidateLimit];
      }

      const res = await db.query<SimilarityResult>(vecQuery, vecParams);
      vectorCandidates = res.rows.map((row) => ({
        ...row,
        similarity: Math.max(0, Math.min(1, Number(row.similarity))),
      }));
    } catch (queryErr) {
      console.warn('Vector query failed, falling back to client-side vector search:', queryErr);
    }
  }

  // 2. Lexical Candidate Retrieval via PostgreSQL Full-Text Search (FTS)
  if (rawQuery && rawQuery.trim()) {
    const trimmedQuery = rawQuery.trim();
    try {
      // Weighted document representation:
      // Weight 'A': Document Title, Weight 'B': Chunk Heading, Weight 'C': Chunk Content
      const tsvExpr = `(
        setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(c.heading_context, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(c.chunk_content, '')), 'C')
      )`;

      let ftsQuery: string;
      let ftsParams: unknown[];

      if (projectId) {
        ftsQuery = `
          SELECT c.id, c.chunk_content, c.heading_context, d.title, d.slug, d.project_id, p.display_name AS project_name,
                 ts_rank_cd(${tsvExpr}, plainto_tsquery('english', $1)) AS lex_score
          FROM document_chunks c
          JOIN documents d ON c.document_id = d.id
          JOIN projects p ON c.project_id = p.id
          WHERE c.project_id = $2
            AND ${tsvExpr} @@ plainto_tsquery('english', $1)
          ORDER BY lex_score DESC
          LIMIT $3;
        `;
        ftsParams = [trimmedQuery, projectId, candidateLimit];
      } else {
        ftsQuery = `
          SELECT c.id, c.chunk_content, c.heading_context, d.title, d.slug, d.project_id, p.display_name AS project_name,
                 ts_rank_cd(${tsvExpr}, plainto_tsquery('english', $1)) AS lex_score
          FROM document_chunks c
          JOIN documents d ON c.document_id = d.id
          JOIN projects p ON c.project_id = p.id
          WHERE ${tsvExpr} @@ plainto_tsquery('english', $1)
          ORDER BY lex_score DESC
          LIMIT $2;
        `;
        ftsParams = [trimmedQuery, candidateLimit];
      }

      const ftsRes = await db.query<any>(ftsQuery, ftsParams);
      if (ftsRes.rows && ftsRes.rows.length > 0) {
        lexicalCandidates = ftsRes.rows.map((row) => ({
          id: row.id,
          chunk_content: row.chunk_content,
          heading_context: row.heading_context,
          title: row.title,
          slug: row.slug,
          project_id: row.project_id,
          project_name: row.project_name,
          similarity: 0,
          _lexScore: Number(row.lex_score) || 0,
        }));
      }
    } catch (ftsErr) {
      console.warn('Postgres Full-Text Search failed or yielded invalid tsquery, using fallback:', ftsErr);
    }

    // Resilient Fallback: If FTS returned zero candidates (e.g. non-dictionary acronyms, technical IDs, or numbers),
    // perform substring ILIKE search with extracted tokens
    if (lexicalCandidates.length === 0 && searchTerms.length > 0) {
      try {
        const lexClauses: string[] = [];
        const lexParams: unknown[] = [];
        let paramIdx = 1;

        let projectFilter = '';
        if (projectId) {
          projectFilter = `c.project_id = $${paramIdx}`;
          lexParams.push(projectId);
          paramIdx++;
        }

        for (const term of searchTerms.slice(0, 4)) {
          const pattern = `%${term}%`;
          lexClauses.push(
            `(c.chunk_content ILIKE $${paramIdx} OR c.heading_context ILIKE $${paramIdx} OR d.title ILIKE $${paramIdx})`
          );
          lexParams.push(pattern);
          paramIdx++;
        }

        const whereParts: string[] = [];
        if (projectFilter) whereParts.push(projectFilter);
        if (lexClauses.length > 0) {
          whereParts.push(`(${lexClauses.join(' OR ')})`);

          const fallbackQuery = `
            SELECT c.id, c.chunk_content, c.heading_context, d.title, d.slug, d.project_id, p.display_name AS project_name
            FROM document_chunks c
            JOIN documents d ON c.document_id = d.id
            JOIN projects p ON c.project_id = p.id
            WHERE ${whereParts.join(' AND ')}
            LIMIT ${candidateLimit};
          `;

          const fallbackRes = await db.query<any>(fallbackQuery, lexParams);
          lexicalCandidates = fallbackRes.rows.map((row) => ({
            id: row.id,
            chunk_content: row.chunk_content,
            heading_context: row.heading_context,
            title: row.title,
            slug: row.slug,
            project_id: row.project_id,
            project_name: row.project_name,
            similarity: 0,
            _lexScore: 0.1,
          }));
        }
      } catch (fallbackErr) {
        console.warn('Fallback substring search failed:', fallbackErr);
      }
    }
  }

  // Fallback: If vector extension wasn't available and we need vector candidates
  if (vectorCandidates.length === 0 && !hasVectorExtension) {
    let fallbackQuery = `
      SELECT c.id, c.chunk_content, c.heading_context, c.embedding, d.title, d.slug, d.project_id, p.display_name AS project_name
      FROM document_chunks c
      JOIN documents d ON c.document_id = d.id
      JOIN projects p ON c.project_id = p.id
    `;
    const fallbackParams: unknown[] = [];
    if (projectId) {
      fallbackQuery += ` WHERE c.project_id = $1`;
      fallbackParams.push(projectId);
    }

    const res = await db.query<any>(fallbackQuery, fallbackParams);
    const scored = res.rows.map((row) => {
      let vec: number[] = [];
      if (typeof row.embedding === 'string') {
        try {
          vec = JSON.parse(row.embedding);
        } catch {
          vec = row.embedding.replace(/[\[\]]/g, '').split(',').map(Number);
        }
      } else if (Array.isArray(row.embedding)) {
        vec = row.embedding;
      }
      const similarity = cosineSimilarity(queryVector, vec);
      return {
        id: row.id,
        chunk_content: row.chunk_content,
        heading_context: row.heading_context,
        title: row.title,
        slug: row.slug,
        project_id: row.project_id,
        project_name: row.project_name,
        similarity: Math.max(0, Math.min(1, similarity)),
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    vectorCandidates = scored.slice(0, candidateLimit);
  }

  // If no lexical candidates exist, simply return top vector candidates
  if (lexicalCandidates.length === 0) {
    return vectorCandidates.slice(0, limit);
  }

  // 3. Reciprocal Rank Fusion (RRF)
  const k = 60;
  const fusedMap = new Map<
    string,
    {
      item: SimilarityResult;
      rrfScore: number;
      vecSimilarity: number;
      isLexicalMatch: boolean;
    }
  >();

  // Add vector ranks
  vectorCandidates.forEach((item, idx) => {
    const rank = idx + 1;
    const rrfContrib = 1 / (k + rank);
    fusedMap.set(item.id, {
      item,
      rrfScore: rrfContrib,
      vecSimilarity: item.similarity,
      isLexicalMatch: false,
    });
  });

  // Add lexical ranks
  lexicalCandidates.forEach((item, idx) => {
    const rank = idx + 1;
    const rrfContrib = 1 / (k + rank);
    const existing = fusedMap.get(item.id);

    if (existing) {
      existing.rrfScore += rrfContrib;
      existing.isLexicalMatch = true;
    } else {
      fusedMap.set(item.id, {
        item,
        rrfScore: rrfContrib,
        vecSimilarity: 0,
        isLexicalMatch: true,
      });
    }
  });

  // Sort by fused RRF score descending
  const fusedList = Array.from(fusedMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);

  // Return top results with normalized intuitive similarity values (0 to 1)
  return fusedList.slice(0, limit).map(({ item, rrfScore, vecSimilarity, isLexicalMatch }) => {
    // If it matched both vector and lexical, it gets strong confidence
    let finalSim: number;
    if (vecSimilarity > 0 && isLexicalMatch) {
      finalSim = Math.min(0.98, Math.max(vecSimilarity, 0.75 + rrfScore * 10));
    } else if (vecSimilarity > 0) {
      finalSim = vecSimilarity;
    } else {
      // Pure lexical match
      finalSim = Math.min(0.92, 0.65 + rrfScore * 15);
    }

    return {
      ...item,
      similarity: Number(finalSim.toFixed(4)),
    };
  });
}

export async function getDatabaseStats(): Promise<DatabaseStats> {
  const db = await getDb();
  const pCount = await db.query<{ count: string }>(
    'SELECT count(*) as count FROM projects;'
  );
  const dCount = await db.query<{ count: string }>(
    'SELECT count(*) as count FROM documents;'
  );
  const cCount = await db.query<{ count: string }>(
    'SELECT count(*) as count FROM document_chunks;'
  );

  return {
    project_count: parseInt(pCount.rows[0]?.count || '0', 10),
    document_count: parseInt(dCount.rows[0]?.count || '0', 10),
    chunk_count: parseInt(cCount.rows[0]?.count || '0', 10),
  };
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.exec('DELETE FROM projects;');
}
