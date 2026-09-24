import { SolutionAST, SolutionStats } from './solution';

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
}

