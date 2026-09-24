import {
  SolutionAST,
  SolutionStats,
  WebResourceType,
} from './solution';

export interface ProjectRecord {
  id: string;
  unique_name: string;
  display_name: string;
  version: string;
  is_managed: boolean;
  publisher_name?: string;
  description?: string;
  ast_json: SolutionAST;
  stats: SolutionStats;
  created_at?: string;
  updated_at?: string;
}

export type DocumentType =
  | 'overview'
  | 'dataverse'
  | 'flow'
  | 'canvas_app'
  | 'env_vars'
  | 'web_resources'
  | 'index';

export interface DocumentRecord {
  id: string;
  project_id: string;
  doc_type: DocumentType;
  title: string;
  slug: string;
  content_markdown: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface ChunkRecord {
  id: string;
  document_id: string;
  project_id: string;
  chunk_index: number;
  chunk_content: string;
  heading_context?: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface WebResourceRecord {
  id: string;
  project_id: string;
  name: string;
  display_name?: string;
  resource_type: WebResourceType;
  description?: string;
  file_size_bytes: number;
  content_text?: string;
  detected_functions?: string[];
  uses_deprecated_xrm: boolean;
  uses_direct_dom: boolean;
  created_at?: string;
}

export interface FormEventHandlerRecord {
  id: string;
  project_id: string;
  entity_name: string;
  form_id?: string;
  form_name: string;
  event_type: string;
  target_field?: string;
  library_name: string;
  function_name: string;
  pass_execution_context: boolean;
  enabled: boolean;
  created_at?: string;
}

export interface ComponentDependencyRecord {
  id: string;
  project_id: string;
  source_type: 'flow' | 'canvas_app' | 'javascript' | 'relationship' | 'formula';
  source_id: string;
  source_name: string;
  location_detail?: string;
  target_entity: string;
  target_field?: string;
  operation_type: 'READ' | 'WRITE' | 'TRIGGER_FILTER' | 'LOOKUP' | 'DELETE';
  context_snippet?: string;
  created_at?: string;
}

export interface FlowIntegrationRecord {
  id: string;
  project_id: string;
  flow_id: string;
  flow_name: string;
  connector_id: string;
  connector_name: string;
  operation_id?: string;
  action_name: string;
  is_premium: boolean;
  created_at?: string;
}

export interface FlowTriggerRecord {
  id: string;
  project_id: string;
  flow_id: string;
  flow_name: string;
  trigger_type: string;
  table_name?: string;
  change_type?: string;
  filter_expression?: string;
  has_filter: boolean;
  select_columns?: string[];
  created_at?: string;
}

export interface HardcodedLiteralRecord {
  id: string;
  project_id: string;
  component_type: 'flow' | 'canvas_app' | 'javascript';
  component_name: string;
  literal_type: 'GUID' | 'URL' | 'EMAIL';
  value: string;
  code_context?: string;
  created_at?: string;
}

export interface SimilarityResult {
  id: string;
  chunk_content: string;
  heading_context?: string;
  title: string;
  slug: string;
  project_id: string;
  project_name: string;
  similarity: number;
}

export interface DatabaseStats {
  project_count: number;
  document_count: number;
  chunk_count: number;
  web_resource_count?: number;
  dependency_count?: number;
  flow_integration_count?: number;
}

