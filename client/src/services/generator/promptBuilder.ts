import { SolutionAST, DataverseEntity, CloudFlow, CanvasApp, FlowAction } from '../../types/solution';
import { cleanFlowDisplayName } from '../parser/solutionParser';
import { formatConnectionReference } from './connectorUtils';

export function buildOverviewPrompt(ast: SolutionAST): { system: string; user: string } {
  const system = `You are a Microsoft Power Platform Solution Architect and Technical Writer.
Generate comprehensive, executive-ready technical documentation for a Power Platform solution.
Your output must strictly follow the required solution overview section structure using GitHub Flavored Markdown with clean tables and bullet points.`;

  const totalCols = ast.entities.reduce((acc, e) => acc + e.attributes.length, 0);

  const user = `Document the following Power Platform solution:
- Display Name: ${ast.solution.display_name}
- Unique Name: ${ast.solution.unique_name}
- Version: ${ast.solution.version}
- Package Type: ${ast.solution.is_managed ? 'Managed' : 'Unmanaged'}
- Publisher: ${ast.solution.publisher_name || 'Standard Publisher'} (${ast.solution.publisher_prefix || 'new'})
- Description: ${ast.solution.description || 'No description provided'}

Component Summary:
- Dataverse Tables: ${ast.entities.length} tables, ${totalCols} total columns (${ast.entities.map((e) => `${e.display_name} [${e.logical_name}]: ${e.attributes.length} cols, ${e.forms_count ?? 0} forms, ${e.views_count ?? 0} views`).join(', ')})
- Cloud Flows: ${ast.flows.length} (${ast.flows.map((f) => cleanFlowDisplayName(f.display_name || f.name)).join(', ')})
- Canvas Apps: ${ast.canvas_apps.length} (${ast.canvas_apps.map((a) => `${a.display_name} (${a.screens.length} screens)`).join(', ')})
- Model-Driven Apps / Sitemap: ${ast.site_map ? ast.site_map.areas.map((a) => a.title).join(', ') : 'None'}
- Environment Variables: ${ast.environment_variables.length} (${ast.environment_variables.map((v) => `${v.display_name} (${v.schema_name}): ${v.type}`).join(', ')})
- Relationships: ${ast.stats.relationship_count}
- Dependencies: ${ast.dependencies?.length || 0} cross-component dependencies

You MUST structure the documentation using EXACTLY the following 8 sections and level-2 markdown headers (##):

## Overview
– Include unique name, display name, version, publisher, managed/unmanaged status, and description in a clean table and brief summary.

## Component inventory
– Table with columns: Component Type | Count (listing Dataverse tables, columns, relationships, cloud flows, canvas apps, model-driven apps, environment variables, connection references, etc.)

## Apps
– Bulleted list of canvas applications and model-driven applications with descriptive details and markdown links.

## Automation
– Table of flows / workflows / BPFs / plugins summary with columns: Name | Type | Trigger / Execution | Scope / Actions | Status.

## Data model
– Table listing all Dataverse tables with record counts: Table | Logical Name | Columns | Forms | Views.

## Connectors used
– Table with columns: Connector | # Flows | # Apps | Connection References.

## Environment variables
– Table with columns: Name | Type | Default | Current.

## Dependency highlights
– Table of cross-component dependencies with columns: Source Component | Type | Operation | Target Entity / Field | Context / Details.

Ensure all 8 headers match this exact format. Output clean tables and concise, informative markdown.`;

  return { system, user };
}

export function buildDataversePrompt(entity: DataverseEntity): { system: string; user: string } {
  const system = `You are a Microsoft Dataverse Database Architect and Technical Writer.
Generate thorough, detailed technical documentation for Dataverse tables and schemas.
Include entity purpose, primary keys, attribute tables with logical names and types, relationship tables with cascading rules, and a clean Mermaid erDiagram representing the entity and its related tables.`;

  const user = `Document the following Dataverse table:
Entity Display Name: ${entity.display_name}
Logical Name: ${entity.logical_name}
Schema Name: ${entity.schema_name}
Description: ${entity.description || 'N/A'}
Primary ID: ${entity.primary_id_attribute}
Primary Name Attribute: ${entity.primary_name_attribute || 'N/A'}

Attributes (${entity.attributes.length}):
${entity.attributes
  .map(
    (a) =>
      `- ${a.logical_name} (${a.display_name}): Type=${a.type}, Required=${a.required_level || 'None'}, Lookup=${a.lookup_target_entity || 'N/A'}${
        a.options ? `, Choices=[${a.options.map((o) => o.label).join(', ')}]` : ''
      }`
  )
  .join('\n')}

Relationships (${entity.relationships.length}):
${entity.relationships
  .map(
    (r) =>
      `- ${r.schema_name}: ${r.relationship_type} with ${r.primary_entity} -> ${r.referencing_entity} (Key: ${r.referencing_attribute || 'N/A'}, Delete Cascade: ${r.cascade_delete || 'N/A'})`
  )
  .join('\n')}

Please produce:
1. Entity Overview & Business Purpose
2. Mermaid ERD Diagram (\`\`\`mermaid erDiagram ...)
3. Attribute Dictionary (Markdown table: Display Name, Logical Name, Data Type, Required, Description)
4. Relationships & Foreign Key Mappings
5. Option Sets / Choice Definitions`;

  return { system, user };
}

function formatActionsHierarchy(actions: FlowAction[], indent = ''): string {
  return actions
    .map((a) => {
      let text = `${indent}- [${a.type}] ${a.name} (runAfter: ${JSON.stringify(a.run_after || {})})`;
      if (a.children && a.children.length > 0) {
        text += `\n${indent}  * Children / True Branch:\n` + formatActionsHierarchy(a.children, indent + '    ');
      }
      if (a.else_actions && a.else_actions.length > 0) {
        text += `\n${indent}  * False / Else Branch:\n` + formatActionsHierarchy(a.else_actions, indent + '    ');
      }
      if (a.cases && Object.keys(a.cases).length > 0) {
        for (const [caseKey, caseVal] of Object.entries(a.cases)) {
          text += `\n${indent}  * Case '${caseKey}':\n` + formatActionsHierarchy(caseVal.actions, indent + '    ');
        }
      }
      return text;
    })
    .join('\n');
}

export function buildFlowPrompt(flow: CloudFlow): { system: string; user: string } {
  const system = `You are a Microsoft Power Automate Solution Architect.
Produce clear, actionable technical documentation for Cloud Flows.
Explain the business process automation, trigger conditions, step-by-step action sequences, conditional branches, error handling / runAfter logic, and connection references.
Always include a clear Mermaid flowchart (\`\`\`mermaid flowchart TD ...) visualizing the flow's execution path.`;

  const user = `Document the following Power Automate Cloud Flow:
Flow Display Name: ${cleanFlowDisplayName(flow.display_name || flow.name)}
Status: ${flow.status || 'Activated'}

Triggers:
${flow.triggers.map((t) => `- [${t.type}] ${t.name}: inputs=${JSON.stringify(t.inputs || {})}`).join('\n')}

Actions Summary:
${formatActionsHierarchy(flow.actions) || '_No actions defined in flow._'}

Connections:
${flow.connection_references.map(formatConnectionReference).join('\n') || '_Uses default environment connections._'}

Please generate:
1. Process Automation Summary
2. Execution Path Diagram (Mermaid flowchart TD)
3. Trigger Specification & Filter Conditions
4. Detailed Actions & Branching Logic Breakdown
5. Error Handling, Retries & RunAfter Patterns
6. Security & Connection References`;

  return { system, user };
}

export function buildCanvasAppPrompt(app: CanvasApp): { system: string; user: string } {
  const system = `You are a Microsoft Power Apps Canvas App Specialist and UX Designer.
Produce detailed technical documentation for Canvas Apps, covering the screen hierarchy, user flows, control composition, data source integration, and key formulas.`;

  const user = `Document the following Canvas App:
App Name: ${app.display_name || app.name}
Data Sources: ${app.data_sources.join(', ')}
Screens (${app.screens.length}):
${app.screens
  .map(
    (s) =>
      `Screen "${s.name}": Controls: ${s.controls.map((c) => `${c.name} (${c.type})`).join(', ')}`
  )
  .join('\n\n')}

Please generate:
1. Application Overview & Target User Roles
2. Screen Hierarchy & Navigation Flow (Mermaid flowchart LR)
3. Data Source Architecture & Integration
4. Screen-by-Screen Breakdown & UI Controls
5. Power Fx Patterns & Performance Recommendations`;

  return { system, user };
}

