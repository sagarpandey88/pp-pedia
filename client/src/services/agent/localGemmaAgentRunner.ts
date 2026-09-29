import { getOrInitGemmaEngine, generateGemmaResponse, DEFAULT_GEMMA_MODEL } from '../gemma/gemmaEngine';
import { getGemmaAgentTools } from './agentTools';
import { AgentAnswer, AgentExecutionContext, AgentActivityStep } from './agentTypes';
import { ChatHistoryItem } from './agentRunner';
import { getAISettings } from '../generator/docGenerator';
import { logger } from '../logger';
import { embedQuery } from '../embeddingService';
import { querySimilarChunks } from '../db';

/**
 * Generates the official FunctionGemma prompt format using native function calling control tokens:
 * <start_function_declaration>declaration:name{description:<escape>...<escape>, parameters:{...}}<end_function_declaration>
 */
export function buildFunctionGemmaSystemPrompt(
  toolDeclarations: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>
): string {
  const formattedDecls = toolDeclarations
    .map((t) => {
      const f = t.function;
      const props = (f.parameters as any)?.properties || {};
      const required = (f.parameters as any)?.required || [];

      const propEntries = Object.entries(props)
        .map(([k, v]: [string, any]) => {
          const isReq = required.includes(k);
          return `      ${k}:{\n        type:<escape>${v.type || 'STRING'}<escape>,\n        description:<escape>${v.description || ''}${isReq ? ' (REQUIRED)' : ''}<escape>\n      }`;
        })
        .join(',\n');

      const reqList = required.map((r: string) => `<escape>${r}<escape>`).join(', ');

      return `<start_function_declaration>declaration:${f.name}{\n  description:<escape>${f.description}<escape>,\n  parameters:{\n    type:<escape>OBJECT<escape>,\n    properties:{\n${propEntries}\n    },\n    required:[${reqList}]\n  }\n}<end_function_declaration>`;
    })
    .join('\n');

  return `You are a model that can do function calling with the following functions.\n${formattedDecls}\n\nWhen a user query requires querying data (e.g. how many flows use a connector, blast radius of a column, or inspecting tables), invoke the appropriate function call using <start_function_call>call:function_name{param:<escape>value<escape>}<end_function_call>. Do NOT invent tools.`;
}

/**
 * Parses FunctionGemma control tokens:
 * <start_function_call>call:tool_name{param:<escape>value<escape>}<end_function_call>
 * with resilient fallback to markdown JSON blocks or ReAct style.
 */
export function parseFunctionGemmaCalls(
  text: string,
  availableToolNames: Set<string>
): Array<{ name: string; args: Record<string, unknown> }> {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  if (!text) return calls;

  // 1. Check for native FunctionGemma tokens: call:tool_name{...}
  const tokenRegex = /(?:<start_function_call>)?call:([a-zA-Z0-9_-]+)\s*\{([\s\S]*?)\}(?:<end_function_call>)?/g;
  let match;
  while ((match = tokenRegex.exec(text)) !== null) {
    const toolName = match[1].trim();
    if (availableToolNames.has(toolName)) {
      const rawParams = match[2];
      const args: Record<string, unknown> = {};

      const paramRegex = /([a-zA-Z0-9_-]+)\s*:\s*(?:<escape>([\s\S]*?)<escape>|"([^"]*)"|'([^']*)'|([a-zA-Z0-9_\.-]+))/g;
      let pMatch;
      while ((pMatch = paramRegex.exec(rawParams)) !== null) {
        const key = pMatch[1];
        const val = pMatch[2] ?? pMatch[3] ?? pMatch[4] ?? pMatch[5];
        if (val !== undefined) {
          if (val === 'true') args[key] = true;
          else if (val === 'false') args[key] = false;
          else if (!isNaN(Number(val)) && val.trim() !== '') args[key] = Number(val);
          else args[key] = val;
        }
      }
      calls.push({ name: toolName, args });
    }
  }

  if (calls.length > 0) return calls;

  // 2. Check for markdown code blocks (```json ... ``` or ```tool_call ... ``` or just ``` ... ```)
  const codeBlockRegex = /```(?:json|tool_call)?\s*([\s\S]*?)\s*```/g;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    const parsed = tryParseToolCallJson(candidate, availableToolNames);
    if (parsed) {
      calls.push(parsed);
    }
  }

  if (calls.length > 0) return calls;

  // 3. Check for raw JSON object in text
  const jsonObjectRegex = /\{[\s\S]*?\}/g;
  while ((match = jsonObjectRegex.exec(text)) !== null) {
    const candidate = match[0].trim();
    const parsed = tryParseToolCallJson(candidate, availableToolNames);
    if (parsed) {
      calls.push(parsed);
    }
  }

  if (calls.length > 0) return calls;

  // 4. Check for ReAct style Action: ... Action Input: ...
  const reactMatch = /Action:\s*([a-zA-Z0-9_-]+)\s*(?:Action\s*Input:\s*([\s\S]*))?/i.exec(text);
  if (reactMatch) {
    const toolName = reactMatch[1].trim();
    if (availableToolNames.has(toolName)) {
      let args: Record<string, unknown> = {};
      if (reactMatch[2]) {
        try {
          args = JSON.parse(reactMatch[2].trim());
        } catch {
          args = { query: reactMatch[2].trim() };
        }
      }
      calls.push({ name: toolName, args });
    }
  }

  return calls;
}

function tryParseToolCallJson(
  rawJson: string,
  availableToolNames: Set<string>
): { name: string; args: Record<string, unknown> } | null {
  try {
    const obj = JSON.parse(rawJson);
    if (typeof obj !== 'object' || obj === null) return null;

    const rawToolName = obj.tool || obj.name || obj.action || obj.function;
    if (typeof rawToolName === 'string' && availableToolNames.has(rawToolName)) {
      let args = obj.parameters || obj.arguments || obj.args || obj.action_input;
      if (!args || typeof args !== 'object') {
        const remaining: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (!['tool', 'name', 'action', 'function'].includes(k)) {
            remaining[k] = v;
          }
        }
        args = remaining;
      }
      return { name: rawToolName, args: args as Record<string, unknown> };
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null;
}

/**
 * Strips tool call tokens, code blocks, and control characters from final answer.
 */
function cleanFinalAnswer(text: string): string {
  if (!text) return '';
  // Remove FunctionGemma control tokens
  let cleaned = text
    .replace(/<start_function_call>[\s\S]*?<end_function_call>/g, '')
    .replace(/<start_function_response>[\s\S]*?<end_function_response>/g, '')
    .replace(/<start_of_turn>(?:model|developer|user|tool)?/g, '')
    .replace(/<end_of_turn>/g, '')
    .replace(/<escape>/g, '')
    .trim();
  // Remove markdown tool call blocks like ```json\n{\n  "tool": "..."\n}\n```
  cleaned = cleaned.replace(/```(?:json|tool_call)?\s*\{\s*(?:"tool"|"name"|"action")[\s\S]*?\}\s*```/g, '').trim();
  // Remove standalone JSON tool calls
  cleaned = cleaned.replace(/^\s*\{\s*(?:"tool"|"name"|"action")[\s\S]*?\}\s*$/gm, '').trim();
  return cleaned || text;
}

/**
 * Runs an autonomous agent reasoning and tool execution loop using Google Gemma or Hermes in-browser via WebLLM.
 * For models that do not natively support ChatCompletionRequest.tools in WebLLM (like Gemma 2 2B),
 * this uses structured prompt-based tool execution to avoid UnsupportedModelIdError.
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
  const modelShortName = 'FunctionGemma 270M';
  const initStep: AgentActivityStep = {
    id: initStepId,
    toolName: 'gemma_engine',
    label: `Initialize ${modelShortName} (ONNX WebGPU)`,
    status: 'running',
  };
  context.steps.push(initStep);
  onActivity?.([...context.steps]);

  try {
    await getOrInitGemmaEngine(modelId, (report) => {
      initStep.outputSummary = report.text;
      onActivity?.([...context.steps]);
    });
    initStep.status = 'completed';
    initStep.outputSummary = `${modelShortName} active in Web Worker`;
    onActivity?.([...context.steps]);
  } catch (err: any) {
    initStep.status = 'failed';
    initStep.outputSummary = `WebGPU model initialization failed: ${err?.message || err}`;
    onActivity?.([...context.steps]);
    throw err;
  }

  const { tools, executorMap } = getGemmaAgentTools(true);
  const availableToolNames = new Set(tools.map((t) => t.function.name));

  // Build message history
  const messages: any[] = [];

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

    logger.agentCycle(modelShortName, turn, modelId, { messagesCount: messages.length });
    const cycleStartTime = performance.now();

    let rawContent = '';
    try {
      rawContent = await generateGemmaResponse(
        {
          messages,
          tools: !isLastTurn ? tools : undefined,
          maxNewTokens: 256,
          temperature: 0.1,
        },
        modelId
      );
    } catch (err: any) {
      console.warn('FunctionGemma generation error:', err);
      break;
    }

    const duration = Math.round(performance.now() - cycleStartTime);
    const parsedCalls = !isLastTurn ? parseFunctionGemmaCalls(rawContent, availableToolNames) : [];

    logger.llmResponse(
      modelShortName,
      turn,
      {
        content: rawContent,
        toolCalls: parsedCalls,
      },
      undefined,
      duration
    );

    if (parsedCalls.length === 0) {
      finalAnswer = cleanFinalAnswer(rawContent);
      break;
    }

    // Process tool calls
    for (const call of parsedCalls) {
      const toolName = call.name;
      const toolArgs = call.args;

      const executor = executorMap.get(toolName);
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

      messages.push({
        role: 'assistant',
        content: rawContent,
        tool_calls: [
          {
            type: 'function',
            function: {
              name: toolName,
              arguments: toolArgs,
            },
          },
        ],
      });

      messages.push({
        role: 'tool',
        name: toolName,
        content: toolOutput,
      });
    }
  }

  // If finalAnswer was not set during loop, perform one final stream synthesis
  if (!finalAnswer) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant') {
      messages.push({
        role: 'user',
        content: 'Please summarize all gathered findings and provide your final answer now in Markdown.',
      });
    }

    try {
      finalAnswer = await generateGemmaResponse(
        {
          messages,
          maxNewTokens: 256,
          temperature: 0.2,
          onToken,
        },
        modelId
      );
      finalAnswer = cleanFinalAnswer(finalAnswer);
    } catch {
      // Ignore stream synthesis error and proceed to semantic fallback
    }
  } else if (onToken) {
    onToken(finalAnswer);
  }


  // Fallback: If final answer is somehow empty, directly show semantic outputs (NO BYOK)
  if (!finalAnswer) {
    if (context.citations.length > 0) {
      const primary = context.citations[0];
      finalAnswer = `Based on the retrieved solution documentation for **${primary.project_name}**:\n\n### ${primary.title} (${primary.heading_context || 'Section'})\n${primary.chunk_content}`;
    } else {
      try {
        const queryVector = await embedQuery(query);
        const results = await querySimilarChunks(queryVector, projectId, 6, query);
        for (const item of results) {
          if (!context.citations.some((c) => c.id === item.id)) {
            context.citations.push(item);
          }
        }
        if (results.length > 0) {
          const primary = results[0];
          finalAnswer = `Based on the local documentation for **${primary.project_name}**:\n\n### ${primary.title} (${primary.heading_context || 'Section'})\n${primary.chunk_content}`;
        } else {
          finalAnswer = `No specific matching components or documentation chunks found for "${query}".`;
        }
      } catch (err: any) {
        finalAnswer = `Local processing completed. Direct semantic search result: ${err?.message || err}`;
      }
    }
  }

  logger.info(
    modelShortName,
    `Run finished in ${turn} turns with ${context.steps.length} steps and ${context.citations.length} citations.`
  );

  return {
    content: finalAnswer || 'The agent completed analysis without producing text.',
    citations: context.citations,
    steps: context.steps,
  };
}
