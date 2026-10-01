import { GoogleGenAI } from '@google/genai';
import { getAISettings } from '../generator/docGenerator';
import { getGoogleAgentTools } from './agentTools';
import { AgentAnswer, AgentExecutionContext, AgentActivityStep } from './agentTypes';
import { TokenUsage } from '../../types/solution';
import { ChatHistoryItem } from './agentRunner';
import { logger } from '../logger';

const AGENT_SYSTEM_INSTRUCTION = `You are pp-pedia Agent, an autonomous Microsoft Power Platform expert and solution documentation specialist.
You analyze Dataverse tables, Power Automate Cloud Flows, Canvas Apps, Environment Variables, JavaScript Web Resources, and solution architectures.

You have access to specialized tools to inspect the solution directly in IndexedDB:
- analyze_column_impact: High-precision blast radius analysis for deleting or modifying a Dataverse column/attribute. Queries relational dependencies across Cloud Flows, Canvas Apps, JavaScript Web Resources, Form Event Handlers, and Foreign Keys.
- analyze_validation_impact: Evaluates impact of adding a validation or making a field required on a Dataverse table. Finds which Cloud Flows or Canvas Apps write to the table without setting that column.
- query_flow_integrations: Finds Cloud Flows using specific connectors or external APIs (e.g. "Power BI", "Dataverse", "Teams", "SQL", "HTTP") and filters by premium licensing.
- audit_web_resources: Audits client-side JavaScript Web Resources for deprecated Xrm.Page APIs, direct DOM manipulation, and lists registered form event handlers (OnLoad, OnSave, OnChange).
- audit_hardcoded_literals: Audits hardcoded GUIDs, URLs, and emails across flows, apps, and scripts for ALM portability.
- semantic_search: Hybrid vector + keyword search over documentation chunks.
- list_documents: List all generated documentation files (.md) in IndexedDB.
- read_document_markdown: Read full or sectional markdown files by slug or ID.
- inspect_dataverse_entity: Inspect table schemas, columns, types, and 1:N / N:1 relationships directly from the solution AST.
- inspect_cloud_flow: Inspect Cloud Flow triggers, actions, and run_after hierarchy directly from the AST.
- inspect_canvas_app: Inspect Canvas App screens, controls, and formulas.
- list_solutions: List solutions and statistics.

Strategy:
1. For blast radius, deleting or renaming a column: ALWAYS call \`analyze_column_impact\` first.
2. For adding validations, making a field required, or contract checks: ALWAYS call \`analyze_validation_impact\` first.
3. For questions about connectors or services (e.g. "Which flows use Power BI?"): ALWAYS call \`query_flow_integrations\` first.
4. For client-side JavaScript, forms, or deprecated APIs: Call \`audit_web_resources\`.
5. For hardcoded values or environment drift: Call \`audit_hardcoded_literals\`.
6. For general architectural concepts or topics, call \`semantic_search\` or \`read_document_markdown\`.
7. Format your answers clearly using GitHub Flavored Markdown, code blocks, tables, and Mermaid diagrams where applicable.
8. Clearly cite documents and tables referenced in your response.`;

/**
 * Runs an autonomous agent reasoning and tool execution loop using the Google Gen AI SDK (Gemini).
 */
export async function runGoogleAgentAssistant(
  query: string,
  projectId?: string,
  conversationHistory: ChatHistoryItem[] = [],
  onActivity?: (steps: AgentActivityStep[]) => void
): Promise<AgentAnswer> {
  const settings = getAISettings();
  const context: AgentExecutionContext = {
    projectId,
    citations: [],
    steps: [],
    onActivity,
  };

  const ai = new GoogleGenAI({ apiKey: settings.googleApiKey });
  const { tools, executorMap } = getGoogleAgentTools();

  // Convert conversation history to Gemini Content array
  const history: any[] = [];
  if (conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-4);
    for (const msg of recent) {
      history.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const chat = ai.chats.create({
    model: settings.googleModel || 'gemini-2.5-flash',
    config: {
      systemInstruction: AGENT_SYSTEM_INSTRUCTION,
      tools,
      temperature: 0.2,
    },
    history,
  });

  let currentMessage: any = query;
  let turn = 0;
  const maxTurns = 10;
  let finalAnswer = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let requests = 0;

  while (turn < maxTurns) {
    turn++;
    logger.agentCycle('Google Gemini', turn, settings.googleModel || 'gemini-2.5-flash', currentMessage);
    const cycleStartTime = performance.now();
    const response = await chat.sendMessage({ message: currentMessage });
    const duration = Math.round(performance.now() - cycleStartTime);
    requests++;

    const usageMetadata = response.usageMetadata;
    if (usageMetadata) {
      promptTokens += usageMetadata.promptTokenCount ?? 0;
      completionTokens += usageMetadata.candidatesTokenCount ?? 0;
      totalTokens += usageMetadata.totalTokenCount ?? 0;
    }

    logger.llmResponse(
      'Google Gemini',
      turn,
      {
        text: response.text,
        functionCalls: response.functionCalls,
      },
      usageMetadata,
      duration
    );

    const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0) {
      finalAnswer = response.text || '';
      break;
    }

    // Execute tool calls dispatched by the model
    const functionResponses: any[] = [];
    for (const call of functionCalls) {
      const toolName = call.name || '';
      const toolArgs = call.args || {};
      const executor = toolName ? executorMap.get(toolName) : undefined;

      let toolOutput = '';
      if (executor) {
        try {
          toolOutput = await executor(toolArgs, context);
        } catch (err: any) {
          toolOutput = `Tool execution error: ${err?.message || err}`;
        }
      } else {
        toolOutput = `Error: Tool "${toolName}" not found.`;
      }

      functionResponses.push({
        functionResponse: {
          name: toolName,
          response: {
            output: toolOutput,
          },
          id: (call as any).id,
        },
      });
    }

    // Provide the function execution outputs back to the chat session
    currentMessage = functionResponses;
  }

  if (!finalAnswer) {
    finalAnswer = 'The agent finished processing the request.';
  }

  const usage: TokenUsage | undefined =
    totalTokens > 0
      ? {
          promptTokens,
          completionTokens,
          totalTokens,
          requests: Math.max(1, requests),
        }
      : undefined;

  logger.info(
    'Google Gemini',
    `Run finished in ${turn} turns with ${context.steps.length} steps and ${context.citations.length} citations.`
  );

  return {
    content: finalAnswer,
    citations: context.citations,
    steps: context.steps,
    usage,
  };
}
