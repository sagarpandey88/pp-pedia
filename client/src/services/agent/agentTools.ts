import { tool } from '@openai/agents';
import { z } from 'zod';
import { embedQuery } from '../embeddingService';
import {
  querySimilarChunks,
  getDocuments,
  findDocumentBySlugOrId,
  getAllDocuments,
  getProjects,
  getProject,
  queryComponentDependencies,
  queryFlowIntegrations,
  queryFlowTriggers,
  queryWebResources,
  queryFormEventHandlers,
  queryHardcodedLiterals,
  queryEntityRelationshipsFlat,
} from '../db';
import { SimilarityResult } from '../../types/db';
import { AgentExecutionContext, AgentActivityStep } from './agentTypes';
import { logger } from '../logger';

function extractHeadingSection(markdown: string, headingQuery: string): string {
  const lines = markdown.split('\n');
  const targetLower = headingQuery.toLowerCase().trim();
  let capturing = false;
  let captureLevel = 0;
  const capturedLines: string[] = [];

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      const level = match[1].length;
      const title = match[2].toLowerCase();

      if (capturing) {
        if (level <= captureLevel) {
          // Reached next section of equal or higher importance
          break;
        }
      } else if (title.includes(targetLower)) {
        capturing = true;
        captureLevel = level;
      }
    }

    if (capturing) {
      capturedLines.push(line);
    }
  }

  return capturedLines.length > 0 ? capturedLines.join('\n') : markdown;
}

function startStep(
  context: AgentExecutionContext | undefined,
  toolName: string,
  label: string,
  args?: Record<string, unknown>
): { stepId: string; startTime: number } {
  const stepId = `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const startTime = performance.now();
  if (context) {
    const newStep: AgentActivityStep = {
      id: stepId,
      toolName,
      label,
      status: 'running',
      args,
    };
    context.steps.push(newStep);
    context.onActivity?.([...context.steps]);
  }
  return { stepId, startTime };
}

function finishStep(
  context: AgentExecutionContext | undefined,
  stepId: string,
  startTime: number,
  outputSummary: string,
  isError = false,
  outputDetails?: string
) {
  const duration = Math.round(performance.now() - startTime);
  if (context) {
    const step = context.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = isError ? 'failed' : 'completed';
      step.outputSummary = outputSummary;
      if (outputDetails !== undefined) {
        step.outputDetails = outputDetails;
      }
      step.durationMs = duration;
      context.onActivity?.([...context.steps]);
    }
  }
}

export function createSemanticSearchTool() {
  return tool({
    name: 'semantic_search',
    description:
      'Search documentation chunks using hybrid dense vector similarity + lexical keyword search. ' +
      'Returns relevant excerpts with document titles, heading context, and similarity scores. ' +
      'Use this to find specific topics, concepts, and sections across solution documentation.',
    parameters: z.object({
      query: z
        .string()
        .describe('The search query or concept, e.g. "Invoice Approval flow" or "Dataverse customer account columns"'),
      limit: z
        .number()
        .optional()
        .default(6)
        .describe('Maximum number of top chunks to return (1-10)'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution/project ID to scope the search to a single solution'),
    }),
    execute: async ({ query, limit = 6, projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const { stepId, startTime } = startStep(
        context,
        'semantic_search',
        `Searching documentation for "${query}"`,
        { query, limit, projectId: targetProjectId }
      );

      try {
        const queryVector = await embedQuery(query);
        const results = await querySimilarChunks(queryVector, targetProjectId, limit, query);

        if (context) {
          // Merge citations uniquely
          for (const item of results) {
            if (!context.citations.some((c) => c.id === item.id)) {
              context.citations.push(item);
            }
          }
        }

        if (results.length === 0) {
          finishStep(context, stepId, startTime, 'No matching chunks found');
          return `No documentation chunks found matching query "${query}".`;
        }

        finishStep(context, stepId, startTime, `Found ${results.length} relevant chunks`);

        const formatted = results.map((r, i) => {
          return `[Result ${i + 1}] (Document: "${r.title}", Section: "${r.heading_context || 'General'}", Solution: "${r.project_name}", Similarity: ${(r.similarity * 100).toFixed(1)}%)\nExcerpt: ${r.chunk_content}`;
        });

        return formatted.join('\n\n---\n\n');
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error during semantic search: ${err?.message || err}`;
      }
    },
  });
}

export function createListDocumentsTool() {
  return tool({
    name: 'list_documents',
    description:
      'List all generated documentation (.md) files in IndexedDB for a given solution or across all solutions. ' +
      'Returns document title, slug, doc_type, and ID. Use this to discover available markdown files before reading them.',
    parameters: z.object({
      projectId: z
        .string()
        .optional()
        .describe('Optional solution/project ID to filter documents by'),
    }),
    execute: async ({ projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const { stepId, startTime } = startStep(
        context,
        'list_documents',
        targetProjectId ? `Listing documents for solution ${targetProjectId}` : 'Listing all documents',
        { projectId: targetProjectId }
      );

      try {
        const docs = targetProjectId
          ? await getDocuments(targetProjectId)
          : await getAllDocuments();

        if (docs.length === 0) {
          finishStep(context, stepId, startTime, '0 documents found');
          return 'No documents found in the database.';
        }

        finishStep(context, stepId, startTime, `Found ${docs.length} documents`);

        const list = docs.map((d) => ({
          id: d.id,
          title: d.title,
          slug: d.slug,
          doc_type: d.doc_type,
          project_id: d.project_id,
        }));

        return JSON.stringify(list, null, 2);
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error listing documents: ${err?.message || err}`;
      }
    },
  });
}

export function createReadDocumentMarkdownTool() {
  return tool({
    name: 'read_document_markdown',
    description:
      'Read the full or sectional markdown content of a documentation file from IndexedDB by its slug or ID. ' +
      'Use this when you need complete document context instead of just search snippets. ' +
      'Optionally specify section_heading or max_lines to manage context.',
    parameters: z.object({
      slug_or_id: z
        .string()
        .describe('Document slug (e.g. "overview", "dataverse", "flow-process-invoice") or document ID'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution/project ID'),
      section_heading: z
        .string()
        .optional()
        .describe('Optional heading text to extract only that section of the document'),
      max_lines: z
        .number()
        .optional()
        .default(250)
        .describe('Maximum lines of markdown to return (default 250, max 600)'),
    }),
    execute: async ({ slug_or_id, projectId, section_heading, max_lines = 250 }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const { stepId, startTime } = startStep(
        context,
        'read_document_markdown',
        `Reading document "${slug_or_id}"${section_heading ? ` (section "${section_heading}")` : ''}`,
        { slug_or_id, projectId: targetProjectId, section_heading, max_lines }
      );

      try {
        const doc = await findDocumentBySlugOrId(slug_or_id, targetProjectId);
        if (!doc) {
          finishStep(context, stepId, startTime, `Document "${slug_or_id}" not found`, true);
          return `Document "${slug_or_id}" not found in database. Use list_documents to see available files.`;
        }

        let content = doc.content_markdown;
        if (section_heading) {
          content = extractHeadingSection(content, section_heading);
        }

        const lines = content.split('\n');
        const totalLines = lines.length;
        const cappedLimit = Math.min(Math.max(max_lines, 20), 600);

        let resultMarkdown: string;
        if (totalLines > cappedLimit) {
          resultMarkdown = `${lines.slice(0, cappedLimit).join('\n')}\n\n... [Note: Truncated to ${cappedLimit} lines of ${totalLines} total lines. Specify a specific section_heading to view other sections.]`;
        } else {
          resultMarkdown = content;
        }

        // Add to citations so the user can navigate to this doc directly
        if (context) {
          const pseudoCitation: SimilarityResult = {
            id: `doc_${doc.id}`,
            chunk_content: content.slice(0, 300) + '...',
            heading_context: section_heading || 'Full Document',
            title: doc.title,
            slug: doc.slug,
            project_id: doc.project_id,
            project_name: 'Solution Documentation',
            similarity: 1.0,
          };
          if (!context.citations.some((c) => c.slug === doc.slug && c.project_id === doc.project_id)) {
            context.citations.push(pseudoCitation);
          }
        }

        finishStep(context, stepId, startTime, `Read ${doc.title} (${Math.min(totalLines, cappedLimit)} lines)`);

        return `# Document: ${doc.title} (${doc.slug})\n\n${resultMarkdown}`;
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error reading document: ${err?.message || err}`;
      }
    },
  });
}

export function createInspectDataverseEntityTool() {
  return tool({
    name: 'inspect_dataverse_entity',
    description:
      'Directly inspect a Dataverse table schema from the parsed solution AST in IndexedDB. ' +
      'Returns table display name, schema name, primary attributes, all columns with types and option sets, and 1:N / N:1 / N:N relationships.',
    parameters: z.object({
      entity_name: z
        .string()
        .describe('Logical name or display name of the Dataverse table, e.g. "account", "cr_invoice", or "Invoice"'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution ID. If omitted, uses active solution or searches all solutions.'),
    }),
    execute: async ({ entity_name, projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const { stepId, startTime } = startStep(
        context,
        'inspect_dataverse_entity',
        `Inspecting Dataverse entity "${entity_name}"`,
        { entity_name, projectId: targetProjectId }
      );

      try {
        const queryLower = entity_name.toLowerCase().trim();
        const projects = targetProjectId
          ? [await getProject(targetProjectId)].filter(Boolean)
          : await getProjects();

        for (const proj of projects) {
          if (!proj?.ast_json?.entities) continue;
          const matched = proj.ast_json.entities.find(
            (e) =>
              e.logical_name.toLowerCase() === queryLower ||
              e.display_name.toLowerCase() === queryLower ||
              (e.schema_name && e.schema_name.toLowerCase() === queryLower)
          );

          if (matched) {
            finishStep(context, stepId, startTime, `Found entity ${matched.display_name} (${matched.attributes.length} attributes)`);
            return JSON.stringify(
              {
                solution: proj.display_name,
                display_name: matched.display_name,
                logical_name: matched.logical_name,
                schema_name: matched.schema_name,
                description: matched.description || null,
                primary_id_attribute: matched.primary_id_attribute,
                primary_name_attribute: matched.primary_name_attribute,
                attributes_count: matched.attributes.length,
                attributes: matched.attributes.map((a) => ({
                  logical_name: a.logical_name,
                  display_name: a.display_name,
                  type: a.type,
                  format: a.format || null,
                  required: a.required_level || 'None',
                  lookup_target: a.lookup_target_entity || null,
                  options: a.options?.map((o) => `${o.label} (${o.value})`) || null,
                })),
                relationships: matched.relationships.map((r) => ({
                  type: r.relationship_type,
                  schema_name: r.schema_name,
                  primary_entity: r.primary_entity,
                  referencing_entity: r.referencing_entity,
                  referencing_attribute: r.referencing_attribute || null,
                })),
              },
              null,
              2
            );
          }
        }

        // If not found, list available entities in the first available project
        const availableEntities = projects[0]?.ast_json?.entities?.map((e) => `${e.display_name} (${e.logical_name})`) || [];
        finishStep(context, stepId, startTime, `Entity "${entity_name}" not found`, true);
        return `Entity "${entity_name}" not found. Available entities in solution: ${availableEntities.slice(0, 30).join(', ')}`;
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error inspecting Dataverse entity: ${err?.message || err}`;
      }
    },
  });
}

export function createInspectCloudFlowTool() {
  return tool({
    name: 'inspect_cloud_flow',
    description:
      'Inspect a Power Automate Cloud Flow from the parsed solution AST. ' +
      'Returns trigger definition, action breakdown, run_after dependency hierarchy, and connection references.',
    parameters: z.object({
      flow_name: z
        .string()
        .describe('Name, display name, or partial title of the Cloud Flow'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution ID'),
    }),
    execute: async ({ flow_name, projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const { stepId, startTime } = startStep(
        context,
        'inspect_cloud_flow',
        `Inspecting Cloud Flow "${flow_name}"`,
        { flow_name, projectId: targetProjectId }
      );

      try {
        const queryLower = flow_name.toLowerCase().trim();
        const projects = targetProjectId
          ? [await getProject(targetProjectId)].filter(Boolean)
          : await getProjects();

        for (const proj of projects) {
          if (!proj?.ast_json?.flows) continue;
          const matched = proj.ast_json.flows.find(
            (f) =>
              (f.display_name && f.display_name.toLowerCase().includes(queryLower)) ||
              f.name.toLowerCase().includes(queryLower) ||
              f.id.toLowerCase() === queryLower
          );

          if (matched) {
            finishStep(context, stepId, startTime, `Found flow "${matched.display_name || matched.name}"`);
            return JSON.stringify(
              {
                solution: proj.display_name,
                name: matched.name,
                display_name: matched.display_name || matched.name,
                status: matched.status || 'Active',
                triggers: matched.triggers.map((t) => ({
                  name: t.name,
                  type: t.type,
                  kind: t.kind || null,
                  recurrence: t.recurrence || null,
                  filter_expression: t.filter_expression || null,
                })),
                actions_count: matched.actions.length,
                actions: matched.actions.map((a) => ({
                  name: a.name,
                  type: a.type,
                  description: a.description || null,
                  run_after: a.run_after || null,
                })),
                connection_references: matched.connection_references || [],
              },
              null,
              2
            );
          }
        }

        const availableFlows = projects[0]?.ast_json?.flows?.map((f) => f.display_name || f.name) || [];
        finishStep(context, stepId, startTime, `Flow "${flow_name}" not found`, true);
        return `Flow "${flow_name}" not found. Available flows: ${availableFlows.join(', ')}`;
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error inspecting Cloud Flow: ${err?.message || err}`;
      }
    },
  });
}

export function createInspectCanvasAppTool() {
  return tool({
    name: 'inspect_canvas_app',
    description:
      'Inspect a Canvas App definition from the parsed solution AST in IndexedDB. ' +
      'Returns screen names, control components count, and key formulas.',
    parameters: z.object({
      app_name: z
        .string()
        .describe('Name or partial title of the Canvas App'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution ID'),
    }),
    execute: async ({ app_name, projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const { stepId, startTime } = startStep(
        context,
        'inspect_canvas_app',
        `Inspecting Canvas App "${app_name}"`,
        { app_name, projectId: targetProjectId }
      );

      try {
        const queryLower = app_name.toLowerCase().trim();
        const projects = targetProjectId
          ? [await getProject(targetProjectId)].filter(Boolean)
          : await getProjects();

        for (const proj of projects) {
          if (!proj?.ast_json?.canvas_apps) continue;
          const matched = proj.ast_json.canvas_apps.find(
            (a) =>
              (a.display_name && a.display_name.toLowerCase().includes(queryLower)) ||
              a.name.toLowerCase().includes(queryLower)
          );

          if (matched) {
            finishStep(context, stepId, startTime, `Found Canvas App "${matched.display_name || matched.name}"`);
            return JSON.stringify(
              {
                solution: proj.display_name,
                name: matched.name,
                display_name: matched.display_name || matched.name,
                screens_count: matched.screens?.length || 0,
                screens: matched.screens?.map((s) => ({
                  name: s.name,
                  controls_count: s.controls?.length || 0,
                  controls: s.controls?.map((c) => ({ name: c.name, type: c.type })),
                })) || [],
              },
              null,
              2
            );
          }
        }

        finishStep(context, stepId, startTime, `App "${app_name}" not found`, true);
        return `Canvas App "${app_name}" not found in solution.`;
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error inspecting Canvas App: ${err?.message || err}`;
      }
    },
  });
}

export function createListSolutionsTool() {
  return tool({
    name: 'list_solutions',
    description:
      'List all Power Platform solutions stored in IndexedDB. ' +
      'Returns solution display names, unique names, versions, publisher, and component statistics (entity count, flow count, app count).',
    parameters: z.object({
      filter: z.string().optional().describe('Optional filter text'),
    }),
    execute: async ({ filter }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const { stepId, startTime } = startStep(
        context,
        'list_solutions',
        'Listing Power Platform solutions in database',
        { filter }
      );

      try {
        const projects = await getProjects();
        const filtered = filter
          ? projects.filter(
              (p) =>
                p.display_name.toLowerCase().includes(filter.toLowerCase()) ||
                p.unique_name.toLowerCase().includes(filter.toLowerCase())
            )
          : projects;

        finishStep(context, stepId, startTime, `Found ${filtered.length} solutions`);

        const summary = filtered.map((p) => ({
          id: p.id,
          display_name: p.display_name,
          unique_name: p.unique_name,
          version: p.version,
          publisher: p.publisher_name || 'Default',
          is_managed: p.is_managed,
          stats: {
            entities: p.stats?.entity_count ?? p.ast_json?.entities?.length ?? 0,
            flows: p.stats?.flow_count ?? p.ast_json?.flows?.length ?? 0,
            canvas_apps: p.stats?.canvas_app_count ?? p.ast_json?.canvas_apps?.length ?? 0,
          },
        }));

        return JSON.stringify(summary, null, 2);
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error listing solutions: ${err?.message || err}`;
      }
    },
  });
}

export function createAnalyzeColumnImpactTool() {
  return tool({
    name: 'analyze_column_impact',
    description:
      'Analyze the downstream blast radius and impact of modifying, deleting, or refactoring a Dataverse column/attribute. ' +
      'Queries relational dependencies across Cloud Flows, Canvas Apps, JavaScript Web Resources, Form Event Handlers, and Entity Relationships.',
    parameters: z.object({
      entity_name: z
        .string()
        .describe('Logical name or schema name of the Dataverse table, e.g. "account", "contoso_ticket"'),
      column_name: z
        .string()
        .describe('Logical name of the column/attribute to evaluate, e.g. "contoso_prioritycode", "telephone1"'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution/project ID to scope the analysis'),
    }),
    execute: async ({ entity_name, column_name, projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const cleanEntity = entity_name.toLowerCase().trim();
      const cleanCol = column_name.toLowerCase().trim();

      const { stepId, startTime } = startStep(
        context,
        'analyze_column_impact',
        `Analyzing impact of column "${cleanCol}" on entity "${cleanEntity}"`,
        { entity_name: cleanEntity, column_name: cleanCol, projectId: targetProjectId }
      );

      try {
        // 1. Direct dependencies
        const deps = await queryComponentDependencies(targetProjectId, cleanEntity, cleanCol);

        // 2. Form event handlers
        const formHandlers = await queryFormEventHandlers(targetProjectId, cleanEntity, cleanCol);

        // 3. Relationships where this is foreign key
        const rels = await queryEntityRelationshipsFlat(targetProjectId, cleanEntity);
        const fkRels = rels.filter(
          (r) => r.referencing_attribute && r.referencing_attribute.toLowerCase() === cleanCol
        );

        const totalImpacts = deps.length + formHandlers.length + fkRels.length;

        // Group dependencies by source type
        const flowDeps = deps.filter((d) => d.source_type === 'flow');
        const appDeps = deps.filter((d) => d.source_type === 'canvas_app');
        const jsDeps = deps.filter((d) => d.source_type === 'javascript');

        let riskLevel = 'Low';
        if (fkRels.length > 0) riskLevel = 'CRITICAL (Foreign Key)';
        else if (jsDeps.length > 0 || flowDeps.some((f) => f.operation_type === 'WRITE')) riskLevel = 'HIGH';
        else if (flowDeps.length > 0 || appDeps.length > 0) riskLevel = 'MEDIUM';

        finishStep(
          context,
          stepId,
          startTime,
          `Found ${totalImpacts} dependencies across components (Risk: ${riskLevel})`
        );

        const reportLines = [
          `### Blast Radius Analysis: \`${cleanEntity}.${cleanCol}\``,
          `- **Overall Risk Level**: **${riskLevel}**`,
          `- **Total Dependencies**: **${totalImpacts}**`,
          "",
        ];

        if (totalImpacts === 0) {
          reportLines.push(`✅ **Safe to Modify/Delete**: No active Cloud Flows, Canvas Apps, JavaScript Scripts, Form Event Handlers, or Foreign Keys reference this column.`);
        } else {
          reportLines.push("| Component Type | Name | Operation | Location / Detail |");
          reportLines.push("| :--- | :--- | :--- | :--- |");

          for (const f of flowDeps) {
            reportLines.push(`| **Cloud Flow** | ${f.source_name} | ${f.operation_type} | ${f.location_detail || "Action"} |`);
          }
          for (const a of appDeps) {
            reportLines.push(`| **Canvas App** | ${a.source_name} | ${a.operation_type} | ${a.location_detail || "Control / Formula"} |`);
          }
          for (const j of jsDeps) {
            reportLines.push(`| **JavaScript** | ${j.source_name} | ${j.operation_type} | ${j.location_detail || "Script"} |`);
          }
          for (const h of formHandlers) {
            reportLines.push(`| **Form Event** | ${h.form_name} | ${h.event_type} | Function: \`${h.function_name}\` (${h.library_name}) |`);
          }
          for (const r of fkRels) {
            reportLines.push(`| **Foreign Key** | ${r.referencing_entity} $\\rightarrow$ ${r.primary_entity} | RELATION | FK: \`${r.referencing_attribute || "N/A"}\` (Cascade: ${r.cascade_delete || "None"}) |`);
          }

          reportLines.push("");
          if (fkRels.length > 0) {
            reportLines.push(`⚠️ **Architect Warning**: This column is an active Foreign Key. Deleting it will break relationship integrity.`);
          } else if (flowDeps.some((f) => f.operation_type === "WRITE")) {
            reportLines.push(`⚠️ **Action Required**: Automated Cloud Flows write to this column. Update or remove the write operations first.`);
          }
        }

        return reportLines.join("\n");
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error analyzing column impact: ${err?.message || err}`;
      }
    },
  });
}

export function createAnalyzeValidationImpactTool() {
  return tool({
    name: 'analyze_validation_impact',
    description:
      'Analyze the impact of adding validation rules, restrictions, or making a field required on a Dataverse table. ' +
      'Evaluates all automated Cloud Flows, Canvas Apps, and JavaScript scripts that perform write operations on the table.',
    parameters: z.object({
      entity_name: z
        .string()
        .describe('Logical name of the Dataverse table, e.g. "account", "contoso_ticket"'),
      column_name: z
        .string()
        .describe('The column/attribute where validation or required level is being added'),
      validation_type: z
        .string()
        .optional()
        .default('required')
        .describe('Type of validation: "required", "restricted_values", "range", or "regex"'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution/project ID'),
    }),
    execute: async ({ entity_name, column_name, validation_type = 'required', projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const cleanEntity = entity_name.toLowerCase().trim();
      const cleanCol = column_name.toLowerCase().trim();

      const { stepId, startTime } = startStep(
        context,
        'analyze_validation_impact',
        `Analyzing validation impact of "${cleanCol}" on table "${cleanEntity}"`,
        { entity_name: cleanEntity, column_name: cleanCol, validation_type, projectId: targetProjectId }
      );

      try {
        // Query all WRITE operations on this table
        const writeDeps = await queryComponentDependencies(targetProjectId, cleanEntity, undefined, 'WRITE');

        // Check which writes explicitly provide this column
        const columnWrites = await queryComponentDependencies(targetProjectId, cleanEntity, cleanCol, 'WRITE');
        const writingSources = new Set(columnWrites.map((w) => w.source_id));

        // Sources that write to this table but do NOT provide this column
        const tableLevelWrites = writeDeps.filter((w) => !w.target_field);
        const atRiskSources = tableLevelWrites.filter((w) => !writingSources.has(w.source_id));

        // Form event handlers
        const formHandlers = await queryFormEventHandlers(targetProjectId, cleanEntity, cleanCol);

        const result = {
          entity: cleanEntity,
          column: cleanCol,
          validation_type,
          summary: `Evaluated ${writeDeps.length} write operations on ${cleanEntity}.`,
          components_writing_this_field: columnWrites.map((w) => ({
            source_type: w.source_type,
            name: w.source_name,
            location: w.location_detail,
            snippet: w.context_snippet,
          })),
          components_writing_table_without_this_field: atRiskSources.map((w) => ({
            source_type: w.source_type,
            name: w.source_name,
            location: w.location_detail,
            risk_warning: `Performs ${w.operation_type} on ${cleanEntity} without setting ${cleanCol}. If ${cleanCol} is made required, this operation will fail with runtime validation error.`,
          })),
          client_scripts_enforcing_field: formHandlers.map((h) => ({
            form_name: h.form_name,
            event_type: h.event_type,
            library: h.library_name,
            function: h.function_name,
          })),
        };

        finishStep(
          context,
          stepId,
          startTime,
          `Identified ${atRiskSources.length} potential contract breach points and ${columnWrites.length} existing writers`
        );

        return JSON.stringify(result, null, 2);
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error analyzing validation impact: ${err?.message || err}`;
      }
    },
  });
}

export function createQueryFlowIntegrationsTool() {
  return tool({
    name: 'query_flow_integrations',
    description:
      'Find all Cloud Flows that connect to external services, APIs, or connectors (e.g. "Power BI", "Dataverse", "Teams", "SQL Server", "HTTP") and filter by premium licensing status.',
    parameters: z.object({
      connector_filter: z
        .string()
        .optional()
        .describe('Connector name or keyword to search for, e.g. "Power BI", "Dataverse", "HTTP", "SharePoint"'),
      is_premium: z
        .boolean()
        .optional()
        .describe('Optional flag to filter only premium connectors (true) or standard connectors (false)'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution/project ID'),
    }),
    execute: async ({ connector_filter, is_premium, projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;

      const { stepId, startTime } = startStep(
        context,
        'query_flow_integrations',
        `Querying flow integrations for connector "${connector_filter || 'all'}"`,
        { connector_filter, is_premium, projectId: targetProjectId }
      );

      try {
        const rows = await queryFlowIntegrations(targetProjectId, connector_filter, is_premium);

        if (rows.length === 0) {
          finishStep(context, stepId, startTime, '0 integrations found');
          return `No flow integrations found matching connector "${connector_filter || 'any'}".`;
        }

        // Group by flow
        const flowMap = new Map<string, Array<{ action: string; connector: string; is_premium: boolean; op: string }>>();
        for (const r of rows) {
          if (!flowMap.has(r.flow_name)) flowMap.set(r.flow_name, []);
          flowMap.get(r.flow_name)!.push({
            action: r.action_name,
            connector: r.connector_name,
            is_premium: r.is_premium,
            op: r.operation_id || 'Action',
          });
        }

        const totalFlows = flowMap.size;
        const totalActions = rows.length;
        const hasPremium = rows.some((r) => r.is_premium);

        finishStep(
          context,
          stepId,
          startTime,
          `Found ${totalActions} connector actions across ${totalFlows} flows`
        );

        const flowList = Array.from(flowMap.entries())
          .map(([flowName, actions]) => {
            const actionSummaries = actions
              .map((a) => `\`${a.action}\` (${a.connector}${a.is_premium ? " [Premium]" : ""})`)
              .join(", ");
            return `- **${flowName}** (${actions.length} action${actions.length > 1 ? "s" : ""}): ${actionSummaries}`;
          })
          .join("\n");

        const summaryMarkdown = [
          `### Flow Integration Findings for "${connector_filter || "All Connectors"}"`,
          `- **Total Flows Using Connector**: **${totalFlows} flow${totalFlows > 1 ? "s" : ""}**`,
          `- **Total Connector Actions**: **${totalActions} action${totalActions > 1 ? "s" : ""}**`,
          `- **Licensing Requirement**: ${hasPremium ? "**Premium** (Power Automate Standalone license required)" : "**Standard** (Included with Office 365 / Power Apps)"}`,
          "",
          "#### Affected Cloud Flows:",
          flowList,
        ].join("\n");

        return summaryMarkdown;
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error querying flow integrations: ${err?.message || err}`;
      }
    },
  });
}

export function createAuditWebResourcesTool() {
  return tool({
    name: 'audit_web_resources',
    description:
      'Audit client-side Web Resources (JavaScript, HTML, CSS) in the solution for modernization health (deprecated Xrm.Page APIs, unsupported direct DOM manipulation) and inspect registered form event handlers.',
    parameters: z.object({
      audit_type: z
        .enum(['all', 'deprecated_xrm', 'direct_dom', 'event_handlers'])
        .optional()
        .default('all')
        .describe('Type of audit to execute'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution/project ID'),
    }),
    execute: async ({ audit_type = 'all', projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;

      const { stepId, startTime } = startStep(
        context,
        'audit_web_resources',
        `Auditing Web Resources (${audit_type})`,
        { audit_type, projectId: targetProjectId }
      );

      try {
        const deprecatedOnly = audit_type === 'deprecated_xrm' || audit_type === 'direct_dom';
        const webRes = await queryWebResources(targetProjectId, undefined, deprecatedOnly);
        const formEvents = await queryFormEventHandlers(targetProjectId);

        let filteredRes = webRes;
        if (audit_type === 'deprecated_xrm') {
          filteredRes = webRes.filter((w) => w.uses_deprecated_xrm);
        } else if (audit_type === 'direct_dom') {
          filteredRes = webRes.filter((w) => w.uses_direct_dom);
        }

        const result = {
          audit_type,
          web_resources_count: filteredRes.length,
          web_resources: filteredRes.map((w) => ({
            name: w.name,
            type: w.resource_type,
            size_bytes: w.file_size_bytes,
            uses_deprecated_xrm: w.uses_deprecated_xrm,
            uses_direct_dom: w.uses_direct_dom,
            detected_functions: w.detected_functions || [],
          })),
          form_event_handlers_count: formEvents.length,
          form_event_handlers: formEvents.map((f) => ({
            entity: f.entity_name,
            form: f.form_name,
            event: f.event_type,
            target_field: f.target_field || null,
            library: f.library_name,
            function: f.function_name,
            pass_execution_context: f.pass_execution_context,
          })),
        };

        finishStep(
          context,
          stepId,
          startTime,
          `Audited ${filteredRes.length} web resources and ${formEvents.length} event handlers`
        );

        return JSON.stringify(result, null, 2);
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error auditing web resources: ${err?.message || err}`;
      }
    },
  });
}

export function createAuditHardcodedLiteralsTool() {
  return tool({
    name: 'audit_hardcoded_literals',
    description:
      'Audit hardcoded environment-specific literals (GUIDs, URLs, emails) across Cloud Flows, Canvas Apps, and JavaScript scripts to ensure ALM readiness and portability between Dev, Test, and Prod environments.',
    parameters: z.object({
      literal_type: z
        .enum(['ALL', 'GUID', 'URL', 'EMAIL'])
        .optional()
        .default('ALL')
        .describe('Type of literal to audit'),
      projectId: z
        .string()
        .optional()
        .describe('Optional solution/project ID'),
    }),
    execute: async ({ literal_type = 'ALL', projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;

      const { stepId, startTime } = startStep(
        context,
        'audit_hardcoded_literals',
        `Auditing hardcoded literals (${literal_type})`,
        { literal_type, projectId: targetProjectId }
      );

      try {
        const typeFilter = literal_type === 'ALL' ? undefined : literal_type;
        const rows = await queryHardcodedLiterals(targetProjectId, typeFilter);

        const result = {
          literal_type,
          total_count: rows.length,
          literals: rows.map((r) => ({
            component_type: r.component_type,
            component_name: r.component_name,
            type: r.literal_type,
            value: r.value,
            code_context: r.code_context,
          })),
        };

        finishStep(context, stepId, startTime, `Found ${rows.length} hardcoded literals`);
        return JSON.stringify(result, null, 2);
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error auditing hardcoded literals: ${err?.message || err}`;
      }
    },
  });
}

export function createCountSolutionComponentsTool() {
  return tool({
    name: 'count_solution_components',
    description:
      'Provides exact quantitative counts and breakdown of components in the solution. ' +
      'Use this whenever the user asks "how many" flows, tables, canvas apps, environment variables, or web resources exist.',
    parameters: z.object({
      component_type: z
        .enum(['all', 'flows', 'tables', 'canvas_apps', 'environment_variables', 'web_resources'])
        .optional()
        .default('all')
        .describe('Specific component type to count, or "all" for full breakdown'),
      projectId: z.string().optional().describe('Optional solution/project ID'),
    }),
    execute: async ({ component_type = 'all', projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;

      const { stepId, startTime } = startStep(
        context,
        'count_solution_components',
        `Counting solution components (${component_type})`,
        { component_type, projectId: targetProjectId }
      );

      try {
        const project = targetProjectId ? await getProject(targetProjectId) : (await getProjects())[0];
        if (!project) {
          finishStep(context, stepId, startTime, 'No active project found', true);
          return 'No solution or project found in local database.';
        }

        const stats = project.stats || {
          entity_count: 0,
          flow_count: 0,
          canvas_app_count: 0,
          env_var_count: 0,
          relationship_count: 0,
          option_set_count: 0,
          web_resource_count: 0,
        };

        const solutionName = project.display_name || project.unique_name || 'Power Platform Solution';
        const lines = [
          `### Component Counts for "${solutionName}"`,
          `- **Dataverse Tables (Entities)**: **${stats.entity_count}**`,
          `- **Cloud Flows**: **${stats.flow_count}**`,
          `- **Canvas Apps**: **${stats.canvas_app_count}**`,
          `- **Environment Variables**: **${stats.env_var_count}**`,
          `- **JavaScript Web Resources**: **${stats.web_resource_count || 0}**`,
        ];

        finishStep(
          context,
          stepId,
          startTime,
          `${stats.flow_count} flows, ${stats.entity_count} tables, ${stats.canvas_app_count} apps`
        );

        return lines.join('\n');
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error counting solution components: ${err?.message || err}`;
      }
    },
  });
}

export function createFindFlowsByTriggerTool() {
  return tool({
    name: 'find_flows_by_trigger',
    description:
      'Finds Cloud Flows that trigger on Dataverse table events (Create, Update, Delete) or checks for missing trigger condition filters. ' +
      'Use this when asking "which flows trigger on Account?", "what flows run when a record is updated?", or "are flows missing trigger filters?".',
    parameters: z.object({
      table_name: z.string().optional().describe('Dataverse table name to filter by, e.g. "account", "contact", "invoice"'),
      missing_filter_only: z.boolean().optional().describe('If true, only returns flows that lack trigger condition filters'),
      projectId: z.string().optional().describe('Optional solution/project ID'),
    }),
    execute: async ({ table_name, missing_filter_only, projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const cleanTable = table_name ? table_name.toLowerCase().trim() : undefined;

      const { stepId, startTime } = startStep(
        context,
        'find_flows_by_trigger',
        `Finding flow triggers ${cleanTable ? `for "${cleanTable}"` : '(all tables)'}${missing_filter_only ? ' (unfiltered only)' : ''}`,
        { table_name: cleanTable, missing_filter_only, projectId: targetProjectId }
      );

      try {
        const triggers = await queryFlowTriggers(targetProjectId, cleanTable, missing_filter_only);

        if (triggers.length === 0) {
          finishStep(context, stepId, startTime, '0 triggers found');
          return `No flow triggers found matching the criteria ${cleanTable ? `for table "${cleanTable}"` : ''}.`;
        }

        const unfilteredCount = triggers.filter((t) => !t.has_filter).length;
        const lines = [
          `### Cloud Flow Triggers ${cleanTable ? `for \`${cleanTable}\`` : ''}`,
          `- **Total Matching Triggers**: **${triggers.length}**`,
          `- **Triggers Missing Filter Conditions**: **${unfilteredCount}** ${unfilteredCount > 0 ? '⚠️ *(Risk: potential infinite loops or high execution volume)*' : '✅'}`,
          '',
          '| Flow Name | Trigger Type | Event / Scope | Filter Condition |',
          '| :--- | :--- | :--- | :--- |',
        ];

        for (const t of triggers) {
          const filterText = t.has_filter && t.filter_expression ? `\`${t.filter_expression}\`` : '⚠️ *None (Fires on all changes)*';
          lines.push(`| **${t.flow_name}** | ${t.trigger_type} | ${t.change_type || 'Record Event'} | ${filterText} |`);
        }

        finishStep(
          context,
          stepId,
          startTime,
          `Found ${triggers.length} flow triggers (${unfilteredCount} unfiltered)`
        );

        return lines.join('\n');
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error finding flow triggers: ${err?.message || err}`;
      }
    },
  });
}

export function createAuditSolutionHealthTool() {
  return tool({
    name: 'audit_solution_health',
    description:
      'Performs a comprehensive ALM and code quality audit across the solution. ' +
      'Checks for deprecated Xrm client APIs, direct DOM manipulation, hardcoded URLs/GUIDs, and unfiltered flow triggers.',
    parameters: z.object({
      audit_focus: z
        .enum(['all', 'deprecated_code', 'hardcoded_literals', 'unfiltered_triggers'])
        .optional()
        .default('all')
        .describe('Audit category to focus on, or "all"'),
      projectId: z.string().optional().describe('Optional solution/project ID'),
    }),
    execute: async ({ audit_focus = 'all', projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;

      const { stepId, startTime } = startStep(
        context,
        'audit_solution_health',
        `Auditing solution health (${audit_focus})`,
        { audit_focus, projectId: targetProjectId }
      );

      try {
        const webRes = await queryWebResources(targetProjectId);
        const deprecatedScripts = webRes.filter((w) => w.uses_deprecated_xrm || w.uses_direct_dom);

        const literals = await queryHardcodedLiterals(targetProjectId);
        const hardcodedUrls = literals.filter((l) => l.literal_type === 'URL');
        const hardcodedGuids = literals.filter((l) => l.literal_type === 'GUID');

        const triggers = await queryFlowTriggers(targetProjectId, undefined, true);

        const totalIssues = deprecatedScripts.length + hardcodedUrls.length + hardcodedGuids.length + triggers.length;
        const score = totalIssues === 0 ? 'A+ (Clean)' : totalIssues <= 3 ? 'B (Good)' : totalIssues <= 7 ? 'C (Needs Review)' : 'D (High Risk)';

        const report = [
          `### Solution Quality & ALM Health Scorecard`,
          `- **Overall Health Grade**: **${score}**`,
          `- **Total Issues Detected**: **${totalIssues}**`,
          '',
          '#### 1. Client-Side JavaScript Audit',
          `- Scripts using deprecated \`Xrm.Page\` APIs: **${webRes.filter((w) => w.uses_deprecated_xrm).length}**`,
          `- Scripts using unsupported direct DOM manipulation: **${webRes.filter((w) => w.uses_direct_dom).length}**`,
        ];

        if (deprecatedScripts.length > 0) {
          for (const s of deprecatedScripts.slice(0, 5)) {
            report.push(`  - ⚠️ \`${s.name}\`: ${s.uses_deprecated_xrm ? 'Uses deprecated Xrm.Page' : ''} ${s.uses_direct_dom ? 'Uses direct DOM access' : ''}`);
          }
        }

        report.push('');
        report.push('#### 2. Hardcoded Values & Environment Drift');
        report.push(`- Hardcoded Environment URLs: **${hardcodedUrls.length}** (Should use Environment Variables)`);
        report.push(`- Hardcoded GUIDs: **${hardcodedGuids.length}**`);
        if (hardcodedUrls.length > 0) {
          for (const u of hardcodedUrls.slice(0, 3)) {
            report.push(`  - \`${u.component_name}\`: \`${u.value}\``);
          }
        }

        report.push('');
        report.push('#### 3. Flow Performance & Trigger Hygiene');
        report.push(`- Flows lacking trigger filter expressions: **${triggers.length}**`);
        if (triggers.length > 0) {
          for (const t of triggers.slice(0, 5)) {
            report.push(`  - ⚠️ \`${t.flow_name}\` on table \`${t.table_name || 'N/A'}\``);
          }
        }

        finishStep(
          context,
          stepId,
          startTime,
          `Health Grade: ${score} (${totalIssues} issues found)`
        );

        return report.join('\n');
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error auditing solution health: ${err?.message || err}`;
      }
    },
  });
}

export function createVisualizeEntityRelationshipsTool() {
  return tool({
    name: 'visualize_entity_relationships',
    description:
      'Inspects 1:N, N:1, and N:N relationships, foreign keys, and cascading delete behaviors for a Dataverse table, returning an interactive Mermaid ER diagram and summary table.',
    parameters: z.object({
      table_name: z.string().describe('Logical or schema name of the Dataverse table, e.g. "account", "contact", "invoice"'),
      projectId: z.string().optional().describe('Optional solution/project ID'),
    }),
    execute: async ({ table_name, projectId }, runContext) => {
      const context = runContext?.context as AgentExecutionContext | undefined;
      const targetProjectId = projectId || context?.projectId;
      const cleanEntity = table_name.toLowerCase().trim();

      const { stepId, startTime } = startStep(
        context,
        'visualize_entity_relationships',
        `Visualizing relationships for table "${cleanEntity}"`,
        { table_name: cleanEntity, projectId: targetProjectId }
      );

      try {
        const rels = await queryEntityRelationshipsFlat(targetProjectId, cleanEntity);

        if (rels.length === 0) {
          finishStep(context, stepId, startTime, '0 relationships found');
          return `No relationships found for Dataverse table "${cleanEntity}".`;
        }

        const mermaidLines = ['```mermaid', 'erDiagram'];
        const tableSummary = [
          `### Entity Relationship Model for \`${cleanEntity}\``,
          `- **Total Relationships**: **${rels.length}**`,
          '',
          '| Relationship Type | Primary Entity | Related Entity | Foreign Key | Cascade Delete |',
          '| :--- | :--- | :--- | :--- | :--- |',
        ];

        const diagramEdges = new Set<string>();

        for (const r of rels) {
          const p = r.primary_entity.replace(/[^a-zA-Z0-9_]/g, '');
          const ref = r.referencing_entity.replace(/[^a-zA-Z0-9_]/g, '');
          const edgeKey = `${p}_${ref}`;

          if (!diagramEdges.has(edgeKey) && diagramEdges.size < 12) {
            diagramEdges.add(edgeKey);
            mermaidLines.push(`    ${p} ||--o{ ${ref} : "${r.referencing_attribute || 'rel'}"`);
          }

          tableSummary.push(
            `| ${r.relationship_type || '1:N'} | \`${r.primary_entity}\` | \`${r.referencing_entity}\` | \`${r.referencing_attribute || 'N/A'}\` | ${r.cascade_delete || 'None'} |`
          );
        }

        mermaidLines.push('```');

        const combined = [
          mermaidLines.join('\n'),
          '',
          tableSummary.join('\n'),
        ].join('\n');

        finishStep(context, stepId, startTime, `Found ${rels.length} relationships`);
        return combined;
      } catch (err: any) {
        finishStep(context, stepId, startTime, `Error: ${err?.message || err}`, true);
        return `Error visualizing entity relationships: ${err?.message || err}`;
      }
    },
  });
}

export function getAllAgentTools() {
  return [
    createCountSolutionComponentsTool(),
    createFindFlowsByTriggerTool(),
    createAuditSolutionHealthTool(),
    createVisualizeEntityRelationshipsTool(),
    createAnalyzeColumnImpactTool(),
    createAnalyzeValidationImpactTool(),
    createQueryFlowIntegrationsTool(),
    createAuditWebResourcesTool(),
    createAuditHardcodedLiteralsTool(),
    createSemanticSearchTool(),
    createListDocumentsTool(),
    createReadDocumentMarkdownTool(),
    createInspectDataverseEntityTool(),
    createInspectCloudFlowTool(),
    createInspectCanvasAppTool(),
    createListSolutionsTool(),
  ];
}

export const GOOGLE_TOOL_DECLARATIONS = [
  {
    name: 'count_solution_components',
    description:
      'Provides exact quantitative counts and breakdown of components in the solution. ' +
      'Use this whenever the user asks "how many" flows, tables, canvas apps, environment variables, or web resources exist.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        component_type: {
          type: 'string',
          description: 'Component type to count: "all", "flows", "tables", "canvas_apps", "environment_variables", or "web_resources"',
        },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
    },
  },
  {
    name: 'find_flows_by_trigger',
    description:
      'Finds Cloud Flows that trigger on Dataverse table events (Create, Update, Delete) or checks for missing trigger condition filters. ' +
      'Use this when asking "which flows trigger on Account?", "what flows run when a record is updated?", or "are flows missing trigger filters?".',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Dataverse table name to filter by, e.g. "account", "contact", "invoice"' },
        missing_filter_only: { type: 'boolean', description: 'If true, only returns flows that lack trigger condition filters' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
    },
  },
  {
    name: 'audit_solution_health',
    description:
      'Performs a comprehensive ALM and code quality audit across the solution. ' +
      'Checks for deprecated Xrm client APIs, direct DOM manipulation, hardcoded URLs/GUIDs, and unfiltered flow triggers.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        audit_focus: {
          type: 'string',
          description: 'Audit category: "all", "deprecated_code", "hardcoded_literals", or "unfiltered_triggers"',
        },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
    },
  },
  {
    name: 'visualize_entity_relationships',
    description:
      'Inspects 1:N, N:1, and N:N relationships, foreign keys, and cascading delete behaviors for a Dataverse table, returning an interactive Mermaid ER diagram and summary table.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Logical or schema name of the Dataverse table, e.g. "account", "contact", "invoice"' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'analyze_column_impact',
    description:
      'High-precision blast radius analysis for deleting or modifying a Dataverse column/attribute. ' +
      'Queries relational dependencies across Cloud Flows, Canvas Apps, JavaScript Web Resources, ' +
      'Form Event Handlers, and Foreign Key relationships.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'The logical name of the Dataverse table, e.g. "account", "contact"' },
        column_name: { type: 'string', description: 'The logical name of the column/attribute being evaluated, e.g. "telephone1"' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
      required: ['table_name', 'column_name'],
    },
  },
  {
    name: 'analyze_validation_impact',
    description:
      'Evaluates the impact of adding a business rule validation, plugin validation, or making a column required. ' +
      'Identifies flows and apps that write to this table without setting this column.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'The logical name of the Dataverse table, e.g. "account"' },
        column_name: { type: 'string', description: 'The column being made required or validated, e.g. "emailaddress1"' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
      required: ['table_name', 'column_name'],
    },
  },
  {
    name: 'query_flow_integrations',
    description:
      'Finds Cloud Flows using specific external services, connectors, or APIs. ' +
      'Useful for finding all flows touching Power BI, Dataverse, Teams, SQL, HTTP, or premium connectors.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        connector_name: { type: 'string', description: 'Filter by connector name, e.g. "Dataverse", "Power BI", "Teams", "SQL", "HTTP"' },
        is_premium: { type: 'boolean', description: 'Filter to only premium connectors (true) or standard connectors (false)' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
    },
  },
  {
    name: 'audit_web_resources',
    description:
      'Audits client-side JavaScript Web Resources in the solution for deprecated Xrm.Page APIs, ' +
      'direct DOM manipulation, and lists registered form event handlers.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        check_deprecated_only: { type: 'boolean', description: 'If true, filters to only web resources containing deprecated API usages' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
    },
  },
  {
    name: 'audit_hardcoded_literals',
    description:
      'Audits hardcoded GUIDs, environment URLs, and email addresses across Cloud Flows, Canvas Apps, ' +
      'and JavaScript Web Resources to detect environment drift and ALM portability risks.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        literal_type: { type: 'string', enum: ['GUID', 'URL', 'EMAIL', 'ALL'], description: 'Type of hardcoded literal to audit' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
    },
  },
  {
    name: 'semantic_search',
    description:
      'Search documentation chunks using hybrid dense vector similarity + lexical keyword search. ' +
      'Returns relevant excerpts with document titles, heading context, and similarity scores.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query or concept' },
        limit: { type: 'integer', description: 'Maximum number of top chunks to return (1-10)' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_documents',
    description:
      'List all generated documentation markdown files in IndexedDB for the current solution or across all solutions.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional solution/project ID to filter documents' },
      },
    },
  },
  {
    name: 'read_document_markdown',
    description:
      'Read the full content or a specific section of a documentation file by slug or document ID.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'The document slug (e.g. "overview", "dataverse-schema") or document ID' },
        section: { type: 'string', description: 'Optional heading or section name to filter and read only that specific section' },
        projectId: { type: 'string', description: 'Optional solution/project ID if disambiguation is required' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'inspect_dataverse_entity',
    description:
      'Inspect detailed schema, columns, attributes, and 1:N / N:1 / N:N relationships of a Dataverse entity.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        logical_name: { type: 'string', description: 'Dataverse entity logical name, e.g. "account", "contact"' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
      required: ['logical_name'],
    },
  },
  {
    name: 'inspect_cloud_flow',
    description:
      'Inspect a Cloud Flow trigger, action hierarchy, run_after dependencies, and connector calls.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        flow_name_or_id: { type: 'string', description: 'The name, display name, or workflow ID of the Cloud Flow' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
      required: ['flow_name_or_id'],
    },
  },
  {
    name: 'inspect_canvas_app',
    description:
      'Inspect a Canvas App screens, components, control hierarchy, and Power Fx formulas.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'The name or display name of the Canvas App' },
        projectId: { type: 'string', description: 'Optional solution/project ID' },
      },
      required: ['app_name'],
    },
  },
  {
    name: 'list_solutions',
    description:
      'List all ingested Power Platform solutions stored in local IndexedDB / PGlite, with component counts.',
    parametersJsonSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export interface GoogleAgentToolSet {
  tools: Array<{
    functionDeclarations: typeof GOOGLE_TOOL_DECLARATIONS;
  }>;
  executorMap: Map<string, (args: any, context?: AgentExecutionContext) => Promise<string>>;
}

/**
 * Normalizes tool arguments passed from various agent SDKs or prompt formats
 * to match the exact schema expected by the underlying tool implementation.
 */
export function normalizeToolArgs(toolName: string, rawArgs: any): any {
  if (!rawArgs || typeof rawArgs !== 'object') return rawArgs;
  const args = { ...rawArgs };

  if (toolName === 'count_solution_components') {
    if (!args.component_type && args.type) {
      args.component_type = args.type;
    }
  }

  if (toolName === 'find_flows_by_trigger') {
    if (!args.table_name && args.table) {
      args.table_name = args.table;
    }
    if (!args.table_name && args.entity_name) {
      args.table_name = args.entity_name;
    }
    if (!args.table_name && args.entity) {
      args.table_name = args.entity;
    }
  }

  if (toolName === 'visualize_entity_relationships') {
    if (!args.table_name && args.table) {
      args.table_name = args.table;
    }
    if (!args.table_name && args.entity_name) {
      args.table_name = args.entity_name;
    }
    if (!args.table_name && args.entity) {
      args.table_name = args.entity;
    }
  }

  if (toolName === 'audit_solution_health') {
    if (!args.audit_focus && args.focus) {
      args.audit_focus = args.focus;
    }
    if (!args.audit_focus && args.category) {
      args.audit_focus = args.category;
    }
  }

  if (toolName === 'analyze_column_impact' || toolName === 'analyze_validation_impact') {
    if (!args.entity_name && args.table_name) {
      args.entity_name = args.table_name;
    }
    if (!args.entity_name && args.table) {
      args.entity_name = args.table;
    }
    if (!args.column_name && args.column) {
      args.column_name = args.column;
    }
  }

  if (toolName === 'query_flow_integrations') {
    if (!args.connector_filter && args.connector_name) {
      args.connector_filter = args.connector_name;
    }
    if (!args.connector_filter && args.connector_type) {
      args.connector_filter = args.connector_type;
    }
    if (!args.connector_filter && args.connector) {
      args.connector_filter = args.connector;
    }
  }

  if (toolName === 'audit_web_resources') {
    if (!args.audit_type && args.check_deprecated_only) {
      args.audit_type = 'deprecated_xrm';
    }
  }

  if (toolName === 'read_document_markdown') {
    if (!args.slug_or_id && args.identifier) {
      args.slug_or_id = args.identifier;
    }
    if (!args.slug_or_id && args.slug) {
      args.slug_or_id = args.slug;
    }
    if (!args.slug_or_id && args.document_id) {
      args.slug_or_id = args.document_id;
    }
    if (!args.section_heading && args.section) {
      args.section_heading = args.section;
    }
  }

  if (toolName === 'inspect_dataverse_entity') {
    if (!args.entity_name && args.logical_name) {
      args.entity_name = args.logical_name;
    }
    if (!args.entity_name && args.table_name) {
      args.entity_name = args.table_name;
    }
    if (!args.entity_name && args.entity) {
      args.entity_name = args.entity;
    }
  }

  if (toolName === 'inspect_cloud_flow') {
    if (!args.flow_name && args.flow_name_or_id) {
      args.flow_name = args.flow_name_or_id;
    }
    if (!args.flow_name && args.name) {
      args.flow_name = args.name;
    }
    if (!args.flow_name && args.flow) {
      args.flow_name = args.flow;
    }
  }

  if (toolName === 'inspect_canvas_app') {
    if (!args.app_name && args.name) {
      args.app_name = args.name;
    }
    if (!args.app_name && args.app) {
      args.app_name = args.app;
    }
  }

  if (toolName === 'semantic_search') {
    if (!args.query && args.search_term) {
      args.query = args.search_term;
    }
    if (!args.query && args.search_query) {
      args.query = args.search_query;
    }
  }

  return args;
}

export function getGoogleAgentTools(): GoogleAgentToolSet {
  const tools = getAllAgentTools();
  const executorMap = new Map<string, (args: any, context?: AgentExecutionContext) => Promise<string>>();

  for (const t of tools) {
    const toolName = (t as any).name;
    executorMap.set(toolName, async (args, context) => {
      const normalizedArgs = normalizeToolArgs(toolName, args);
      const inputStr = typeof normalizedArgs === 'string' ? normalizedArgs : JSON.stringify(normalizedArgs ?? {});
      const startTime = performance.now();
      const result = await (t as any).invoke({ context }, inputStr);
      const duration = Math.round(performance.now() - startTime);
      if (context) {
        const step = [...context.steps].reverse().find((s) => s.toolName === toolName);
        if (step && !step.outputDetails) {
          step.outputDetails = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        }
      }
      logger.toolCall(toolName, normalizedArgs, result, duration);
      return result;
    });
  }

  return {
    tools: [
      {
        functionDeclarations: GOOGLE_TOOL_DECLARATIONS,
      },
    ],
    executorMap,
  };
}

export interface GemmaAgentToolSet {
  tools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  executorMap: Map<string, (args: any, context?: AgentExecutionContext) => Promise<string>>;
}

export function getGemmaAgentTools(curatedOnly = true): GemmaAgentToolSet {
  const allTools = getAllAgentTools();
  const executorMap = new Map<string, (args: any, context?: AgentExecutionContext) => Promise<string>>();

  for (const t of allTools) {
    const toolName = (t as any).name;
    executorMap.set(toolName, async (args, context) => {
      const normalizedArgs = normalizeToolArgs(toolName, args);
      const inputStr = typeof normalizedArgs === 'string' ? normalizedArgs : JSON.stringify(normalizedArgs ?? {});
      const startTime = performance.now();
      const result = await (t as any).invoke({ context }, inputStr);
      const duration = Math.round(performance.now() - startTime);
      if (context) {
        const step = [...context.steps].reverse().find((s) => s.toolName === toolName);
        if (step && !step.outputDetails) {
          step.outputDetails = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        }
      }
      logger.toolCall(toolName, normalizedArgs, result, duration);
      return result;
    });
  }

  const curatedNames = new Set([
    'count_solution_components',
    'find_flows_by_trigger',
    'audit_solution_health',
    'visualize_entity_relationships',
    'analyze_column_impact',
    'analyze_validation_impact',
    'query_flow_integrations',
    'audit_web_resources',
    'audit_hardcoded_literals',
    'inspect_dataverse_entity',
    'inspect_cloud_flow',
    'inspect_canvas_app',
    'semantic_search',
    'read_document_markdown',
    'list_solutions',
  ]);

  const sourceDeclarations = curatedOnly
    ? GOOGLE_TOOL_DECLARATIONS.filter((d) => curatedNames.has(d.name))
    : GOOGLE_TOOL_DECLARATIONS;

  const tools = sourceDeclarations.map((d) => ({
    type: 'function' as const,
    function: {
      name: d.name,
      description: d.description,
      parameters: d.parametersJsonSchema,
    },
  }));

  return {
    tools,
    executorMap,
  };
}

