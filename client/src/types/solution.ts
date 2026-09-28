export interface SolutionMetadata {
  unique_name: string;
  display_name: string;
  version: string;
  is_managed: boolean;
  publisher_name?: string;
  publisher_prefix?: string;
  description?: string;
  root_components?: Array<{
    type: number;
    schema_name?: string;
    id?: string;
  }>;
}

export interface OptionSetItem {
  value: number;
  label: string;
  description?: string;
}

export interface OptionSet {
  name: string;
  display_name?: string;
  is_global: boolean;
  options: OptionSetItem[];
}

export interface DataverseAttribute {
  logical_name: string;
  schema_name?: string;
  display_name: string;
  description?: string;
  type: string;
  format?: string;
  required_level?: 'None' | 'ApplicationRequired' | 'SystemRequired' | 'Recommended';
  is_primary_id?: boolean;
  is_primary_name?: boolean;
  lookup_target_entity?: string;
  options?: OptionSetItem[];
}

export interface DataverseRelationship {
  schema_name: string;
  relationship_type: '1:N' | 'N:1' | 'N:N';
  primary_entity: string;
  referencing_entity: string;
  referencing_attribute?: string;
  cascade_delete?: string;
  cascade_assign?: string;
}

export interface DataverseEntity {
  logical_name: string;
  schema_name?: string;
  display_name: string;
  description?: string;
  primary_id_attribute?: string;
  primary_name_attribute?: string;
  entity_set_name?: string;
  attributes: DataverseAttribute[];
  relationships: DataverseRelationship[];
}

export interface FlowTrigger {
  name: string;
  type: string;
  kind?: string;
  inputs?: Record<string, unknown>;
  filter_expression?: string;
  recurrence?: {
    frequency?: string;
    interval?: number;
  };
}

export interface FlowAction {
  name: string;
  type: string;
  description?: string;
  run_after?: Record<string, string[]>;
  inputs?: Record<string, unknown>;
  children?: FlowAction[];
  else_actions?: FlowAction[];
  cases?: Record<string, { actions: FlowAction[] }>;
}

export interface ConnectionReference {
  logical_name: string;
  connection_type?: string;
  connector_id?: string;
}

export interface CloudFlow {
  id: string;
  name: string;
  display_name?: string;
  status?: string;
  triggers: FlowTrigger[];
  actions: FlowAction[];
  connection_references: ConnectionReference[];
}

export interface CanvasControl {
  name: string;
  type: string;
  properties?: Record<string, string>;
}

export interface CanvasScreen {
  name: string;
  controls_count?: number;
  controls: CanvasControl[];
}

export interface CanvasApp {
  name: string;
  display_name: string;
  screens: CanvasScreen[];
  data_sources: string[];
  components: string[];
}

export interface EnvironmentVariable {
  schema_name: string;
  display_name: string;
  type: 'String' | 'Number' | 'Boolean' | 'JSON' | 'Secret' | string;
  default_value?: string;
  current_value?: string;
  description?: string;
}

export interface SiteMapSubArea {
  id: string;
  title: string;
  entity?: string;
  url?: string;
}

export interface SiteMapGroup {
  id: string;
  title: string;
  sub_areas: SiteMapSubArea[];
}

export interface SiteMapArea {
  id: string;
  title: string;
  groups: SiteMapGroup[];
}

export interface SiteMap {
  areas: SiteMapArea[];
}

export type WebResourceType =
  | 'HTML'
  | 'CSS'
  | 'JavaScript'
  | 'XML'
  | 'PNG'
  | 'JPG'
  | 'GIF'
  | 'XAP'
  | 'XSL'
  | 'ICO'
  | 'SVG'
  | 'RESX'
  | 'Unknown';

export interface WebResource {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  type: WebResourceType;
  type_code: number;
  file_path?: string;
  content_text?: string;
  file_size_bytes: number;
  detected_functions?: string[];
  uses_deprecated_xrm?: boolean;
  uses_direct_dom?: boolean;
}

export interface FormEventHandler {
  id: string;
  entity_name: string;
  form_id?: string;
  form_name: string;
  event_type: 'OnLoad' | 'OnSave' | 'OnChange' | 'TabStateChange';
  target_field?: string;
  library_name: string;
  function_name: string;
  pass_execution_context: boolean;
  enabled: boolean;
}

export interface ComponentDependency {
  id: string;
  source_type: 'flow' | 'canvas_app' | 'javascript' | 'relationship' | 'formula';
  source_id: string;
  source_name: string;
  location_detail?: string;
  target_entity: string;
  target_field?: string;
  operation_type: 'READ' | 'WRITE' | 'TRIGGER_FILTER' | 'LOOKUP' | 'DELETE';
  context_snippet?: string;
}

export interface FlowIntegration {
  id: string;
  flow_id: string;
  flow_name: string;
  connector_id: string;
  connector_name: string;
  operation_id?: string;
  action_name: string;
  is_premium: boolean;
}

export interface FlowTriggerDetail {
  id: string;
  flow_id: string;
  flow_name: string;
  trigger_type: string;
  table_name?: string;
  change_type?: string;
  filter_expression?: string;
  has_filter: boolean;
  select_columns?: string[];
}

export interface HardcodedLiteral {
  id: string;
  component_type: 'flow' | 'canvas_app' | 'javascript';
  component_name: string;
  literal_type: 'GUID' | 'URL' | 'EMAIL';
  value: string;
  code_context?: string;
}

export interface SolutionStats {
  entity_count: number;
  flow_count: number;
  canvas_app_count: number;
  env_var_count: number;
  relationship_count: number;
  option_set_count: number;
  web_resource_count?: number;
  script_count?: number;
  dependency_count?: number;
}

export interface SolutionAST {
  solution: SolutionMetadata;
  entities: DataverseEntity[];
  option_sets: OptionSet[];
  flows: CloudFlow[];
  canvas_apps: CanvasApp[];
  environment_variables: EnvironmentVariable[];
  site_map?: SiteMap;
  web_resources?: WebResource[];
  form_event_handlers?: FormEventHandler[];
  dependencies?: ComponentDependency[];
  flow_integrations?: FlowIntegration[];
  flow_triggers?: FlowTriggerDetail[];
  hardcoded_literals?: HardcodedLiteral[];
  stats: SolutionStats;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests?: number;
}

