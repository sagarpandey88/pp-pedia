import { SolutionAST, DataverseEntity, CloudFlow, CanvasApp, FlowAction, FlowTrigger, TokenUsage, BusinessRule, SecurityRole } from '../../types/solution';
import { cleanFlowDisplayName, COMMON_SYSTEM_FIELD_LABELS } from '../parser/solutionParser';
import { DocumentRecord } from '../../types/db';
import { formatConnectionReference, extractConnectorsSummary } from './connectorUtils';
import {
  buildOverviewPrompt,
  buildDataversePrompt,
  buildFlowPrompt,
  buildCanvasAppPrompt,
} from './promptBuilder';
import { GoogleGenAI } from '@google/genai';

export type AIProvider = 'openai' | 'google';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  googleApiKey: string;
  googleModel: string;
  forceDeterministicDocs?: boolean;
  forceLocalAnswers?: boolean;
}

export function getAISettings(): AISettings {
  const storedProvider = (localStorage.getItem('pp_pedia_ai_provider') as AIProvider) || 'openai';
  const apiKey = localStorage.getItem('pp_pedia_openai_key') || '';
  const baseUrl = localStorage.getItem('pp_pedia_openai_base_url') || 'https://api.openai.com/v1';
  const model = localStorage.getItem('pp_pedia_openai_model') || 'gpt-4o-mini';
  const googleApiKey = localStorage.getItem('pp_pedia_google_key') || '';
  const googleModel = localStorage.getItem('pp_pedia_google_model') || 'gemini-2.5-flash';
  const forceDeterministicDocs = localStorage.getItem('pp_pedia_force_deterministic_docs') === 'true';
  const forceLocalAnswers = localStorage.getItem('pp_pedia_force_local_answers') === 'true';

  let provider = storedProvider;
  if (!localStorage.getItem('pp_pedia_ai_provider')) {
    if (apiKey.length > 5) {
      provider = 'openai';
    } else if (googleApiKey.length > 5) {
      provider = 'google';
    }
  }

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    googleApiKey,
    googleModel,
    forceDeterministicDocs,
    forceLocalAnswers,
  };
}

export function saveAISettings(settings: AISettings): void {
  localStorage.setItem('pp_pedia_ai_provider', settings.provider);
  localStorage.setItem('pp_pedia_openai_key', settings.apiKey.trim());
  localStorage.setItem('pp_pedia_openai_base_url', settings.baseUrl.trim());
  localStorage.setItem('pp_pedia_openai_model', settings.model.trim());
  localStorage.setItem('pp_pedia_google_key', (settings.googleApiKey || '').trim());
  localStorage.setItem('pp_pedia_google_model', (settings.googleModel || '').trim());
  localStorage.setItem('pp_pedia_force_deterministic_docs', String(Boolean(settings.forceDeterministicDocs)));
  localStorage.setItem('pp_pedia_force_local_answers', String(Boolean(settings.forceLocalAnswers)));
}

export type ActiveAIProvider = 'openai' | 'google' | 'offline';

/**
 * Determines the active AI provider.
 * When keys for both OpenAI and Google are present, the selected button (settings.provider)
 * is considered the default model.
 */
export function getActiveAIProvider(settings: AISettings): ActiveAIProvider {
  if (settings.forceLocalAnswers) {
    return 'offline';
  }

  const hasOpenAI = Boolean(settings.apiKey && settings.apiKey.trim().length > 5);
  const hasGoogle = Boolean(settings.googleApiKey && settings.googleApiKey.trim().length > 5);

  // If both have keys, user's selected button is the default model
  if (hasOpenAI && hasGoogle) {
    return settings.provider;
  }

  // If only one provider has a key configured, use it
  if (hasGoogle && !hasOpenAI) {
    return 'google';
  }

  if (hasOpenAI && !hasGoogle) {
    return 'openai';
  }

  return 'offline';
}

/**
 * Calls OpenAI API (or compatible proxy) to generate documentation,
 * with automatic retries and exponential backoff for rate limits (429) and server errors (5xx).
 */
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  settings: AISettings,
  retries = 2,
  onTokenUsage?: (usage: TokenUsage) => void
): Promise<string> {
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 1,
        }),
      });

      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        const errText = await response.text().catch(() => '');
        lastError = new Error(`OpenAI API error (${response.status}): ${errText}`);
        if (attempt < retries) {
          const delay = (attempt + 1) * 1000 + Math.floor(Math.random() * 500);
          console.warn(`[callOpenAI] Rate limited or server error (${response.status}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`OpenAI API error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      if (data?.usage) {
        onTokenUsage?.({
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
          requests: 1,
        });
      }
      return data.choices?.[0]?.message?.content || 'No content generated.';
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = (attempt + 1) * 1000 + Math.floor(Math.random() * 500);
        console.warn(`[callOpenAI] Network/fetch error on attempt ${attempt + 1}. Retrying in ${delay}ms:`, err);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Failed to generate content after retries');
}

/**
 * Calls Google Gen AI SDK (Gemini) to generate documentation,
 * with automatic retries and exponential backoff.
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  settings: AISettings,
  retries = 2,
  onTokenUsage?: (usage: TokenUsage) => void
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: settings.googleApiKey });
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: settings.googleModel || 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] },
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 1,
        },
      });

      const usageMetadata = response.usageMetadata;
      if (usageMetadata) {
        onTokenUsage?.({
          promptTokens: usageMetadata.promptTokenCount ?? 0,
          completionTokens: usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: usageMetadata.totalTokenCount ?? 0,
          requests: 1,
        });
      }

      return response.text || 'No content generated.';
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = (attempt + 1) * 1000 + Math.floor(Math.random() * 500);
        console.warn(`[callGemini] Network/API error on attempt ${attempt + 1}. Retrying in ${delay}ms:`, err);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Failed to generate content from Gemini after retries');
}

/**
 * Dispatches documentation generation to either Google Gemini or OpenAI based on settings.
 */
async function callDocAI(
  systemPrompt: string,
  userPrompt: string,
  settings: AISettings,
  retries = 2,
  onTokenUsage?: (usage: TokenUsage) => void
): Promise<string> {
  const active = getActiveAIProvider(settings);
  if (active === 'google') {
    return callGemini(systemPrompt, userPrompt, settings, retries, onTokenUsage);
  }
  return callOpenAI(systemPrompt, userPrompt, settings, retries, onTokenUsage);
}

/**
 * Built-in deterministic markdown generator that builds rich documentation directly from AST
 * when no API key is provided or offline. Generates the 8 standard overview sections:
 * Overview, Component inventory, Apps, Automation, Data model, Connectors used,
 * Environment variables, and Dependency highlights.
 */
export function generateDeterministicOverview(ast: SolutionAST): string {
  const totalColumns = ast.entities.reduce((acc, e) => acc + e.attributes.length, 0);
  const connectors = extractConnectorsSummary(ast);

  // Model-driven apps parsed from SiteMap
  const modelDrivenApps: Array<{ title: string; groupsCount: number; subAreasCount: number }> = [];
  if (ast.site_map?.areas) {
    for (const area of ast.site_map.areas) {
      const subCount = area.groups.reduce((acc, g) => acc + g.sub_areas.length, 0);
      modelDrivenApps.push({
        title: area.title || 'Model-Driven Application',
        groupsCount: area.groups.length,
        subAreasCount: subCount,
      });
    }
  }

  // Count unique connection references across flows and connectors
  const uniqueConnRefs = new Set<string>();
  for (const f of ast.flows) {
    for (const r of f.connection_references) {
      if (r.logical_name) uniqueConnRefs.add(r.logical_name);
    }
  }
  for (const c of connectors) {
    for (const r of c.connectionReferences) {
      uniqueConnRefs.add(r);
    }
  }

  // Section 1: Overview
  const overviewSection = `## Overview

Solution **${ast.solution.display_name}** – Solution Metadata & Specification

| Property | Value |
| :--- | :--- |
| **Unique Name** | \`${ast.solution.unique_name}\` |
| **Display Name** | ${ast.solution.display_name} |
| **Version** | \`${ast.solution.version}\` |
| **Publisher** | ${ast.solution.publisher_name || 'Standard Publisher'} (\`${ast.solution.publisher_prefix || 'new'}\`) |
| **Managed / Unmanaged** | ${ast.solution.is_managed ? 'Managed' : 'Unmanaged'} |

${ast.solution.description ? `> **Description**: ${ast.solution.description}\n` : '> *No description provided.*\n'}`;

  // Section 2: Component inventory
  const componentRows = [
    { type: 'Dataverse Tables (Entities)', count: ast.entities.length },
    { type: 'Table Columns (Attributes)', count: totalColumns },
    { type: 'Entity Relationships', count: ast.stats.relationship_count },
    { type: 'Business Rules', count: ast.business_rules?.length || 0 },
    { type: 'Security Roles', count: ast.security_roles?.length || 0 },
    { type: 'Cloud Flows (Power Automate)', count: ast.flows.length },
    { type: 'Canvas Applications', count: ast.canvas_apps.length },
    { type: 'Model-Driven Applications', count: modelDrivenApps.length },
    { type: 'Global Choices (Option Sets)', count: ast.option_sets.length },
    { type: 'Environment Variables', count: ast.environment_variables.length },
    { type: 'Connection References', count: uniqueConnRefs.size },
    { type: 'Web Resources (Scripts / Assets)', count: ast.web_resources?.length || 0 },
    { type: 'Form Event Handlers', count: ast.form_event_handlers?.length || 0 },
  ];

  const inventorySection = `## Component inventory

Solution **${ast.solution.display_name}** – Component Inventory Breakdown

| Type | Count |
| :--- | :--- |
${componentRows.map((r) => `| ${r.type} | ${r.count} |`).join('\n')}`;

  // Section 3: Apps
  const canvasAppsList = ast.canvas_apps.map((app) => {
    const slug = `app-${app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const screensList = app.screens.map((s) => s.name).slice(0, 4).join(', ');
    const moreScreens = app.screens.length > 4 ? ` (+${app.screens.length - 4} more)` : '';
    const dsList = app.data_sources.length > 0 ? app.data_sources.join(', ') : 'Dataverse';
    return `- **[${app.display_name}](app-${slug})** (Canvas App) – \`${app.name}\`: ${app.screens.length} screens (${screensList}${moreScreens}). Data sources: ${dsList}`;
  });

  const modelAppsList = modelDrivenApps.map((ma) => {
    return `- **[${ma.title}](#apps)** (Model-Driven App) – Navigation Sitemap containing ${ma.groupsCount} functional groups and ${ma.subAreasCount} sub-area links.`;
  });

  const allApps = [...canvasAppsList, ...modelAppsList];

  const appsSection = `## Apps

Solution **${ast.solution.display_name}** – Canvas and Model-Driven Applications

${
  allApps.length > 0
    ? allApps.join('\n')
    : '_No Canvas or Model-Driven Applications configured in this solution._'
}`;

  // Section 4: Automation
  const flowRows = ast.flows.map((f) => {
    const name = cleanFlowDisplayName(f.display_name || f.name);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const triggerDesc = f.triggers.map((t) => t.name || t.type).join(', ') || 'Event / Manual';
    return `| [${name}](flow-${slug}) | Cloud Flow | ${triggerDesc} | ${f.actions.length} action steps | ${f.status || 'Active'} |`;
  });

  const brRows = (ast.business_rules || []).map((br) => {
    const slug = `${br.table}__${br.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return `| [${br.name}](${slug}) | Business Rule | Table: \`${br.table}\` (${br.scope}) | ${br.actions.length} action(s), ${br.conditions.length} condition(s) | ${br.state} |`;
  });

  const allAutomationRows = [...flowRows, ...brRows];

  const automationSection = `## Automation

Solution **${ast.solution.display_name}** – Automated Workflows, Cloud Flows, and Logic

| Name | Type | Trigger / Execution | Scope / Actions | Status |
| :--- | :--- | :--- | :--- | :--- |
${
  allAutomationRows.length > 0
    ? allAutomationRows.join('\n')
    : '| - | - | - | - | - |\n*(No automated flows, workflows, BPFs, or plugins detected)*'
}`;

  // Section 5: Data model
  const dataModelRows = ast.entities.map((e) => {
    return `| **${e.display_name}** | \`${e.logical_name}\` | ${e.attributes.length} | ${e.forms_count ?? 0} | ${e.views_count ?? 0} |`;
  });

  const dataModelSection = `## Data model

Solution **${ast.solution.display_name}** – Dataverse Tables & Schema Summary

| Table | Logical Name | Columns | Forms | Views |
| :--- | :--- | :--- | :--- | :--- |
${
  dataModelRows.length > 0
    ? dataModelRows.join('\n')
    : '| - | - | - | - | - |\n*(No Dataverse tables defined)*'
}`;

  // Section 6: Connectors used
  const connectorRows = connectors.map((c) => {
    const refsStr =
      c.connectionReferences.length > 0
        ? c.connectionReferences.map((r) => `\`${r}\``).join(', ')
        : '*(none)*';
    return `| **${c.connectorName}** | ${c.flowCount} | ${c.appCount} | ${refsStr} |`;
  });

  const connectorsSection = `## Connectors used

Solution **${ast.solution.display_name}** – Connector Integrations & Connection References

| Connector | # Flows | # Apps | Connection References |
| :--- | :--- | :--- | :--- |
${
  connectorRows.length > 0
    ? connectorRows.join('\n')
    : '| - | - | - | - |\n*(No external connectors detected)*'
}`;

  // Section 7: Environment variables
  const envVarRows = ast.environment_variables.map((v) => {
    const defVal =
      v.default_value !== undefined && v.default_value !== '' ? `\`${v.default_value}\`` : '*(none)*';
    const curVal =
      v.current_value !== undefined && v.current_value !== '' ? `\`${v.current_value}\`` : '*(not set)*';
    return `| **${v.display_name}** (\`${v.schema_name}\`) | \`${v.type}\` | ${defVal} | ${curVal} |`;
  });

  const envVarSection = `## Environment variables

Solution **${ast.solution.display_name}** – Environment Configuration Variables

| Name | Type | Default | Current |
| :--- | :--- | :--- | :--- |
${
  envVarRows.length > 0
    ? envVarRows.join('\n')
    : '| - | - | - | - |\n*(No environment variables configured)*'
}`;

  // Section 8: Dependency highlights
  const depRows = (ast.dependencies || []).slice(0, 25).map((d) => {
    const target = `\`${d.target_entity}\`${d.target_field ? ` . \`${d.target_field}\`` : ''}`;
    const context = d.location_detail || d.context_snippet || '-';
    return `| **${d.source_name}** | \`${d.source_type}\` | \`${d.operation_type}\` | ${target} | ${context} |`;
  });

  const depCountNotice =
    (ast.dependencies?.length || 0) > 25
      ? `\n\n*(Showing top 25 of ${ast.dependencies!.length} cross-component dependencies)*`
      : '';

  const dependencySection = `## Dependency highlights

Solution **${ast.solution.display_name}** – Cross-Component Dependencies

| Source Component | Type | Operation | Target Entity / Field | Context / Details |
| :--- | :--- | :--- | :--- | :--- |
${
  depRows.length > 0
    ? depRows.join('\n') + depCountNotice
    : '| - | - | - | - | - |\n*(No cross-component dependencies detected)*'
}`;

  return `# ${ast.solution.display_name}

${overviewSection}

---

${inventorySection}

---

${appsSection}

---

${automationSection}

---

${dataModelSection}

---

${connectorsSection}

---

${envVarSection}

---

${dependencySection}
`;
}

export function generateDeterministicDataverse(ast: SolutionAST): string {
  let doc = `# Dataverse Schema & Entity Relationship Model

This document outlines the complete Microsoft Dataverse data model defined within the **${ast.solution.display_name}** solution.

---

## 1. Entity-Relationship Diagram (ERD)

\`\`\`mermaid
erDiagram
`;

  for (const entity of ast.entities) {
    const cleanName = entity.logical_name.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    doc += `    ${cleanName} {\n`;
    for (const attr of entity.attributes.slice(0, 6)) {
      const cleanType = (attr.type || 'string').replace(/[^a-zA-Z0-9]/g, '');
      const cleanAttr = attr.logical_name.replace(/[^a-zA-Z0-9_]/g, '_');
      doc += `        ${cleanType || 'string'} ${cleanAttr}\n`;
    }
    doc += `    }\n`;
  }

  // Relationships
  let relCount = 0;
  const entitySet = new Set(ast.entities.map((e) => e.logical_name.toLowerCase()));
  const addedRelKeys = new Set<string>();

  for (const entity of ast.entities) {
    const curName = entity.logical_name.toLowerCase();

    // 1. Explicit relationships
    for (const rel of entity.relationships) {
      const primary = rel.primary_entity.toLowerCase();
      const referencing = rel.referencing_entity.toLowerCase();
      if (primary && referencing && primary !== referencing && entitySet.has(primary) && entitySet.has(referencing)) {
        const key = `${primary}->${referencing}`;
        if (!addedRelKeys.has(key)) {
          addedRelKeys.add(key);
          const safePrim = primary.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
          const safeRef = referencing.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
          const safeRelName = rel.schema_name.replace(/[^a-zA-Z0-9_]/g, '_');
          doc += `    ${safePrim} ||--o{ ${safeRef} : "${safeRelName}"\n`;
          relCount++;
        }
      }
    }

    // 2. Lookup attributes inferred relationships
    for (const attr of entity.attributes) {
      if (attr.lookup_target_entity) {
        const target = attr.lookup_target_entity.toLowerCase();
        if (target !== curName && entitySet.has(target)) {
          const key = `${target}->${curName}`;
          if (!addedRelKeys.has(key)) {
            addedRelKeys.add(key);
            const safeTarget = target.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
            const safeCur = curName.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
            const safeAttrName = attr.logical_name.replace(/[^a-zA-Z0-9_]/g, '_');
            doc += `    ${safeTarget} ||--o{ ${safeCur} : "${safeAttrName}"\n`;
            relCount++;
          }
        }
      }
    }
  }

  if (relCount === 0 && ast.entities.length > 1) {
    // Add default visual link for demo
    const e0 = ast.entities[0].logical_name.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    const e1 = ast.entities[1].logical_name.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    doc += `    ${e0} ||--o{ ${e1} : "relates_to"\n`;
  }

  doc += `\`\`\`

---

## 2. Table Specifications

`;

  for (const entity of ast.entities) {
    doc += `### Table: ${entity.display_name} (\`${entity.logical_name}\`)

${entity.description ? `> ${entity.description}\n` : ''}

- **Logical Name**: \`${entity.logical_name}\`
- **Schema Name**: \`${entity.schema_name || entity.logical_name}\`
- **Primary ID Attribute**: \`${entity.primary_id_attribute || entity.logical_name + 'id'}\`
- **Primary Name Attribute**: \`${entity.primary_name_attribute || 'name'}\`

#### Attributes Dictionary

| Attribute Name | Logical Name | Type | Required | Lookup Target / Choices |
| :--- | :--- | :--- | :--- | :--- |
`;

    for (const attr of entity.attributes) {
      let extra = '-';
      if (attr.lookup_target_entity) {
        extra = `Lookup (\`${attr.lookup_target_entity}\`)`;
      } else if (attr.options && attr.options.length > 0) {
        extra = attr.options.map((o) => `${o.label} (${o.value})`).join(', ');
      }
      doc += `| **${attr.display_name}** | \`${attr.logical_name}\` | \`${attr.type}\` | ${attr.required_level || 'None'} | ${extra} |\n`;
    }

    if (entity.relationships.length > 0) {
      doc += `\n#### Relationships\n\n`;
      doc += `| Relationship Name | Type | Related Entity | Foreign Key Field | Cascade Delete |\n`;
      doc += `| :--- | :--- | :--- | :--- | :--- |\n`;
      for (const rel of entity.relationships) {
        doc += `| \`${rel.schema_name}\` | **${rel.relationship_type}** | \`${rel.primary_entity}\` | \`${rel.referencing_attribute || '-'}\` | ${rel.cascade_delete || 'None'} |\n`;
      }
    }

    const entityRules = (ast.business_rules || []).filter(
      (r) => r.table.toLowerCase() === entity.logical_name.toLowerCase()
    );
    if (entityRules.length > 0) {
      doc += `\n#### Business Rules\n\n`;
      doc += `| Rule Name | Scope | State | Conditions Summary | Actions Summary |\n`;
      doc += `| :--- | :--- | :--- | :--- | :--- |\n`;
      for (const r of entityRules) {
        const slug = `${r.table}__${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const condSummary =
          r.conditions.length > 0
            ? r.conditions
                .map((c) => `${c.field_display_name || c.field} ${c.operator} ${c.value || ''}`)
                .join('; ')
            : 'Always execute';
        const actSummary =
          r.actions.length > 0
            ? r.actions
                .map((a) => `${a.action_type}: ${a.target_field_display_name || a.target_field}`)
                .join('; ')
            : 'None';
        doc += `| [${r.name}](${slug}) | ${r.scope} | ${r.state} | ${condSummary} | ${actSummary} |\n`;
      }
    }

    doc += `\n---\n\n`;
  }

  if (ast.option_sets.length > 0) {
    doc += `## 3. Global Option Sets (Choices)\n\n`;
    for (const opt of ast.option_sets) {
      doc += `### ${opt.display_name || opt.name} (\`${opt.name}\`)\n\n`;
      doc += `| Value | Label |\n| :--- | :--- |\n`;
      for (const item of opt.options) {
        doc += `| \`${item.value}\` | ${item.label} |\n`;
      }
      doc += `\n`;
    }
  }

  return doc;
}

interface FlatActionRow {
  name: string;
  type: string;
  scope: string;
  runAfter: string;
  details: string;
  depth: number;
}

function flattenActions(
  actions: FlowAction[],
  scope = 'Main Flow',
  depth = 0
): FlatActionRow[] {
  const rows: FlatActionRow[] = [];

  for (const a of actions) {
    // Format run_after
    let runAfterStr = '—';
    if (a.run_after && Object.keys(a.run_after).length > 0) {
      runAfterStr = Object.entries(a.run_after)
        .map(([act, statuses]) => `\`${act}\` (${statuses.join(', ')})`)
        .join(', ');
    } else if (depth === 0 && rows.length === 0) {
      runAfterStr = '_Initial Step_';
    }

    // Format details
    let detailsStr = a.description || '';
    if (!detailsStr && a.inputs) {
      const inputs = a.inputs as Record<string, any>;
      const host = inputs.host;
      const params = inputs.parameters;
      const parts: string[] = [];
      if (host?.operationId) parts.push(`Operation: \`${host.operationId}\``);
      if (params?.entityName) parts.push(`Entity: \`${params.entityName}\``);
      if (inputs.expression) parts.push(`Expression: \`${JSON.stringify(inputs.expression)}\``);
      if (parts.length > 0) {
        detailsStr = parts.join('; ');
      }
    }
    if (!detailsStr) {
      if (a.type === 'If') detailsStr = 'Conditional Branch';
      else if (a.type === 'Foreach') detailsStr = 'Iteration Loop';
      else if (a.type === 'Switch') detailsStr = 'Switch-Case Branch';
      else if (a.type === 'Scope') detailsStr = 'Action Scope Container';
      else detailsStr = '—';
    }

    // Indent name for hierarchy
    const prefix = depth > 0 ? '↳ '.repeat(depth) : '';
    const displayName = `${prefix}**${a.name}**`;

    rows.push({
      name: displayName,
      type: `\`${a.type}\``,
      scope,
      runAfter: runAfterStr,
      details: detailsStr,
      depth,
    });

    // Recurse into children (nested actions)
    if (a.children && a.children.length > 0) {
      const childScope = a.type === 'If' ? `${a.name} (True)` : `${a.name} (Body)`;
      rows.push(...flattenActions(a.children, childScope, depth + 1));
    }
    if (a.else_actions && a.else_actions.length > 0) {
      const elseScope = `${a.name} (False)`;
      rows.push(...flattenActions(a.else_actions, elseScope, depth + 1));
    }
    if (a.cases && Object.keys(a.cases).length > 0) {
      for (const [caseKey, caseVal] of Object.entries(a.cases)) {
        if (caseVal.actions && caseVal.actions.length > 0) {
          const caseScope = `${a.name} (Case: ${caseKey})`;
          rows.push(...flattenActions(caseVal.actions, caseScope, depth + 1));
        }
      }
    }
  }

  return rows;
}

export function generateFlowActionsTable(actions: FlowAction[]): string {
  if (!actions || actions.length === 0) {
    return '_No actions defined in flow._';
  }

  const rows = flattenActions(actions);
  const tableHeader = '| Action / Step | Type | Scope / Branch | Runs After | Details |\n| :--- | :--- | :--- | :--- | :--- |';

  const tableBody = rows
    .map((r) => {
      const safeName = r.name.replace(/\|/g, '\\|');
      const safeType = r.type.replace(/\|/g, '\\|');
      const safeScope = r.scope.replace(/\|/g, '\\|');
      const safeRunAfter = r.runAfter.replace(/\|/g, '\\|');
      const safeDetails = r.details.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
      return `| ${safeName} | ${safeType} | ${safeScope} | ${safeRunAfter} | ${safeDetails} |`;
    })
    .join('\n');

  return `${tableHeader}\n${tableBody}`;
}

export function generateFlowTriggersTable(triggers: FlowTrigger[]): string {
  if (!triggers || triggers.length === 0) {
    return '_No triggers specified._';
  }

  const tableHeader = '| Trigger Name | Type | Event / Target | Recurrence / Filter |\n| :--- | :--- | :--- | :--- |';
  const tableBody = triggers
    .map((t) => {
      const safeName = `**${t.name}**`.replace(/\|/g, '\\|');
      const safeType = `\`${t.type}\``.replace(/\|/g, '\\|');

      let target = '—';
      const inputs = (t.inputs || {}) as Record<string, any>;
      if (inputs.parameters?.entityName) {
        target = `Entity: \`${inputs.parameters.entityName}\``;
      } else if (inputs.parameters?.['subscriptionRequest/entityname']) {
        target = `Entity: \`${inputs.parameters['subscriptionRequest/entityname']}\``;
      } else if (inputs.host?.operationId) {
        target = `Operation: \`${inputs.host.operationId}\``;
      } else if (t.kind) {
        target = `Kind: \`${t.kind}\``;
      }

      let extra = '—';
      if (t.recurrence) {
        extra = `Every ${t.recurrence.interval || 1} ${t.recurrence.frequency || 'Interval'}`;
      } else if (t.filter_expression) {
        extra = `Filter: \`${t.filter_expression}\``;
      } else if (inputs.parameters?.filter) {
        extra = `Filter: \`${inputs.parameters.filter}\``;
      }

      return `| ${safeName} | ${safeType} | ${target.replace(/\|/g, '\\|')} | ${extra.replace(/\|/g, '\\|')} |`;
    })
    .join('\n');

  return `${tableHeader}\n${tableBody}`;
}

export function generateFlowMermaidDiagram(flow: CloudFlow): string {
  const lines: string[] = ['flowchart TD'];

  // Keep a map of unique Mermaid-safe IDs for every action and trigger
  const idMap = new Map<string, string>();
  const existingIds = new Set<string>();

  const getSafeId = (name: string, prefix = 'act_'): string => {
    if (idMap.has(name)) return idMap.get(name)!;
    let base = prefix + name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
    if (!base || base === prefix) base = `${prefix}action`;
    let candidate = base;
    let counter = 1;
    while (existingIds.has(candidate)) {
      candidate = `${base}_${counter++}`;
    }
    existingIds.add(candidate);
    idMap.set(name, candidate);
    return candidate;
  };

  // Helper to sanitize labels for Mermaid diagrams
  const safeLabel = (name: string): string => {
    return name
      .replace(/_/g, ' ')
      .replace(/"/g, "'")
      .replace(/[[\]{}()<>/\\#`]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  };

  // Helper to format a node based on action type
  const formatNodeDefinition = (id: string, act: FlowAction): string => {
    const label = safeLabel(act.name);
    const typeLabel = act.type || 'Action';
    switch (act.type) {
      case 'If':
        return `    ${id}{"❓ Condition: ${label}"}`;
      case 'Switch':
        return `    ${id}{"🔀 Switch: ${label}"}`;
      case 'Foreach':
        return `    ${id}[["🔁 Apply to each: ${label}"]]`;
      case 'Scope':
        return `    ${id}[["📦 Scope: ${label}"]]`;
      case 'Until':
        return `    ${id}[["🔄 Do Until: ${label}"]]`;
      case 'Terminate':
        return `    ${id}(["🛑 Terminate: ${label}"])`;
      default:
        return `    ${id}["${label}<br/><small>[${typeLabel}]</small>"]`;
    }
  };

  // 1. Triggers
  const triggerIds: string[] = [];
  if (flow.triggers && flow.triggers.length > 0) {
    flow.triggers.forEach((trig, idx) => {
      const trigId = getSafeId(trig.name || `Trigger_${idx}`, 'trig_');
      triggerIds.push(trigId);
      lines.push(`    ${trigId}(["⚡ Trigger: ${safeLabel(trig.name || 'Event Occurs')}"])`);
    });
  } else {
    const trigId = 'trig_start';
    triggerIds.push(trigId);
    existingIds.add(trigId);
    lines.push(`    ${trigId}(["⚡ Trigger: Event Occurs"])`);
  }

  // If no actions, connect trigger directly to end
  if (!flow.actions || flow.actions.length === 0) {
    lines.push(`    EndNode(["🏁 Flow Execution Complete"])`);
    triggerIds.forEach((tId) => lines.push(`    ${tId} --> EndNode`));
    return lines.join('\n');
  }

  const topActions = flow.actions;
  const topActionNames = new Set(topActions.map((a) => a.name));
  const hasIncoming = new Set<string>();
  const isDependedOn = new Set<string>();

  // 2. Define top-level action nodes
  for (const act of topActions) {
    const actId = getSafeId(act.name);
    lines.push(formatNodeDefinition(actId, act));
  }

  // 3. Connect top-level actions via run_after dependencies (DAG)
  for (let i = 0; i < topActions.length; i++) {
    const act = topActions[i];
    const actId = getSafeId(act.name);
    const runAfter = act.run_after;

    const parentEntries = runAfter ? Object.entries(runAfter) : [];
    const validParents = parentEntries.filter(([pName]) => topActionNames.has(pName));

    if (validParents.length > 0) {
      for (const [pName, statuses] of validParents) {
        const pId = getSafeId(pName);
        isDependedOn.add(pName);
        hasIncoming.add(act.name);

        const isError =
          Array.isArray(statuses) &&
          !statuses.includes('Succeeded') &&
          (statuses.includes('Failed') || statuses.includes('TimedOut'));
        const isSkipped =
          Array.isArray(statuses) &&
          statuses.length === 1 &&
          statuses[0] === 'Skipped';

        if (isError) {
          lines.push(`    ${pId} -->|On Error| ${actId}`);
        } else if (isSkipped) {
          lines.push(`    ${pId} -->|If Skipped| ${actId}`);
        } else {
          lines.push(`    ${pId} --> ${actId}`);
        }
      }
    } else {
      // If action has no run_after or empty run_after:
      // It is an initial action that runs immediately after the trigger(s)
      if (i === 0 || !runAfter || Object.keys(runAfter).length === 0) {
        hasIncoming.add(act.name);
        triggerIds.forEach((tId) => {
          lines.push(`    ${tId} --> ${actId}`);
        });
      }
    }
  }

  // Ensure any top-level action without an incoming edge connects from triggers
  for (const act of topActions) {
    if (!hasIncoming.has(act.name)) {
      const actId = getSafeId(act.name);
      triggerIds.forEach((tId) => {
        lines.push(`    ${tId} --> ${actId}`);
      });
      hasIncoming.add(act.name);
    }
  }

  // 4. Handle nested actions (Condition branches, Scope/Foreach children, Switch cases)
  const renderChildSequence = (
    parentSourceId: string,
    edgeLabel: string,
    children: FlowAction[]
  ): string => {
    let prevId = parentSourceId;
    let isFirst = true;

    for (const child of children) {
      const childId = getSafeId(child.name, 'sub_');
      lines.push(formatNodeDefinition(childId, child));

      if (isFirst) {
        lines.push(`    ${parentSourceId} -->|${edgeLabel}| ${childId}`);
        isFirst = false;
      } else {
        lines.push(`    ${prevId} --> ${childId}`);
      }
      prevId = childId;

      if (child.children && child.children.length > 0) {
        renderChildSequence(childId, child.type === 'If' ? 'True' : 'Steps', child.children);
      }
      if (child.else_actions && child.else_actions.length > 0) {
        renderChildSequence(childId, 'False', child.else_actions);
      }
    }
    return prevId;
  };

  const branchTerminalNodes: string[] = [];

  for (const act of topActions) {
    const actId = getSafeId(act.name);

    if (act.type === 'If') {
      if (act.children && act.children.length > 0) {
        const lastTrueId = renderChildSequence(actId, 'True', act.children);
        branchTerminalNodes.push(lastTrueId);
      }
      if (act.else_actions && act.else_actions.length > 0) {
        const lastFalseId = renderChildSequence(actId, 'False', act.else_actions);
        branchTerminalNodes.push(lastFalseId);
      }
    } else if (act.type === 'Switch') {
      if (act.cases && Object.keys(act.cases).length > 0) {
        for (const [caseKey, caseData] of Object.entries(act.cases)) {
          if (caseData.actions && caseData.actions.length > 0) {
            const lastCaseId = renderChildSequence(actId, `Case: ${safeLabel(caseKey)}`, caseData.actions);
            branchTerminalNodes.push(lastCaseId);
          }
        }
      }
    } else if (act.children && act.children.length > 0) {
      renderChildSequence(actId, 'Execute Steps', act.children);
    }
  }

  // 5. Completion / EndNode
  lines.push(`    EndNode(["🏁 Flow Execution Complete"])`);

  let terminalConnected = false;
  for (const act of topActions) {
    if (!isDependedOn.has(act.name)) {
      const actId = getSafeId(act.name);
      if (act.type !== 'Terminate') {
        lines.push(`    ${actId} --> EndNode`);
        terminalConnected = true;
      }
    }
  }

  // If a terminal condition had branches, also link branch terminals if the condition itself is terminal
  for (const act of topActions) {
    if (!isDependedOn.has(act.name) && act.type === 'If') {
      for (const termId of branchTerminalNodes) {
        lines.push(`    ${termId} --> EndNode`);
      }
    }
  }

  if (!terminalConnected) {
    const lastAct = topActions[topActions.length - 1];
    if (lastAct && lastAct.type !== 'Terminate') {
      lines.push(`    ${getSafeId(lastAct.name)} --> EndNode`);
    }
  }

  return lines.join('\n');
}

export function generateDeterministicFlow(flow: CloudFlow): string {
  const triggerTable = generateFlowTriggersTable(flow.triggers);
  const actionTable = generateFlowActionsTable(flow.actions);
  const flowChart = generateFlowMermaidDiagram(flow);
  const flowDisplayName = cleanFlowDisplayName(flow.display_name || flow.name);

  return `# Cloud Flow: ${flowDisplayName}
## Power Automate Technical Specification

### 1. Automation Overview
- **Flow Display Name**: ${flowDisplayName}
- **State**: ${flow.status || 'Activated'}
- **Trigger Count**: ${flow.triggers.length}
- **Action Count**: ${flow.actions.length}
- **Connection References**: ${flow.connection_references.length}

---

### 2. Execution Logic Flowchart

\`\`\`mermaid
${flowChart}
\`\`\`

---

### 3. Triggers & Event Filters
${triggerTable}

---

### 4. Actions Breakdown
${actionTable}

---

### 5. Connection References & Dependencies
${flow.connection_references.map(formatConnectionReference).join('\n') || '_Uses default environment connections._'}

---

### 6. Operational & Error Handling Patterns
- **Retry Policy**: Standard exponential backoff enabled on HTTP and Dataverse operations.
- **RunAfter Dependencies**: Critical branching utilizes \`Failed\` and \`TimedOut\` evaluation guards for notifications.
`;
}

export function generateDeterministicCanvasApp(app: CanvasApp): string {
  return `# Canvas App: ${app.display_name || app.name}
## User Interface & Application Guide

### 1. Application Overview
**${app.display_name || app.name}** is a Power Apps Canvas application providing an optimized user interface for operations.

- **Screens Count**: ${app.screens.length}
- **Data Sources Connected**: ${app.data_sources.length} (\`${app.data_sources.join(', ')}\`)

---

### 2. Screen Hierarchy & Navigation

\`\`\`mermaid
flowchart LR
    ${app.screens.map((s, idx) => `S${idx}["Screen: ${s.name}"]`).join(' --> ')}
\`\`\`

---

### 3. Screen Specifications

${app.screens
      .map(
        (screen) => `### Screen: ${screen.name}
- **Controls Count**: ${screen.controls.length}
- **UI Elements**:
${screen.controls.map((c) => `  - **${c.name}** (\`${c.type}\`)`).join('\n') || '  - Standard screen layout'}
`
      )
      .join('\n\n')}

---

### 4. Connected Data Sources
${app.data_sources.map((ds) => `- **${ds}**: Primary data source`).join('\n')}
`;
}

export function generateDeterministicEnvVars(ast: SolutionAST): string {
  return `# Environment Variables & Deployment Configuration

Environment variables decouple configuration values, secrets, and URLs from solution components, ensuring zero manual edits across Dev, Test, and Production environments.

---

## Configuration Catalog

| Display Name | Schema Name | Type | Default Value | Description |
| :--- | :--- | :--- | :--- | :--- |
${ast.environment_variables
      .map(
        (v) =>
          `| **${v.display_name}** | \`${v.schema_name}\` | \`${v.type}\` | \`${v.default_value || '-'}\` | ${v.description || 'Config parameter'} |`
      )
      .join('\n')}

---

## Deployment Instructions (ALM)
1. In the target environment, create or import the deployment pipeline.
2. Bind current environment values for each variable listed above during solution import or via Azure DevOps / GitHub Actions pipeline variables.
`;
}

export function generateDeterministicWebResources(ast: SolutionAST): string {
  const webRes = ast.web_resources || [];
  const formEvents = ast.form_event_handlers || [];
  const integrations = ast.flow_integrations || [];
  const dependencies = ast.dependencies || [];

  return `# Web Resources & Client Scripting

Client-side Web Resources provide form automation, data validations, and user experience enhancements across Dataverse Model-Driven Apps and custom interfaces.

---

## 1. Web Resources Catalog

| Name | Display Name | Type | Size | Modernization Health |
| :--- | :--- | :--- | :--- | :--- |
${webRes
  .map((w) => {
    let health = '✅ Clean';
    if (w.uses_deprecated_xrm && w.uses_direct_dom) health = '🚨 Deprecated Xrm.Page & Direct DOM';
    else if (w.uses_deprecated_xrm) health = '⚠️ Deprecated Xrm.Page';
    else if (w.uses_direct_dom) health = '⚠️ Direct DOM Manipulation';
    return `| \`${w.name}\` | **${w.display_name || w.name}** | \`${w.type}\` | ${w.file_size_bytes} B | ${health} |`;
  })
  .join('\n')}

---

## 2. Form Event Handlers

The following JavaScript functions are registered on Dataverse form lifecycles (\`OnLoad\`, \`OnSave\`, \`OnChange\`):

| Entity | Form Name | Event | Target Field | Script Library | Handler Function |
| :--- | :--- | :--- | :--- | :--- | :--- |
${formEvents.length > 0
  ? formEvents
      .map(
        (f) =>
          `| \`${f.entity_name}\` | ${f.form_name} | \`${f.event_type}\` | ${f.target_field ? `\`${f.target_field}\`` : '-'} | \`${f.library_name}\` | \`${f.function_name}\` |`
      )
      .join('\n')
  : '| - | - | - | - | - | - |\n*(No form event handlers registered)*'}

---

## 3. Connector Integrations & External Services

Automated workflows and integrations in this solution connect to the following external APIs:

| Flow Name | Connector | Operation | Action Name | License Tier |
| :--- | :--- | :--- | :--- | :--- |
${integrations.length > 0
  ? integrations
      .map(
        (int) =>
          `| **${int.flow_name}** | \`${int.connector_name}\` | \`${int.operation_id || '-'}\` | ${int.action_name} | ${int.is_premium ? '🌟 Premium' : 'Standard'} |`
      )
      .join('\n')
  : '| - | - | - | - | - |\n*(No external connectors detected)*'}

---

## 4. Inverted Dependency Summary
* Total Component Dependencies Indexed: **${dependencies.length}**
* Total Web Resources: **${webRes.length}**
* Total Form Event Bindings: **${formEvents.length}**
`;
}

export function generateDeterministicBusinessRule(rule: BusinessRule, ast: SolutionAST): string {
  const tableDisplay = rule.table_display_name || rule.table;
  const tablePart = rule.table_display_name
    ? `${rule.table_display_name} (\`${rule.table}\`)`
    : `\`${rule.table}\``;

  const formatFieldTarget = (dispName?: string, logicalName?: string) => {
    if (!logicalName) return '*(Not specified)*';
    const rawDisp = dispName?.trim();
    const sysLabel = COMMON_SYSTEM_FIELD_LABELS[logicalName.toLowerCase()];
    const cleanDisp =
      rawDisp && rawDisp.toLowerCase() !== logicalName.toLowerCase()
        ? rawDisp
        : sysLabel || '';
    return cleanDisp ? `${cleanDisp} (\`${logicalName}\`)` : `\`${logicalName}\``;
  };

  const cleanActionValueDisplay = (val?: string, targetField?: string, actionType?: string) => {
    let v = (val || '').trim();
    if (!v) return '*(Not set)*';
    if (/^\[?.*Step.*\]?$/i.test(v) || /^\[SetAttributeValueStep[^\]]*\]?$/i.test(v)) {
      if (v.toLowerCase().includes('clear') || v.toLowerCase().includes('null')) {
        return 'Clear Value';
      }
      if (targetField?.toLowerCase() === 'ownerid') {
        return 'User / Team (Owner)';
      }
      return actionType === 'Set value' ? 'Set value' : '*(Not set)*';
    }
    return v;
  };

  // 1. Conditions in plain English with AND/OR grouping
  let conditionsContent = '';
  if (!rule.conditions || rule.conditions.length === 0) {
    conditionsContent = '*Always execute (no condition evaluated).*';
  } else if (rule.conditions.length === 1) {
    const c = rule.conditions[0];
    const fieldName = formatFieldTarget(c.field_display_name, c.field);
    const val = c.value ? ` "${c.value}"` : '';
    conditionsContent = `IF (${fieldName} ${c.operator}${val})`;
  } else {
    const condLines = rule.conditions.map((c, i) => {
      const prefix = i === 0 ? '' : `${c.logical_join || 'AND'} `;
      const fieldName = formatFieldTarget(c.field_display_name, c.field);
      const val = c.value ? ` "${c.value}"` : '';
      return `  ${prefix}${fieldName} ${c.operator}${val}`;
    });
    conditionsContent = `IF (\n${condLines.join('\n')}\n)`;
  }

  // 2. Actions table
  let actionsContent = '';
  if (!rule.actions || rule.actions.length === 0) {
    actionsContent = '*No actions defined.*';
  } else {
    actionsContent = `| Action Type | Target Field | Value / Message |\n| :--- | :--- | :--- |\n`;
    for (const a of rule.actions) {
      const fieldName = formatFieldTarget(a.target_field_display_name, a.target_field);
      const valDisplay = cleanActionValueDisplay(a.value_or_message, a.target_field, a.action_type);
      actionsContent += `| ${a.action_type} | ${fieldName} | ${valDisplay} |\n`;
    }
  }

  // 3. Else actions table
  let elseActionsContent = '';
  if (!rule.else_actions || rule.else_actions.length === 0) {
    elseActionsContent = '*No else actions defined.*';
  } else {
    elseActionsContent = `| Action Type | Target Field | Value / Message |\n| :--- | :--- | :--- |\n`;
    for (const a of rule.else_actions) {
      const fieldName = formatFieldTarget(a.target_field_display_name, a.target_field);
      const valDisplay = cleanActionValueDisplay(a.value_or_message, a.target_field, a.action_type);
      elseActionsContent += `| ${a.action_type} | ${fieldName} | ${valDisplay} |\n`;
    }
  }

  // 4. Fields involved: read | written
  let fieldsContent = '';
  const readList = rule.fields_read && rule.fields_read.length > 0 ? rule.fields_read : [];
  const writtenList = rule.fields_written && rule.fields_written.length > 0 ? rule.fields_written : [];

  if (readList.length === 0 && writtenList.length === 0) {
    fieldsContent = '*No fields specified.*';
  } else {
    fieldsContent = `| Field | Logical Name | Access |\n| :--- | :--- | :--- |\n`;
    const entity = ast.entities.find((e) => e.logical_name.toLowerCase() === rule.table.toLowerCase());
    for (const f of readList) {
      const attr = entity?.attributes.find((a) => a.logical_name.toLowerCase() === f.toLowerCase());
      const disp = attr?.display_name || f;
      fieldsContent += `| ${disp} | \`${f}\` | Read (Condition) |\n`;
    }
    for (const f of writtenList) {
      const attr = entity?.attributes.find((a) => a.logical_name.toLowerCase() === f.toLowerCase());
      const disp = attr?.display_name || f;
      fieldsContent += `| ${disp} | \`${f}\` | Written (Action) |\n`;
    }

    fieldsContent += `\n- **Read**: ${readList.map((f) => `\`${f}\``).join(', ') || 'None'}\n`;
    fieldsContent += `- **Written**: ${writtenList.map((f) => `\`${f}\``).join(', ') || 'None'}`;
  }

  // 5. Applies to forms
  let formsContent = '';
  if (!rule.applies_to_forms || rule.applies_to_forms.length === 0) {
    formsContent = '- All Forms';
  } else {
    formsContent = rule.applies_to_forms.map((form) => `- ${form}`).join('\n');
  }

  const slug = `${rule.table}__${rule.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return `---
doc_id: br_${slug}
doc_type: business_rule
name: ${rule.name}
logical_name: ${rule.logical_name || rule.id}
solution: ${ast.solution.unique_name}
solution_version: ${ast.solution.version}
publisher_prefix: ${ast.solution.publisher_prefix || ''}
primary_table: ${rule.table}
tags: [business-rule, dataverse, ${rule.table}, ${rule.state.toLowerCase()}]
---

# Business Rule: ${rule.name}

${rule.description ? `> ${rule.description}\n\n` : ''}Business validation and behavior automation rule defined on the **${tableDisplay}** table in **${ast.solution.display_name}**.

---

## Overview
- **Name**: ${rule.name}
- **Table**: ${tablePart}
- **Scope**: ${rule.scope}
- **State**: ${rule.state}
- **Description**: ${rule.description || '*(No description provided)*'}

## Conditions
${conditionsContent}

## Actions
${actionsContent}

## Else actions
${elseActionsContent}

## Fields involved
${fieldsContent}

## Applies to forms
${formsContent}
`;
}

export function generateDeterministicSecurityRole(role: SecurityRole, ast: SolutionAST): string {
  const slug = role.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // 1. Table privileges table
  let tablePrivilegesContent = '';
  if (!role.table_privileges || role.table_privileges.length === 0) {
    tablePrivilegesContent = '_No table privileges configured for this role._';
  } else {
    tablePrivilegesContent = `| Table | Create | Read | Write | Delete | Append | AppendTo | Assign | Share |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const p of role.table_privileges) {
      const tablePart =
        p.table_display_name && p.table_display_name.toLowerCase() !== p.table.toLowerCase()
          ? `${p.table_display_name} (\`${p.table}\`)`
          : `\`${p.table}\``;
      tablePrivilegesContent += `| ${tablePart} | ${p.create} | ${p.read} | ${p.write} | ${p.delete} | ${p.append} | ${p.append_to} | ${p.assign} | ${p.share} |\n`;
    }
  }

  // 2. Misc privileges list
  let miscPrivilegesContent = '';
  if (!role.misc_privileges || role.misc_privileges.length === 0) {
    miscPrivilegesContent = '_No miscellaneous privileges configured for this role._';
  } else {
    miscPrivilegesContent = role.misc_privileges.map((m) => `- \`${m}\``).join('\n');
  }

  // 3. Assigned to apps list
  let assignedAppsContent = '';
  if (!role.assigned_apps || role.assigned_apps.length === 0) {
    assignedAppsContent = '_No applications currently assigned to this security role._';
  } else {
    assignedAppsContent = role.assigned_apps.map((a) => `- ${a}`).join('\n');
  }

  return `---
doc_id: role_${slug}
doc_type: security_role
name: ${role.name}
solution: ${ast.solution.unique_name}
solution_version: ${ast.solution.version}
publisher_prefix: ${ast.solution.publisher_prefix || ''}
tags: [security-role, security, ${slug}]
---

# Security role: ${role.name}

${role.description ? `> ${role.description}\n\n` : ''}Security role definition and privilege matrix defined in **${ast.solution.display_name}**.

---

## Overview
- **Name**: ${role.name}
- **Business unit scope**: ${role.business_unit || 'Organization / Root'}
- **Description**: ${role.description || '*(No description provided)*'}

## Table privileges
${tablePrivilegesContent}

## Misc privileges
${miscPrivilegesContent}

## Assigned to apps
${assignedAppsContent}
`;
}

export interface DocGeneratorOptions {
  concurrency?: number;
}

interface DocTask {
  label: string;
  fn: () => Promise<DocumentRecord>;
}

/**
 * Executes async tasks with a maximum concurrency limit while preserving the exact order of the output.
 */
async function runWithConcurrency<T>(
  tasks: Array<{ label: string; fn: () => Promise<T> }>,
  concurrency: number,
  onTaskCompleted?: (completedCount: number, total: number, label: string) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let completedCount = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      const task = tasks[idx];
      try {
        results[idx] = await task.fn();
      } finally {
        completedCount++;
        onTaskCompleted?.(completedCount, tasks.length, task.label);
      }
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Main orchestrator: generates all documentation records for a given SolutionAST in parallel
 * with controlled concurrency.
 */
export async function generateDocumentationSuite(
  projectId: string,
  ast: SolutionAST,
  onProgress?: (current: number, total: number, stepLabel: string, tokenUsage?: TokenUsage) => void,
  options?: DocGeneratorOptions
): Promise<DocumentRecord[]> {
  const settings = getAISettings();
  const activeProvider = getActiveAIProvider(settings);
  const hasKey = !settings.forceDeterministicDocs && activeProvider !== 'offline';
  const concurrency = Math.max(1, options?.concurrency ?? 4);

  const accumulatedUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
  };

  const handleTokenUsage = (u: TokenUsage) => {
    accumulatedUsage.promptTokens += u.promptTokens;
    accumulatedUsage.completionTokens += u.completionTokens;
    accumulatedUsage.totalTokens += u.totalTokens;
    accumulatedUsage.requests = (accumulatedUsage.requests || 0) + (u.requests || 1);
  };

  const tasks: DocTask[] = [];

  // Step 1: Overview
  tasks.push({
    label: 'Generating Architecture Overview...',
    fn: async (): Promise<DocumentRecord> => {
      let overviewContent: string;
      if (hasKey) {
        try {
          const { system, user } = buildOverviewPrompt(ast);
          overviewContent = await callDocAI(system, user, settings, 2, handleTokenUsage);
        } catch (e) {
          console.warn('AI generation error, falling back to deterministic generator:', e);
          overviewContent = generateDeterministicOverview(ast);
        }
      } else {
        overviewContent = generateDeterministicOverview(ast);
      }

      return {
        id: `${projectId}_overview`,
        project_id: projectId,
        doc_type: 'overview',
        title: 'Architecture & Overview',
        slug: 'overview',
        content_markdown: overviewContent,
      };
    },
  });

  // Step 2: Dataverse
  tasks.push({
    label: 'Generating Dataverse Schema & ERD...',
    fn: async (): Promise<DocumentRecord> => {
      let dataverseContent: string;
      if (hasKey && ast.entities.length > 0) {
        try {
          const { system, user } = buildDataversePrompt(ast.entities[0]);
          dataverseContent = await callDocAI(system, user, settings, 2, handleTokenUsage);
        } catch (e) {
          console.warn('AI generation error, falling back to deterministic generator:', e);
          dataverseContent = generateDeterministicDataverse(ast);
        }
      } else {
        dataverseContent = generateDeterministicDataverse(ast);
      }

      return {
        id: `${projectId}_dataverse`,
        project_id: projectId,
        doc_type: 'dataverse',
        title: 'Dataverse Schema & ERD',
        slug: 'dataverse-schema',
        content_markdown: dataverseContent,
      };
    },
  });

  // Step 3: Cloud Flows
  for (const flow of ast.flows) {
    const flowTitle = cleanFlowDisplayName(flow.display_name || flow.name);
    const flowSlug = flowTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    tasks.push({
      label: `Documenting Cloud Flow: ${flowTitle}...`,
      fn: async (): Promise<DocumentRecord> => {
        let flowContent: string;
        if (hasKey) {
          try {
            const { system, user } = buildFlowPrompt(flow);
            flowContent = await callDocAI(system, user, settings, 2, handleTokenUsage);
          } catch (e) {
            console.warn(`AI generation error for flow ${flowTitle}, falling back to deterministic generator:`, e);
            flowContent = generateDeterministicFlow(flow);
          }
        } else {
          flowContent = generateDeterministicFlow(flow);
        }

        return {
          id: `${projectId}_flow_${flow.id}`,
          project_id: projectId,
          doc_type: 'flow',
          title: `Flow: ${flowTitle}`,
          slug: `flow-${flowSlug}`,
          content_markdown: flowContent,
        };
      },
    });
  }

  // Step 4: Canvas Apps
  for (const app of ast.canvas_apps) {
    const appTitle = app.display_name || app.name;
    const appSlug = appTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    tasks.push({
      label: `Documenting Canvas App: ${appTitle}...`,
      fn: async (): Promise<DocumentRecord> => {
        let appContent: string;
        if (hasKey) {
          try {
            const { system, user } = buildCanvasAppPrompt(app);
            appContent = await callDocAI(system, user, settings, 2, handleTokenUsage);
          } catch (e) {
            console.warn(`AI generation error for app ${appTitle}, falling back to deterministic generator:`, e);
            appContent = generateDeterministicCanvasApp(app);
          }
        } else {
          appContent = generateDeterministicCanvasApp(app);
        }

        return {
          id: `${projectId}_app_${app.name}`,
          project_id: projectId,
          doc_type: 'canvas_app',
          title: `App: ${appTitle}`,
          slug: `app-${appSlug}`,
          content_markdown: appContent,
        };
      },
    });
  }

  // Step 5: Environment Variables
  if (ast.environment_variables.length > 0) {
    tasks.push({
      label: 'Documenting Environment Variables...',
      fn: async (): Promise<DocumentRecord> => {
        const envVarsContent = generateDeterministicEnvVars(ast);
        return {
          id: `${projectId}_env_vars`,
          project_id: projectId,
          doc_type: 'env_vars',
          title: 'Environment Variables & Config',
          slug: 'environment-variables',
          content_markdown: envVarsContent,
        };
      },
    });
  }

  // Step 6: Web Resources & Client Scripting
  if (ast.web_resources && ast.web_resources.length > 0) {
    tasks.push({
      label: 'Documenting Web Resources & Client Scripting...',
      fn: async (): Promise<DocumentRecord> => {
        const webResContent = generateDeterministicWebResources(ast);
        return {
          id: `${projectId}_web_resources`,
          project_id: projectId,
          doc_type: 'web_resources',
          title: 'Web Resources & Client Scripting',
          slug: 'web-resources',
          content_markdown: webResContent,
        };
      },
    });
  }

  // Step 7: Business Rules (Each business rule as a separate markdown file)
  if (ast.business_rules && ast.business_rules.length > 0) {
    for (const rule of ast.business_rules) {
      const ruleSlug = `${rule.table}__${rule.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      tasks.push({
        label: `Documenting Business Rule: ${rule.name}...`,
        fn: async (): Promise<DocumentRecord> => {
          const brContent = generateDeterministicBusinessRule(rule, ast);
          return {
            id: `${projectId}_br_${rule.id}`,
            project_id: projectId,
            doc_type: 'business_rule',
            title: `Business Rule: ${rule.name}`,
            slug: ruleSlug,
            content_markdown: brContent,
          };
        },
      });
    }
  }

  // Step 8: Security Roles (Each security role as a separate markdown file)
  if (ast.security_roles && ast.security_roles.length > 0) {
    for (const role of ast.security_roles) {
      const roleSlug = role.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      tasks.push({
        label: `Documenting Security Role: ${role.name}...`,
        fn: async (): Promise<DocumentRecord> => {
          const roleContent = generateDeterministicSecurityRole(role, ast);
          return {
            id: `${projectId}_role_${role.id.replace(/[{}]/g, '')}`,
            project_id: projectId,
            doc_type: 'security_role',
            title: `Security Role: ${role.name}`,
            slug: roleSlug,
            content_markdown: roleContent,
          };
        },
      });
    }
  }

  if (tasks.length === 0) {
    return [];
  }

  // Initial progress notification
  onProgress?.(0, tasks.length, tasks[0].label);

  return runWithConcurrency(tasks, concurrency, (completed, total, label) => {
    onProgress?.(
      completed,
      total,
      label,
      hasKey && accumulatedUsage.totalTokens > 0 ? { ...accumulatedUsage } : undefined
    );
  });
}
