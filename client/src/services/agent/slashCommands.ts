export interface SlashCommandParameter {
  name: string;
  description: string;
  required: boolean;
  autocompleteType?: 'entity' | 'column' | 'connector' | 'flow' | 'doc' | 'literal';
}

export interface SlashCommandDefinition {
  name: string;
  aliases: string[];
  label: string;
  icon: string;
  description: string;
  parameters: SlashCommandParameter[];
  category: 'audit' | 'analysis' | 'inspection' | 'search' | 'info';
  example: string;
  instantRun?: boolean;
  toolName: string;
}

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    name: 'health',
    aliases: ['audit', 'scorecard'],
    label: 'Health Audit',
    icon: 'ShieldCheck',
    description: 'ALM health scorecard: audit deprecated Xrm, direct DOM, hardcoded literals, and runaway triggers.',
    parameters: [],
    category: 'audit',
    example: '/health',
    instantRun: true,
    toolName: 'audit_solution_health',
  },
  {
    name: 'impact',
    aliases: ['blast', 'radius'],
    label: 'Blast Radius',
    icon: 'Zap',
    description: 'Downstream blast radius analysis for modifying or deleting a Dataverse column across all components.',
    parameters: [
      {
        name: 'entity',
        description: 'Dataverse table logical name',
        required: true,
        autocompleteType: 'entity',
      },
      {
        name: 'column',
        description: 'Attribute/column logical name',
        required: true,
        autocompleteType: 'column',
      },
    ],
    category: 'analysis',
    example: '/impact account telephone1',
    toolName: 'analyze_column_impact',
  },
  {
    name: 'er',
    aliases: ['diagram', 'relations', 'graph'],
    label: 'ER Diagram',
    icon: 'Network',
    description: 'Interactive Mermaid ER diagram and cascade relationship matrix for Dataverse tables.',
    parameters: [
      {
        name: 'root_entity',
        description: 'Optional focus table (leave empty for full solution graph)',
        required: false,
        autocompleteType: 'entity',
      },
    ],
    category: 'analysis',
    example: '/er account',
    instantRun: true,
    toolName: 'visualize_entity_relationships',
  },
  {
    name: 'triggers',
    aliases: ['flowtriggers'],
    label: 'Trigger Audit',
    icon: 'AlertTriangle',
    description: 'Audit Cloud Flow Dataverse triggers, change types, and detect runaway flows with missing filter expressions.',
    parameters: [
      {
        name: 'table',
        description: 'Optional table filter to inspect triggers for',
        required: false,
        autocompleteType: 'entity',
      },
    ],
    category: 'audit',
    example: '/triggers account',
    instantRun: true,
    toolName: 'find_flows_by_trigger',
  },
  {
    name: 'flows',
    aliases: ['integrations', 'connectors'],
    label: 'Flow Connectors',
    icon: 'Workflow',
    description: 'Query Cloud Flows by external connector (e.g. Power BI, Dataverse, HTTP, Teams, SQL) and premium licenses.',
    parameters: [
      {
        name: 'connector',
        description: 'Connector name (e.g. "Power BI", "Dataverse", "HTTP")',
        required: false,
        autocompleteType: 'connector',
      },
    ],
    category: 'analysis',
    example: '/flows Power BI',
    instantRun: true,
    toolName: 'query_flow_integrations',
  },
  {
    name: 'components',
    aliases: ['stats', 'count', 'inventory'],
    label: 'Component Count',
    icon: 'Layers',
    description: 'Exact quantitative breakdown of all solution components (entities, flows, canvas apps, web resources, etc.) from PGlite.',
    parameters: [],
    category: 'info',
    example: '/components',
    instantRun: true,
    toolName: 'count_solution_components',
  },
  {
    name: 'js',
    aliases: ['webresources', 'scripts'],
    label: 'Script Audit',
    icon: 'Code2',
    description: 'Audit client-side JavaScript web resources for deprecated Xrm.Page APIs, direct DOM manipulation, and form handlers.',
    parameters: [],
    category: 'audit',
    example: '/js',
    instantRun: true,
    toolName: 'audit_web_resources',
  },
  {
    name: 'validate',
    aliases: ['contract'],
    label: 'Validate Field',
    icon: 'CheckSquare',
    description: 'Analyze impact of adding validations or making a column required on write operations from flows and apps.',
    parameters: [
      {
        name: 'entity',
        description: 'Dataverse table logical name',
        required: true,
        autocompleteType: 'entity',
      },
      {
        name: 'column',
        description: 'Column to make required or validate',
        required: true,
        autocompleteType: 'column',
      },
    ],
    category: 'analysis',
    example: '/validate account customertypecode',
    toolName: 'analyze_validation_impact',
  },
  {
    name: 'literals',
    aliases: ['hardcoded', 'secrets'],
    label: 'Hardcoded Literals',
    icon: 'Lock',
    description: 'Audit hardcoded GUIDs, URLs, and emails across flows, apps, and scripts for ALM portability risks.',
    parameters: [
      {
        name: 'type',
        description: 'Literal type: GUID, URL, or EMAIL',
        required: false,
        autocompleteType: 'literal',
      },
    ],
    category: 'audit',
    example: '/literals GUID',
    instantRun: true,
    toolName: 'audit_hardcoded_literals',
  },
  {
    name: 'entity',
    aliases: ['table', 'inspect-entity'],
    label: 'Inspect Entity',
    icon: 'Database',
    description: 'Inspect Dataverse table schema, columns, data types, and 1:N / N:1 relationships.',
    parameters: [
      {
        name: 'name',
        description: 'Entity logical or schema name',
        required: true,
        autocompleteType: 'entity',
      },
    ],
    category: 'inspection',
    example: '/entity account',
    toolName: 'inspect_dataverse_entity',
  },
  {
    name: 'flow',
    aliases: ['inspect-flow'],
    label: 'Inspect Flow',
    icon: 'GitBranch',
    description: 'Inspect Cloud Flow triggers, actions, and run_after hierarchy directly from the AST.',
    parameters: [
      {
        name: 'name',
        description: 'Cloud Flow display name',
        required: true,
        autocompleteType: 'flow',
      },
    ],
    category: 'inspection',
    example: '/flow "Sync Customers"',
    toolName: 'inspect_cloud_flow',
  },
  {
    name: 'app',
    aliases: ['inspect-app'],
    label: 'Inspect App',
    icon: 'Layout',
    description: 'Inspect Canvas App screens, controls count, and key Power Fx formulas.',
    parameters: [
      {
        name: 'name',
        description: 'Canvas App name',
        required: true,
      },
    ],
    category: 'inspection',
    example: '/app "Field Service Mobile"',
    toolName: 'inspect_canvas_app',
  },
  {
    name: 'solutions',
    aliases: ['projects', 'list-solutions'],
    label: 'List Solutions',
    icon: 'Box',
    description: 'List all Power Platform solutions stored in PGlite with publisher and component metrics.',
    parameters: [],
    category: 'info',
    example: '/solutions',
    instantRun: true,
    toolName: 'list_solutions',
  },
  {
    name: 'docs',
    aliases: ['list-docs'],
    label: 'List Docs',
    icon: 'BookOpen',
    description: 'List all generated documentation markdown files in PGlite.',
    parameters: [],
    category: 'info',
    example: '/docs',
    instantRun: true,
    toolName: 'list_documents',
  },
  {
    name: 'read',
    aliases: ['view-doc'],
    label: 'Read Document',
    icon: 'FileText',
    description: 'Read the full markdown documentation for a specific component by slug or ID.',
    parameters: [
      {
        name: 'slug',
        description: 'Document slug or ID',
        required: true,
        autocompleteType: 'doc',
      },
    ],
    category: 'inspection',
    example: '/read overview',
    toolName: 'read_document_markdown',
  },
  {
    name: 'search',
    aliases: ['find', 'rag'],
    label: 'Semantic Search',
    icon: 'Search',
    description: 'Run hybrid vector + keyword semantic search directly against PGlite document chunks.',
    parameters: [
      {
        name: 'query',
        description: 'Search query or concept',
        required: true,
      },
    ],
    category: 'search',
    example: '/search dataverse security model',
    toolName: 'semantic_search',
  },
];

/**
 * Finds a command definition by name or alias
 */
export function findSlashCommand(commandName: string): SlashCommandDefinition | undefined {
  const clean = commandName.toLowerCase().replace(/^\//, '').trim();
  return SLASH_COMMANDS.find(
    (c) => c.name === clean || c.aliases.includes(clean)
  );
}
