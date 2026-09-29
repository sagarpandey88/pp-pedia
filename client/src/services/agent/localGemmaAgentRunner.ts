import { getOrInitGemmaEngine, DEFAULT_GEMMA_MODEL } from '../gemma/gemmaEngine';
import { getGemmaAgentTools } from './agentTools';
import { AgentAnswer, AgentExecutionContext, AgentActivityStep } from './agentTypes';
import { ChatHistoryItem } from './agentRunner';
import { getAISettings } from '../generator/docGenerator';

const GEMMA_AGENT_SYSTEM_INSTRUCTION = `You are pp-pedia Agent, an autonomous Microsoft Power Platform expert and solution documentation specialist running locally in the browser via Google Gemma.
You analyze Dataverse tables, Power Automate Cloud Flows, Canvas Apps, Environment Variables, JavaScript Web Resources, and solution architectures.

You have access to specialized tools to inspect the solution directly in local IndexedDB:
- analyze_column_impact: High-precision blast radius analysis for deleting or modifying a Dataverse column/attribute. Queries relational dependencies across Cloud Flows, Canvas Apps, JavaScript Web Resources, Form Event Handlers, and Foreign Keys.
- analyze_validation_impact: Evaluates impact of adding a validation or making a field required on a Dataverse table. Finds which Cloud Flows or Canvas Apps write to the table without setting that column.
- query_flow_integrations: Finds Cloud Flows using specific connectors or external APIs (e.g. "Power BI", "Dataverse", "Teams", "SQL", "HTTP") and filters by premium licensing.
- inspect_dataverse_entity: Inspect table schemas, columns, types, and relationships directly from the solution AST.
- inspect_cloud_flow: Inspect Cloud Flow triggers, actions, and run_after hierarchy directly from the AST.
- semantic_search: Hybrid vector + keyword search over documentation chunks in local PGlite.
- read_document_markdown: Read full or sectional markdown files by slug or ID.

Strategy:
1. For blast radius, deleting or renaming a column: ALWAYS call analyze_column_impact first.
2. For adding validations or making a field required: ALWAYS call analyze_validation_impact first.
3. For questions about connectors or external services: ALWAYS call query_flow_integrations first.
4. For table schemas or relationships: Call inspect_dataverse_entity.
5. For general architectural concepts or topics: Call semantic_search or read_document_markdown.
6. When you have gathered sufficient tool observations, provide a comprehensive, well-structured final answer with Markdown tables, bold headers, and clear conclusions.`;

/**
 * Parses potential text-encoded tool calls if the SLM emits markdown JSON code blocks instead of native tool_calls.
 */
function extractFallbackToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  if (!text) return calls;

  const codeBlockRegex = /```(?:json|tool_call)?\s*(\{[\s\S]*?\})\s*```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name && (parsed.arguments || parsed.args || parsed.parameters)) {
        calls.push({
          name: parsed.name,
          args: parsed.arguments || parsed.args || parsed.parameters || {},
        });
      } else if (parsed.tool && parsed.parameters) {
        calls.push({
          name: parsed.tool,
          args: parsed.parameters,
        });
      }
    } catch {
      // Ignore unparseable blocks
    }
  }

  return calls;
}

/**
 * Runs an autonomous agent reasoning and tool execution loop using Google Gemma in-browser via WebLLM.
 */
export async function runLocalGemmaAgent(
  query: string,
  projectId?: string,
  conversationHistory: ChatHistoryItem[] = [],
  onActivity?: (steps: AgentActivityStep[]) => void,
  onToken?: (delta: string) => void
): Promise<AgentAnswer> {
  const settings = getAISettings();
  const modelId = settings.localGemmaModel || DEFAULT_GEMMA_MODEL;

  const context: AgentExecutionContext = {
    projectId,
    citations: [],
    steps: [],
    onActivity,
  };

  const initStepId = `step_gemma_init_${Date.now()}`;
  const initStep: AgentActivityStep = {
    id: initStepId,
    toolName: 'gemma_engine',
    label: 'Initialize Local Gemma SLM (WebGPU)',
    status: 'running',
  };
  context.steps.push(initStep);
  onActivity?.([...context.steps]);

  let engine;
  try {
    engine = await getOrInitGemmaEngine(modelId, (report) => {
      initStep.outputSummary = report.text;
      onActivity?.([...context.steps]);
    });
    initStep.status = 'completed';
    initStep.outputSummary = `Gemma SLM active in Web Worker (${modelId})`;
    onActivity?.([...context.steps]);
  } catch (err: any) {
    initStep.status = 'failed';
    initStep.outputSummary = `WebGPU model initialization failed: ${err?.message || err}`;
    onActivity?.([...context.steps]);
    throw err;
  }

  const { tools, executorMap } = getGemmaAgentTools(true);

  // Build message history
  const messages: any[] = [
    { role: 'system', content: GEMMA_AGENT_SYSTEM_INSTRUCTION },
  ];

  if (conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-4);
    for (const msg of recent) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
  }

  messages.push({ role: 'user', content: query });

  let turn = 0;
  const maxTurns = 5;
  let finalAnswer = '';

  while (turn < maxTurns) {
    turn++;

    const isLastTurn = turn === maxTurns;
    const response = await engine.chat.completions.create({
      messages,
      tools: isLastTurn ? undefined : (tools as any),
      tool_choice: isLastTurn ? 'none' : 'auto',
      temperature: 0.1,
    });

    const choice = response.choices[0];
    const message = choice.message;
    const toolCalls = message.tool_calls;
    const rawContent = message.content || '';

    // Check for native tool calls or fallback text tool calls
    const fallbackCalls = !toolCalls || toolCalls.length === 0 ? extractFallbackToolCalls(rawContent) : [];

    if ((!toolCalls || toolCalls.length === 0) && fallbackCalls.length === 0) {
      // Model produced final synthesized answer
      finalAnswer = rawContent;
      break;
    }

    // Process tool calls
    if (toolCalls && toolCalls.length > 0) {
      messages.push(message);

      for (const call of toolCalls) {
        const toolName = call.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = typeof call.function.arguments === 'string'
            ? JSON.parse(call.function.arguments)
            : (call.function.arguments || {});
        } catch {
          toolArgs = {};
        }

        const stepId = `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const startTime = performance.now();
        const step: AgentActivityStep = {
          id: stepId,
          toolName,
          label: `Gemma Agent executing "${toolName}"`,
          status: 'running',
          args: toolArgs,
        };
        context.steps.push(step);
        onActivity?.([...context.steps]);

        const executor = executorMap.get(toolName);
        let toolOutput = '';
        if (executor) {
          try {
            toolOutput = await executor(toolArgs, context);
            step.status = 'completed';
            step.outputSummary = `Completed ${toolName}`;
          } catch (err: any) {
            toolOutput = `Tool execution error: ${err?.message || err}`;
            step.status = 'failed';
            step.outputSummary = `Error: ${err?.message || err}`;
          }
        } else {
          toolOutput = `Error: Tool "${toolName}" not found.`;
          step.status = 'failed';
          step.outputSummary = `Tool not found: ${toolName}`;
        }

        step.durationMs = Math.round(performance.now() - startTime);
        onActivity?.([...context.steps]);

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: toolOutput,
        });
      }
    } else if (fallbackCalls.length > 0) {
      messages.push({ role: 'assistant', content: rawContent });

      for (const call of fallbackCalls) {
        const toolName = call.name;
        const toolArgs = call.args;
        const stepId = `step_fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const startTime = performance.now();
        const step: AgentActivityStep = {
          id: stepId,
          toolName,
          label: `Gemma Agent executing "${toolName}"`,
          status: 'running',
          args: toolArgs,
        };
        context.steps.push(step);
        onActivity?.([...context.steps]);

        const executor = executorMap.get(toolName);
        let toolOutput = '';
        if (executor) {
          try {
            toolOutput = await executor(toolArgs, context);
            step.status = 'completed';
            step.outputSummary = `Completed ${toolName}`;
          } catch (err: any) {
            toolOutput = `Tool execution error: ${err?.message || err}`;
            step.status = 'failed';
            step.outputSummary = `Error: ${err?.message || err}`;
          }
        } else {
          toolOutput = `Error: Tool "${toolName}" not found.`;
          step.status = 'failed';
          step.outputSummary = `Tool not found: ${toolName}`;
        }

        step.durationMs = Math.round(performance.now() - startTime);
        onActivity?.([...context.steps]);

        messages.push({
          role: 'user',
          content: `Observation from ${toolName}:\n${toolOutput}\n\nNow continue reasoning or synthesize your final answer.`,
        });
      }
    }
  }

  // If finalAnswer was not set during loop, perform one final stream synthesis
  if (!finalAnswer) {
    const stream = await engine.chat.completions.create({
      messages,
      temperature: 0.2,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;
      onToken?.(delta);
    }
    finalAnswer = fullText;
  } else if (onToken) {
    onToken(finalAnswer);
  }

  return {
    content: finalAnswer,
    citations: context.citations,
    steps: context.steps,
  };
}
