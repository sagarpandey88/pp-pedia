import { getDb } from '../db';
import { SLASH_COMMANDS, findSlashCommand } from '../agent/slashCommands';

export interface AutocompleteItem {
  id: string;
  label: string;
  insertText: string;
  detail?: string;
  category: 'command' | 'entity' | 'column' | 'connector' | 'flow' | 'doc' | 'literal';
  icon?: string;
}

export interface AutocompleteResult {
  active: boolean;
  prefix: string;
  items: AutocompleteItem[];
  replaceRange: { start: number; end: number };
}

/**
 * Autocomplete Dataverse table/entity names from PGlite
 */
export async function autocompleteEntities(
  projectId: string | undefined,
  prefix: string,
  limit = 8
): Promise<AutocompleteItem[]> {
  try {
    const db = await getDb();
    const searchPattern = `%${prefix.toLowerCase().trim()}%`;

    const query = `
      SELECT DISTINCT name, source FROM (
        SELECT target_entity AS name, 'Component Dependency' AS source
        FROM component_dependencies 
        WHERE ($1::text IS NULL OR project_id = $1) AND target_entity ILIKE $2
        UNION
        SELECT primary_entity AS name, 'Primary Relationship' AS source
        FROM entity_relationships_flat 
        WHERE ($1::text IS NULL OR project_id = $1) AND primary_entity ILIKE $2
        UNION
        SELECT referencing_entity AS name, 'Referencing Relationship' AS source
        FROM entity_relationships_flat 
        WHERE ($1::text IS NULL OR project_id = $1) AND referencing_entity ILIKE $2
      ) sub
      ORDER BY name ASC
      LIMIT $3;
    `;

    const res = await db.query<{ name: string; source: string }>(query, [
      projectId || null,
      searchPattern,
      limit,
    ]);

    return res.rows.map((r) => ({
      id: `entity_${r.name}`,
      label: r.name,
      insertText: r.name,
      detail: `Dataverse Table`,
      category: 'entity',
      icon: 'Database',
    }));
  } catch (err) {
    console.warn('PGlite entity autocomplete failed:', err);
    return [];
  }
}

/**
 * Autocomplete column/attribute names for a given entity from PGlite
 */
export async function autocompleteColumns(
  projectId: string | undefined,
  entityName: string,
  prefix: string,
  limit = 10
): Promise<AutocompleteItem[]> {
  try {
    const db = await getDb();
    const cleanEntity = entityName.toLowerCase().trim();
    const searchPattern = `%${prefix.toLowerCase().trim()}%`;

    const query = `
      SELECT DISTINCT col FROM (
        SELECT target_field AS col
        FROM component_dependencies
        WHERE ($1::text IS NULL OR project_id = $1)
          AND target_entity = $2
          AND target_field IS NOT NULL
          AND target_field ILIKE $3
        UNION
        SELECT referencing_attribute AS col
        FROM entity_relationships_flat
        WHERE ($1::text IS NULL OR project_id = $1)
          AND referencing_entity = $2
          AND referencing_attribute IS NOT NULL
          AND referencing_attribute ILIKE $3
        UNION
        SELECT target_field AS col
        FROM form_event_handlers
        WHERE ($1::text IS NULL OR project_id = $1)
          AND entity_name = $2
          AND target_field IS NOT NULL
          AND target_field ILIKE $3
      ) sub
      ORDER BY col ASC
      LIMIT $4;
    `;

    const res = await db.query<{ col: string }>(query, [
      projectId || null,
      cleanEntity,
      searchPattern,
      limit,
    ]);

    return res.rows.map((r) => ({
      id: `col_${cleanEntity}_${r.col}`,
      label: r.col,
      insertText: r.col,
      detail: `Column on ${cleanEntity}`,
      category: 'column',
      icon: 'Columns',
    }));
  } catch (err) {
    console.warn('PGlite column autocomplete failed:', err);
    return [];
  }
}

/**
 * Autocomplete connector names from flow_integrations in PGlite
 */
export async function autocompleteConnectors(
  projectId: string | undefined,
  prefix: string,
  limit = 8
): Promise<AutocompleteItem[]> {
  try {
    const db = await getDb();
    const searchPattern = `%${prefix.toLowerCase().trim()}%`;

    const query = `
      SELECT connector_name, count(DISTINCT flow_id) as flow_count
      FROM flow_integrations
      WHERE ($1::text IS NULL OR project_id = $1)
        AND connector_name ILIKE $2
      GROUP BY connector_name
      ORDER BY flow_count DESC, connector_name ASC
      LIMIT $3;
    `;

    const res = await db.query<{ connector_name: string; flow_count: string }>(query, [
      projectId || null,
      searchPattern,
      limit,
    ]);

    return res.rows.map((r) => ({
      id: `conn_${r.connector_name}`,
      label: r.connector_name,
      insertText: `"${r.connector_name}"`,
      detail: `${r.flow_count} flow(s)`,
      category: 'connector',
      icon: 'Workflow',
    }));
  } catch (err) {
    console.warn('PGlite connector autocomplete failed:', err);
    return [];
  }
}

/**
 * Autocomplete flow names from PGlite
 */
export async function autocompleteFlows(
  projectId: string | undefined,
  prefix: string,
  limit = 8
): Promise<AutocompleteItem[]> {
  try {
    const db = await getDb();
    const searchPattern = `%${prefix.toLowerCase().trim()}%`;

    const query = `
      SELECT DISTINCT flow_name
      FROM flow_integrations
      WHERE ($1::text IS NULL OR project_id = $1)
        AND flow_name ILIKE $2
      ORDER BY flow_name ASC
      LIMIT $3;
    `;

    const res = await db.query<{ flow_name: string }>(query, [
      projectId || null,
      searchPattern,
      limit,
    ]);

    return res.rows.map((r) => ({
      id: `flow_${r.flow_name}`,
      label: r.flow_name,
      insertText: `"${r.flow_name}"`,
      detail: `Cloud Flow`,
      category: 'flow',
      icon: 'GitBranch',
    }));
  } catch (err) {
    console.warn('PGlite flow autocomplete failed:', err);
    return [];
  }
}

/**
 * Autocomplete documents from PGlite
 */
export async function autocompleteDocuments(
  projectId: string | undefined,
  prefix: string,
  limit = 8
): Promise<AutocompleteItem[]> {
  try {
    const db = await getDb();
    const searchPattern = `%${prefix.toLowerCase().trim()}%`;

    const query = `
      SELECT slug, title, doc_type
      FROM documents
      WHERE ($1::text IS NULL OR project_id = $1)
        AND (slug ILIKE $2 OR title ILIKE $2)
      ORDER BY title ASC
      LIMIT $3;
    `;

    const res = await db.query<{ slug: string; title: string; doc_type: string }>(query, [
      projectId || null,
      searchPattern,
      limit,
    ]);

    return res.rows.map((r) => ({
      id: `doc_${r.slug}`,
      label: r.title,
      insertText: r.slug,
      detail: `Doc (${r.doc_type || 'markdown'})`,
      category: 'doc',
      icon: 'FileText',
    }));
  } catch (err) {
    console.warn('PGlite document autocomplete failed:', err);
    return [];
  }
}

/**
 * Parses user input in real time and computes relevant autocomplete items.
 */
export async function getAutocompleteSuggestions(
  input: string,
  projectId?: string
): Promise<AutocompleteResult> {
  if (!input.startsWith('/')) {
    return { active: false, prefix: '', items: [], replaceRange: { start: 0, end: 0 } };
  }

  // Parse tokenized arguments
  const rawAfterSlash = input.slice(1);
  const hasTrailingSpace = input.endsWith(' ');
  const parts = rawAfterSlash.trim().split(/\s+/).filter(Boolean);

  // If typing command name (e.g. "/" or "/imp")
  if (parts.length === 0 || (!hasTrailingSpace && parts.length === 1)) {
    const cmdPrefix = parts[0]?.toLowerCase() || '';
    const matchingCmds = SLASH_COMMANDS.filter((cmd) => {
      if (!cmdPrefix) return true;
      return (
        cmd.name.toLowerCase().startsWith(cmdPrefix) ||
        cmd.aliases.some((a) => a.toLowerCase().startsWith(cmdPrefix)) ||
        cmd.label.toLowerCase().includes(cmdPrefix)
      );
    });

    const items: AutocompleteItem[] = matchingCmds.map((cmd) => {
      const paramSyntax = cmd.parameters.map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`)).join(' ');
      return {
        id: `cmd_${cmd.name}`,
        label: `/${cmd.name} ${paramSyntax}`.trim(),
        insertText: `/${cmd.name} `,
        detail: cmd.description,
        category: 'command',
        icon: cmd.icon,
      };
    });

    return {
      active: items.length > 0,
      prefix: cmdPrefix,
      items,
      replaceRange: { start: 0, end: input.length },
    };
  }

  // We have a command specified and at least one space
  const commandName = parts[0].toLowerCase();
  const commandDef = findSlashCommand(commandName);

  if (!commandDef) {
    return { active: false, prefix: '', items: [], replaceRange: { start: 0, end: 0 } };
  }

  // Determine which parameter index is currently active
  const paramIndex = hasTrailingSpace ? parts.length - 1 : parts.length - 2;
  const currentToken = hasTrailingSpace ? '' : parts[parts.length - 1] || '';

  const paramDef = commandDef.parameters[paramIndex];
  if (!paramDef || !paramDef.autocompleteType) {
    return { active: false, prefix: '', items: [], replaceRange: { start: 0, end: 0 } };
  }

  const lastTokenStart = input.lastIndexOf(currentToken);
  const replaceRange = {
    start: lastTokenStart >= 0 ? lastTokenStart : input.length,
    end: input.length,
  };

  let items: AutocompleteItem[] = [];

  switch (paramDef.autocompleteType) {
    case 'entity': {
      items = await autocompleteEntities(projectId, currentToken);
      break;
    }
    case 'column': {
      const entityArg = parts[1]?.replace(/['"]/g, '') || '';
      if (entityArg) {
        items = await autocompleteColumns(projectId, entityArg, currentToken);
      }
      break;
    }
    case 'connector': {
      items = await autocompleteConnectors(projectId, currentToken);
      break;
    }
    case 'flow': {
      items = await autocompleteFlows(projectId, currentToken);
      break;
    }
    case 'doc': {
      items = await autocompleteDocuments(projectId, currentToken);
      break;
    }
    case 'literal': {
      const literals = ['GUID', 'URL', 'EMAIL'];
      items = literals
        .filter((l) => l.toLowerCase().startsWith(currentToken.toLowerCase()))
        .map((l) => ({
          id: `lit_${l}`,
          label: l,
          insertText: l,
          detail: `Filter literals by ${l}`,
          category: 'literal',
          icon: 'Lock',
        }));
      break;
    }
  }

  return {
    active: items.length > 0,
    prefix: currentToken,
    items,
    replaceRange,
  };
}
