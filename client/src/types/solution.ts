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

export interface SolutionStats {
  entity_count: number;
  flow_count: number;
  canvas_app_count: number;
  env_var_count: number;
  relationship_count: number;
  option_set_count: number;
}

export interface SolutionAST {
  solution: SolutionMetadata;
  entities: DataverseEntity[];
  option_sets: OptionSet[];
  flows: CloudFlow[];
  canvas_apps: CanvasApp[];
  environment_variables: EnvironmentVariable[];
  site_map?: SiteMap;
  stats: SolutionStats;
}

