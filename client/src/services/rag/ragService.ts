import { SimilarityResult } from '../../types/db';
import { TokenUsage } from '../../types/solution';
import { AgentActivityStep } from '../agent/agentTypes';
import { runAgenticAssistant } from '../agent/agentRunner';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: SimilarityResult[];
  timestamp: string;
  steps?: AgentActivityStep[];
  usage?: TokenUsage;
}

export interface RAGAnswer {
  content: string;
  citations: SimilarityResult[];
  steps?: AgentActivityStep[];
  usage?: TokenUsage;
}

/**
 * Executes an agentic cycle using the OpenAI Agents SDK with semantic search,
 * IndexedDB markdown reading, and AST entity/flow inspection tools.
 */
export async function askRAGAssistant(
  query: string,
  projectId?: string,
  _limit = 10,
  conversationHistory: ChatMessage[] = [],
  onActivity?: (steps: AgentActivityStep[]) => void
): Promise<RAGAnswer> {
  const historyItems = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const answer = await runAgenticAssistant(query, projectId, historyItems, onActivity);

  return {
    content: answer.content,
    citations: answer.citations,
    steps: answer.steps,
    usage: answer.usage,
  };
}
