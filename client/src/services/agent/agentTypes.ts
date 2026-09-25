import { SimilarityResult } from '../../types/db';
import { TokenUsage } from '../../types/solution';

export interface AgentActivityStep {
  id: string;
  toolName: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  args?: Record<string, unknown>;
  outputSummary?: string;
  durationMs?: number;
}

export interface AgentExecutionContext {
  projectId?: string;
  citations: SimilarityResult[];
  steps: AgentActivityStep[];
  onActivity?: (steps: AgentActivityStep[]) => void;
}

export interface AgentAnswer {
  content: string;
  citations: SimilarityResult[];
  steps: AgentActivityStep[];
  usage?: TokenUsage;
}
