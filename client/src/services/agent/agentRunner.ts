import { Agent, run, OpenAIChatCompletionsModel } from '@openai/agents';
import { OpenAI } from 'openai';
import { getAISettings } from '../generator/docGenerator';
import { getAllAgentTools } from './agentTools';
import { AgentAnswer, AgentExecutionContext, AgentActivityStep } from './agentTypes';
import { SimilarityResult } from '../../types/db';
import { embedQuery } from '../embeddingService';
import { querySimilarChunks } from '../db';

export interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Local offline synthesizer for when no API key is provided or offline mode is toggled.
 */
function synthesizeOfflineAnswer(query: string, chunks: SimilarityResult[]): string {
  if (chunks.length === 0) {
    return `I searched your Power Platform solution documentation, but couldn't find any relevant sections matching **"${query}"**. Please verify your question or select a different solution scope.`;
  }

  const primaryChunk = chunks[0];
  let summary = `Based on the solution documentation for **${primaryChunk.project_name}**:\n\n`;

  summary += `### Findings from ${primaryChunk.title} (${primaryChunk.heading_context || 'General'})\n\n`;
  summary += `${primaryChunk.chunk_content}\n\n`;

  if (chunks.length > 1) {
    summary += `#### Additional References:\n`;
    for (let i = 1; i < Math.min(chunks.length, 6); i++) {
      const c = chunks[i];
      summary += `- **${c.title}** (${c.heading_context || 'Section'}): [${i + 1}] _${c.chunk_content.slice(0, 180).replace(/\n/g, ' ')}..._\n`;
    }
  }

  summary += `\n> *Refer to the citation cards below for complete context and direct document links.*`;
  return summary;
}

/**
 * Runs an offline deterministic tool loop when OpenAI API key is unavailable.
 */
async function runOfflineFallback(
  query: string,
  projectId?: string,
  onActivity?: (steps: AgentActivityStep[]) => void
): Promise<AgentAnswer> {
  const steps: AgentActivityStep[] = [];
  const citations: SimilarityResult[] = [];

  const stepId = `step_offline_${Date.now()}`;
  const startTime = performance.now();

  const searchStep: AgentActivityStep = {
    id: stepId,
    toolName: 'semantic_search',
    label: `Offline semantic search for "${query}"`,
    status: 'running',
    args: { query, projectId },
  };
  steps.push(searchStep);
  onActivity?.([...steps]);

  try {
    const queryVector = await embedQuery(query);
    const results = await querySimilarChunks(queryVector, projectId, 8, query);

    for (const r of results) {
      citations.push(r);
    }

    searchStep.status = 'completed';
    searchStep.outputSummary = `Retrieved ${results.length} chunks from PGlite`;
    searchStep.durationMs = Math.round(performance.now() - startTime);
    onActivity?.([...steps]);

    const content = synthesizeOfflineAnswer(query, citations);
    return {
      content,
      citations,
      steps,
    };
  } catch (err: any) {
    searchStep.status = 'failed';
    searchStep.outputSummary = `Offline search failed: ${err?.message || err}`;
    searchStep.durationMs = Math.round(performance.now() - startTime);
    onActivity?.([...steps]);

    return {
      content: `Offline search error: ${err?.message || err}`,
      citations: [],
      steps,
    };
  }
}

/**
 * Executes an autonomous, tool-calling agent run using the OpenAI Agents SDK.
 */
export async function runAgenticAssistant(
  query: string,
  projectId?: string,
  conversationHistory: ChatHistoryItem[] = [],
  onActivity?: (steps: AgentActivityStep[]) => void
): Promise<AgentAnswer> {
  const settings = getAISettings();
  const hasApiKey = !settings.forceLocalAnswers && Boolean(settings.apiKey && settings.apiKey.length > 5);

  if (!hasApiKey) {
    return runOfflineFallback(query, projectId, onActivity);
  }

  const context: AgentExecutionContext = {
    projectId,
    citations: [],
    steps: [],
    onActivity,
  };

  try {
    const client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl.replace(/\/+$/, ''),
      dangerouslyAllowBrowser: true,
    });

    const model = new OpenAIChatCompletionsModel(client, settings.model);

    const agent = new Agent({
      name: 'pp-pedia Agent',
      instructions: `You are pp-pedia Agent, an autonomous Microsoft Power Platform expert and solution documentation specialist.
You analyze Dataverse tables, Power Automate Cloud Flows, Canvas Apps, Environment Variables, and solution architectures.

You have access to specialized tools to inspect the solution directly in IndexedDB:
- semantic_search: Hybrid vector + keyword search over documentation chunks.
- list_documents: List all generated documentation files (.md) in IndexedDB.
- read_document_markdown: Read full or sectional markdown files by slug or ID.
- inspect_dataverse_entity: Inspect table schemas, columns, types, and 1:N / N:1 relationships directly from the solution AST.
- inspect_cloud_flow: Inspect Cloud Flow triggers, actions, and run_after hierarchy directly from the AST.
- inspect_canvas_app: Inspect Canvas App screens, controls, and formulas.
- list_solutions: List solutions and statistics.

Strategy:
1. For general or topic questions, start with \`semantic_search\`.
2. When you find relevant documents or need full context, call \`read_document_markdown\` to inspect the complete markdown text.
3. For precise table structures or columns, call \`inspect_dataverse_entity\`.
4. For flow triggers or step logic, call \`inspect_cloud_flow\`.
5. Format your answers clearly using GitHub Flavored Markdown, code blocks, tables, and Mermaid diagrams where applicable.
6. Clearly cite documents and tables referenced in your response.`,
      tools: getAllAgentTools(),
      model,
    });

    // Formulate input with recent conversation context
    let inputPrompt = query;
    if (conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-4);
      const historyStr = recent
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      inputPrompt = `Previous Conversation Context:\n${historyStr}\n\nCurrent User Request:\n${query}`;
    }

    const result = await run(agent, inputPrompt, {
      context,
      maxTurns: 10,
    });

    const answerContent =
      (typeof result.finalOutput === 'string' ? result.finalOutput : JSON.stringify(result.finalOutput)) ||
      'No answer was produced by the agent.';

    return {
      content: answerContent,
      citations: context.citations,
      steps: context.steps,
    };
  } catch (err: any) {
    console.warn('Agent SDK execution error, falling back to local synthesis:', err);
    // If it was an API key error or rate limit, fall back to offline search
    const fallback = await runOfflineFallback(query, projectId, onActivity);
    return {
      ...fallback,
      content: `*(Agent notice: Encountered an API error [${err?.message || err}]. Showing local documentation results)*\n\n${fallback.content}`,
    };
  }
}
