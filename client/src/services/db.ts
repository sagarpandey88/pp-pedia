import { PGlite, Transaction } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import {
  ProjectRecord,
  DocumentRecord,
  ChunkRecord,
  SimilarityResult,
  DatabaseStats,
  WebResourceRecord,
  FormEventHandlerRecord,
  ComponentDependencyRecord,
  FlowIntegrationRecord,
  FlowTriggerRecord,
  HardcodedLiteralRecord,
} from '../types/db';
import {
  WebResource,
  FormEventHandler,
  ComponentDependency,
  FlowIntegration,
  FlowTriggerDetail,
  HardcodedLiteral,
  DataverseEntity,
} from '../types/solution';

const SCHEMA_EXTENSIONS_DDL = `
  CREATE TABLE IF NOT EXISTS web_resources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT,
    resource_type TEXT NOT NULL,
    description TEXT,
    file_size_bytes INTEGER DEFAULT 0,
    content_text TEXT,
    detected_functions JSONB,
    uses_deprecated_xrm BOOLEAN DEFAULT false,
    uses_direct_dom BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_webres_project ON web_resources(project_id, name);

  CREATE TABLE IF NOT EXISTS form_event_handlers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entity_name TEXT NOT NULL,
    form_id TEXT,
    form_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    target_field TEXT,
    library_name TEXT NOT NULL,
    function_name TEXT NOT NULL,
    pass_execution_context BOOLEAN DEFAULT false,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_form_events_entity ON form_event_handlers(project_id, entity_name, target_field);

  CREATE TABLE IF NOT EXISTS component_dependencies (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    location_detail TEXT,
    target_entity TEXT NOT NULL,
    target_field TEXT,
    operation_type TEXT NOT NULL,
    context_snippet TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_deps_target ON component_dependencies(project_id, target_entity, target_field);
  CREATE INDEX IF NOT EXISTS idx_deps_source ON component_dependencies(project_id, source_type);

  CREATE TABLE IF NOT EXISTS flow_integrations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    flow_id TEXT NOT NULL,
    flow_name TEXT NOT NULL,
    connector_id TEXT NOT NULL,
    connector_name TEXT NOT NULL,
    operation_id TEXT,
    action_name TEXT NOT NULL,
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_flow_integrations ON flow_integrations(project_id, connector_name);

  CREATE TABLE IF NOT EXISTS flow_triggers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    flow_id TEXT NOT NULL,
    flow_name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    table_name TEXT,
    change_type TEXT,
    filter_expression TEXT,
    has_filter BOOLEAN NOT NULL DEFAULT false,
    select_columns JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_flow_triggers ON flow_triggers(project_id, table_name);

  CREATE TABLE IF NOT EXISTS hardcoded_literals (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    component_type TEXT NOT NULL,
    component_name TEXT NOT NULL,
    literal_type TEXT NOT NULL,
    value TEXT NOT NULL,
    code_context TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_hardcoded_literals ON hardcoded_literals(project_id, literal_type);

  CREATE TABLE IF NOT EXISTS entity_relationships_flat (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    primary_entity TEXT NOT NULL,
    referencing_entity TEXT NOT NULL,
    referencing_attribute TEXT,
    cascade_delete TEXT,
    cascade_assign TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_relationships_flat ON entity_relationships_flat(project_id, primary_entity, referencing_entity);
`;

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

      // Execute schema extensions DDL for auxiliary relational tables
      await db.exec(SCHEMA_EXTENSIONS_DDL);

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

      // Also execute schema extensions in fallback DB
      await fallbackDb.exec(SCHEMA_EXTENSIONS_DDL);

      dbInstance = fallbackDb;
      return fallbackDb;
    }
  })();

  return initPromise;
}

async function insertWebResourcesTx(
  tx: Transaction,
  projectId: string,
  resources: WebResource[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < resources.length; i += batchSize) {
    const batch = resources.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((r, idx) => {
      const offset = idx * 11;
      values.push(
        r.id || `wr_${projectId}_${i + idx}`,
        projectId,
        r.name,
        r.display_name || null,
        r.type || 'Unknown',
        r.description || null,
        r.file_size_bytes || 0,
        r.content_text || null,
        r.detected_functions ? JSON.stringify(r.detected_functions) : null,
        Boolean(r.uses_deprecated_xrm),
        Boolean(r.uses_direct_dom)
      );
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
      );
    });

    await tx.query(
      `
      INSERT INTO web_resources (
        id, project_id, name, display_name, resource_type, description, file_size_bytes, content_text, detected_functions, uses_deprecated_xrm, uses_direct_dom
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        display_name = EXCLUDED.display_name,
        resource_type = EXCLUDED.resource_type,
        description = EXCLUDED.description,
        file_size_bytes = EXCLUDED.file_size_bytes,
        content_text = EXCLUDED.content_text,
        detected_functions = EXCLUDED.detected_functions,
        uses_deprecated_xrm = EXCLUDED.uses_deprecated_xrm,
        uses_direct_dom = EXCLUDED.uses_direct_dom;
    `,
      values
    );
  }
}

async function insertFormEventHandlersTx(
  tx: Transaction,
  projectId: string,
  handlers: FormEventHandler[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < handlers.length; i += batchSize) {
    const batch = handlers.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((h, idx) => {
      const offset = idx * 11;
      values.push(
        h.id || `feh_${projectId}_${i + idx}`,
        projectId,
        h.entity_name,
        h.form_id || null,
        h.form_name,
        h.event_type,
        h.target_field || null,
        h.library_name,
        h.function_name,
        Boolean(h.pass_execution_context),
        Boolean(h.enabled)
      );
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
      );
    });

    await tx.query(
      `
      INSERT INTO form_event_handlers (
        id, project_id, entity_name, form_id, form_name, event_type, target_field, library_name, function_name, pass_execution_context, enabled
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        entity_name = EXCLUDED.entity_name,
        form_name = EXCLUDED.form_name,
        event_type = EXCLUDED.event_type,
        target_field = EXCLUDED.target_field,
        library_name = EXCLUDED.library_name,
        function_name = EXCLUDED.function_name,
        pass_execution_context = EXCLUDED.pass_execution_context,
        enabled = EXCLUDED.enabled;
    `,
      values
    );
  }
}

async function insertComponentDependenciesTx(
  tx: Transaction,
  projectId: string,
  deps: ComponentDependency[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < deps.length; i += batchSize) {
    const batch = deps.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((d, idx) => {
      const offset = idx * 10;
      values.push(
        d.id || `dep_${projectId}_${i + idx}`,
        projectId,
        d.source_type,
        d.source_id,
        d.source_name,
        d.location_detail || null,
        d.target_entity,
        d.target_field || null,
        d.operation_type,
        d.context_snippet || null
      );
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
      );
    });

    await tx.query(
      `
      INSERT INTO component_dependencies (
        id, project_id, source_type, source_id, source_name, location_detail, target_entity, target_field, operation_type, context_snippet
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        source_name = EXCLUDED.source_name,
        location_detail = EXCLUDED.location_detail,
        target_entity = EXCLUDED.target_entity,
        target_field = EXCLUDED.target_field,
        operation_type = EXCLUDED.operation_type,
        context_snippet = EXCLUDED.context_snippet;
    `,
      values
    );
  }
}

async function insertFlowIntegrationsTx(
  tx: Transaction,
  projectId: string,
  integrations: FlowIntegration[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < integrations.length; i += batchSize) {
    const batch = integrations.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((int, idx) => {
      const offset = idx * 9;
      values.push(
        int.id || `int_${projectId}_${i + idx}`,
        projectId,
        int.flow_id,
        int.flow_name,
        int.connector_id,
        int.connector_name,
        int.operation_id || null,
        int.action_name,
        Boolean(int.is_premium)
      );
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
      );
    });

    await tx.query(
      `
      INSERT INTO flow_integrations (
        id, project_id, flow_id, flow_name, connector_id, connector_name, operation_id, action_name, is_premium
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        flow_name = EXCLUDED.flow_name,
        connector_id = EXCLUDED.connector_id,
        connector_name = EXCLUDED.connector_name,
        operation_id = EXCLUDED.operation_id,
        action_name = EXCLUDED.action_name,
        is_premium = EXCLUDED.is_premium;
    `,
      values
    );
  }
}

async function insertFlowTriggersTx(
  tx: Transaction,
  projectId: string,
  triggers: FlowTriggerDetail[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < triggers.length; i += batchSize) {
    const batch = triggers.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((trig, idx) => {
      const offset = idx * 10;
      values.push(
        trig.id || `trig_${projectId}_${i + idx}`,
        projectId,
        trig.flow_id,
        trig.flow_name,
        trig.trigger_type,
        trig.table_name || null,
        trig.change_type || null,
        trig.filter_expression || null,
        Boolean(trig.has_filter),
        trig.select_columns ? JSON.stringify(trig.select_columns) : null
      );
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
      );
    });

    await tx.query(
      `
      INSERT INTO flow_triggers (
        id, project_id, flow_id, flow_name, trigger_type, table_name, change_type, filter_expression, has_filter, select_columns
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        flow_name = EXCLUDED.flow_name,
        trigger_type = EXCLUDED.trigger_type,
        table_name = EXCLUDED.table_name,
        change_type = EXCLUDED.change_type,
        filter_expression = EXCLUDED.filter_expression,
        has_filter = EXCLUDED.has_filter,
        select_columns = EXCLUDED.select_columns;
    `,
      values
    );
  }
}

async function insertHardcodedLiteralsTx(
  tx: Transaction,
  projectId: string,
  literals: HardcodedLiteral[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < literals.length; i += batchSize) {
    const batch = literals.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((lit, idx) => {
      const offset = idx * 7;
      values.push(
        lit.id || `lit_${projectId}_${i + idx}`,
        projectId,
        lit.component_type,
        lit.component_name,
        lit.literal_type,
        lit.value,
        lit.code_context || null
      );
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
      );
    });

    await tx.query(
      `
      INSERT INTO hardcoded_literals (
        id, project_id, component_type, component_name, literal_type, value, code_context
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        component_name = EXCLUDED.component_name,
        literal_type = EXCLUDED.literal_type,
        value = EXCLUDED.value,
        code_context = EXCLUDED.code_context;
    `,
      values
    );
  }
}

async function insertFlattenedRelationshipsTx(
  tx: Transaction,
  projectId: string,
  entities: DataverseEntity[],
  batchSize = 50
): Promise<void> {
  const flattened: Array<{
    id: string;
    relationship_type: string;
    primary_entity: string;
    referencing_entity: string;
    referencing_attribute?: string;
    cascade_delete?: string;
    cascade_assign?: string;
  }> = [];

  for (const ent of entities) {
    for (const rel of ent.relationships) {
      flattened.push({
        id: `rel_${projectId}_${rel.schema_name}_${flattened.length}`,
        relationship_type: rel.relationship_type,
        primary_entity: rel.primary_entity.toLowerCase(),
        referencing_entity: rel.referencing_entity.toLowerCase(),
        referencing_attribute: rel.referencing_attribute?.toLowerCase(),
        cascade_delete: rel.cascade_delete,
        cascade_assign: rel.cascade_assign,
      });
    }
  }

  for (let i = 0; i < flattened.length; i += batchSize) {
    const batch = flattened.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((r, idx) => {
      const offset = idx * 8;
      values.push(
        r.id,
        projectId,
        r.relationship_type,
        r.primary_entity,
        r.referencing_entity,
        r.referencing_attribute || null,
        r.cascade_delete || null,
        r.cascade_assign || null
      );
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
      );
    });

    await tx.query(
      `
      INSERT INTO entity_relationships_flat (
        id, project_id, relationship_type, primary_entity, referencing_entity, referencing_attribute, cascade_delete, cascade_assign
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        relationship_type = EXCLUDED.relationship_type,
        primary_entity = EXCLUDED.primary_entity,
        referencing_entity = EXCLUDED.referencing_entity,
        referencing_attribute = EXCLUDED.referencing_attribute,
        cascade_delete = EXCLUDED.cascade_delete,
        cascade_assign = EXCLUDED.cascade_assign;
    `,
      values
    );
  }
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

  // Clear existing auxiliary child records if updating
  await tx.query('DELETE FROM web_resources WHERE project_id = $1;', [project.id]);
  await tx.query('DELETE FROM form_event_handlers WHERE project_id = $1;', [project.id]);
  await tx.query('DELETE FROM component_dependencies WHERE project_id = $1;', [project.id]);
  await tx.query('DELETE FROM flow_integrations WHERE project_id = $1;', [project.id]);
  await tx.query('DELETE FROM flow_triggers WHERE project_id = $1;', [project.id]);
  await tx.query('DELETE FROM hardcoded_literals WHERE project_id = $1;', [project.id]);
  await tx.query('DELETE FROM entity_relationships_flat WHERE project_id = $1;', [project.id]);

  // Insert auxiliary records from SolutionAST
  if (project.ast_json) {
    if (project.ast_json.web_resources?.length) {
      await insertWebResourcesTx(tx, project.id, project.ast_json.web_resources);
    }
    if (project.ast_json.form_event_handlers?.length) {
      await insertFormEventHandlersTx(tx, project.id, project.ast_json.form_event_handlers);
    }
    if (project.ast_json.dependencies?.length) {
      await insertComponentDependenciesTx(tx, project.id, project.ast_json.dependencies);
    }
    if (project.ast_json.flow_integrations?.length) {
      await insertFlowIntegrationsTx(tx, project.id, project.ast_json.flow_integrations);
    }
    if (project.ast_json.flow_triggers?.length) {
      await insertFlowTriggersTx(tx, project.id, project.ast_json.flow_triggers);
    }
    if (project.ast_json.hardcoded_literals?.length) {
      await insertHardcodedLiteralsTx(tx, project.id, project.ast_json.hardcoded_literals);
    }
    if (project.ast_json.entities?.length) {
      await insertFlattenedRelationshipsTx(tx, project.id, project.ast_json.entities);
    }
  }
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
  const wCount = await db.query<{ count: string }>(
    'SELECT count(*) as count FROM web_resources;'
  );
  const depCount = await db.query<{ count: string }>(
    'SELECT count(*) as count FROM component_dependencies;'
  );
  const intCount = await db.query<{ count: string }>(
    'SELECT count(*) as count FROM flow_integrations;'
  );

  return {
    project_count: parseInt(pCount.rows[0]?.count || '0', 10),
    document_count: parseInt(dCount.rows[0]?.count || '0', 10),
    chunk_count: parseInt(cCount.rows[0]?.count || '0', 10),
    web_resource_count: parseInt(wCount.rows[0]?.count || '0', 10),
    dependency_count: parseInt(depCount.rows[0]?.count || '0', 10),
    flow_integration_count: parseInt(intCount.rows[0]?.count || '0', 10),
  };
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.exec('DELETE FROM projects;');
}

/**
 * Queries component dependencies to evaluate blast radius or column/table impact.
 */
export async function queryComponentDependencies(
  projectId?: string,
  targetEntity?: string,
  targetField?: string,
  operationType?: string
): Promise<ComponentDependencyRecord[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(projectId);
  }
  if (targetEntity) {
    conditions.push(`target_entity = $${idx++}`);
    params.push(targetEntity.toLowerCase().trim());
  }
  if (targetField) {
    conditions.push(`target_field = $${idx++}`);
    params.push(targetField.toLowerCase().trim());
  }
  if (operationType) {
    conditions.push(`operation_type = $${idx++}`);
    params.push(operationType.toUpperCase().trim());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, project_id, source_type, source_id, source_name, location_detail,
           target_entity, target_field, operation_type, context_snippet, created_at
    FROM component_dependencies
    ${whereClause}
    ORDER BY source_name ASC, location_detail ASC;
  `;

  const res = await db.query<ComponentDependencyRecord>(query, params);
  return res.rows;
}

/**
 * Queries Cloud Flow integrations and connectors (e.g. Power BI, Dataverse, HTTP, etc.).
 */
export async function queryFlowIntegrations(
  projectId?: string,
  connectorFilter?: string,
  isPremium?: boolean
): Promise<FlowIntegrationRecord[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(projectId);
  }
  if (connectorFilter) {
    conditions.push(`(connector_name ILIKE $${idx} OR connector_id ILIKE $${idx})`);
    params.push(`%${connectorFilter.trim()}%`);
    idx++;
  }
  if (isPremium !== undefined) {
    conditions.push(`is_premium = $${idx++}`);
    params.push(isPremium);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, project_id, flow_id, flow_name, connector_id, connector_name,
           operation_id, action_name, is_premium, created_at
    FROM flow_integrations
    ${whereClause}
    ORDER BY flow_name ASC, action_name ASC;
  `;

  const res = await db.query<FlowIntegrationRecord>(query, params);
  return res.rows;
}

/**
 * Queries Cloud Flow triggers to detect runaway loops, missing filters, or entity change triggers.
 */
export async function queryFlowTriggers(
  projectId?: string,
  tableName?: string,
  missingFilterOnly?: boolean
): Promise<FlowTriggerRecord[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(projectId);
  }
  if (tableName) {
    conditions.push(`table_name ILIKE $${idx++}`);
    params.push(tableName.toLowerCase().trim());
  }
  if (missingFilterOnly) {
    conditions.push(`has_filter = false`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, project_id, flow_id, flow_name, trigger_type, table_name,
           change_type, filter_expression, has_filter, select_columns, created_at
    FROM flow_triggers
    ${whereClause}
    ORDER BY flow_name ASC;
  `;

  const res = await db.query<FlowTriggerRecord>(query, params);
  return res.rows;
}

/**
 * Queries Web Resources and client-side JavaScript/HTML assets.
 */
export async function queryWebResources(
  projectId?: string,
  resourceType?: string,
  deprecatedOnly?: boolean
): Promise<WebResourceRecord[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(projectId);
  }
  if (resourceType) {
    conditions.push(`resource_type ILIKE $${idx++}`);
    params.push(resourceType.trim());
  }
  if (deprecatedOnly) {
    conditions.push(`(uses_deprecated_xrm = true OR uses_direct_dom = true)`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, project_id, name, display_name, resource_type, description,
           file_size_bytes, content_text, detected_functions, uses_deprecated_xrm,
           uses_direct_dom, created_at
    FROM web_resources
    ${whereClause}
    ORDER BY name ASC;
  `;

  const res = await db.query<WebResourceRecord>(query, params);
  return res.rows;
}

/**
 * Queries Form Event Handlers (OnLoad, OnSave, OnChange) mapped to Dataverse forms and attributes.
 */
export async function queryFormEventHandlers(
  projectId?: string,
  entityName?: string,
  targetField?: string
): Promise<FormEventHandlerRecord[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(projectId);
  }
  if (entityName) {
    conditions.push(`entity_name = $${idx++}`);
    params.push(entityName.toLowerCase().trim());
  }
  if (targetField) {
    conditions.push(`(target_field = $${idx} OR target_field IS NULL)`);
    params.push(targetField.toLowerCase().trim());
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, project_id, entity_name, form_id, form_name, event_type,
           target_field, library_name, function_name, pass_execution_context, enabled, created_at
    FROM form_event_handlers
    ${whereClause}
    ORDER BY entity_name ASC, form_name ASC, event_type ASC;
  `;

  const res = await db.query<FormEventHandlerRecord>(query, params);
  return res.rows;
}

/**
 * Queries Hardcoded Literals (URLs, GUIDs, emails) across flows, apps, and scripts.
 */
export async function queryHardcodedLiterals(
  projectId?: string,
  literalType?: string
): Promise<HardcodedLiteralRecord[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(projectId);
  }
  if (literalType) {
    conditions.push(`literal_type = $${idx++}`);
    params.push(literalType.toUpperCase().trim());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, project_id, component_type, component_name, literal_type, value, code_context, created_at
    FROM hardcoded_literals
    ${whereClause}
    ORDER BY component_name ASC;
  `;

  const res = await db.query<HardcodedLiteralRecord>(query, params);
  return res.rows;
}

/**
 * Queries flattened Dataverse relationships for cascade rules and foreign keys.
 */
export async function queryEntityRelationshipsFlat(
  projectId?: string,
  entityName?: string
): Promise<Array<{
  id: string;
  project_id: string;
  relationship_type: string;
  primary_entity: string;
  referencing_entity: string;
  referencing_attribute?: string;
  cascade_delete?: string;
  cascade_assign?: string;
}>> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(projectId);
  }
  if (entityName) {
    const lower = entityName.toLowerCase().trim();
    conditions.push(`(primary_entity = $${idx} OR referencing_entity = $${idx})`);
    params.push(lower);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, project_id, relationship_type, primary_entity, referencing_entity,
           referencing_attribute, cascade_delete, cascade_assign
    FROM entity_relationships_flat
    ${whereClause}
    ORDER BY primary_entity ASC, referencing_entity ASC;
  `;

  const res = await db.query<any>(query, params);
  return res.rows;
}
