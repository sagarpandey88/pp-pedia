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
} from '../db';
import { SimilarityResult } from '../../types/db';
import { AgentExecutionContext, AgentActivityStep } from './agentTypes';

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
  isError = false
) {
  if (context) {
    const step = context.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = isError ? 'failed' : 'completed';
      step.outputSummary = outputSummary;
      step.durationMs = Math.round(performance.now() - startTime);
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

export function getAllAgentTools() {
  return [
    createSemanticSearchTool(),
    createListDocumentsTool(),
    createReadDocumentMarkdownTool(),
    createInspectDataverseEntityTool(),
    createInspectCloudFlowTool(),
    createInspectCanvasAppTool(),
    createListSolutionsTool(),
  ];
}
