import { getOrInitGemmaEngine, DEFAULT_GEMMA_MODEL, isNativeFunctionCallingSupported } from '../gemma/gemmaEngine';
import { getGemmaAgentTools } from './agentTools';
import { AgentAnswer, AgentExecutionContext, AgentActivityStep } from './agentTypes';
import { ChatHistoryItem } from './agentRunner';
import { getAISettings } from '../generator/docGenerator';
import { logger } from '../logger';

/**
 * Standard system instruction for models with native function calling support (e.g. Hermes 2/3).
 */
const NATIVE_AGENT_SYSTEM_INSTRUCTION = `You are pp-pedia Agent, an autonomous Microsoft Power Platform expert and solution documentation specialist running locally in the browser via WebGPU.
You analyze Dataverse tables, Power Automate Cloud Flows, Canvas Apps, Environment Variables, JavaScript Web Resources, and solution architectures.

You have access to specialized tools to inspect the solution directly in local IndexedDB:
- analyze_column_impact: High-precision blast radius analysis for deleting or modifying a Dataverse column/attribute. Queries relational dependencies across Cloud Flows, Canvas Apps, JavaScript Web Resources, Form Event Handlers, and Foreign Keys.
- analyze_validation_impact: Evaluates impact of adding a validation or making a field required on a Dataverse table. Finds which Cloud Flows or Canvas Apps write to the table without setting that column.
- query_flow_integrations: Finds Cloud Flows using specific connectors or external APIs (e.g. "Power BI", "Dataverse", "Teams", "SQL", "HTTP") and filters by premium licensing.
- audit_web_resources: Audits client-side JavaScript Web Resources for deprecated Xrm.Page APIs, direct DOM manipulation, and lists registered form event handlers.
- audit_hardcoded_literals: Audits hardcoded GUIDs, URLs, and emails across flows, apps, and scripts for ALM portability.
- inspect_dataverse_entity: Inspect table schemas, columns, types, and relationships directly from the solution AST.
- inspect_cloud_flow: Inspect Cloud Flow triggers, actions, and run_after hierarchy directly from the AST.
- inspect_canvas_app: Inspect Canvas App screens, controls, and formulas.
- semantic_search: Hybrid vector + keyword search over documentation chunks in local PGlite.
- read_document_markdown: Read full or sectional markdown files by slug or ID.
- list_solutions: List solutions and statistics.

Strategy:
1. For blast radius, deleting or renaming a column: ALWAYS call analyze_column_impact first.
2. For adding validations or making a field required: ALWAYS call analyze_validation_impact first.
3. For questions about connectors or external services: ALWAYS call query_flow_integrations first.
4. For client-side JavaScript or form events: Call audit_web_resources.
5. For hardcoded GUIDs or ALM portability: Call audit_hardcoded_literals.
6. For table schemas or relationships: Call inspect_dataverse_entity.
7. For general architectural concepts or topics: Call semantic_search or read_document_markdown.
8. When you have gathered sufficient tool observations, provide a comprehensive, well-structured final answer with Markdown tables, bold headers, and clear conclusions.`;

/**
 * Generates an in-depth system instruction with tool declarations and schemas
 * for SLMs that do not support native WebLLM ChatCompletionRequest.tools (e.g. Google Gemma 2 2B).
 */
function buildPromptToolInstruction(
  toolDeclarations: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>
): string {
  const toolsFormatted = toolDeclarations
    .map((t) => {
      const f = t.function;
      const props = (f.parameters as any)?.properties || {};
      const required = new Set((f.parameters as any)?.required || []);
      const paramList = Object.entries(props)
        .map(([k, v]: [string, any]) => {
          const reqStr = required.has(k) ? ' (required)' : ' (optional)';
          return `    "${k}": <${v.type || 'string'}>${reqStr} - ${v.description || ''}`;
        })
        .join('\n');
      return `### Tool: \`${f.name}\`\n${f.description}\nParameters schema:\n{\n${paramList}\n}`;
    })
    .join('\n\n');

  return `You are pp-pedia Agent, an autonomous Microsoft Power Platform expert and solution documentation specialist running locally in the browser via WebGPU.
You analyze Dataverse tables, Power Automate Cloud Flows, Canvas Apps, Environment Variables, JavaScript Web Resources, and solution architectures.

You have access to specialized tools to inspect the solution directly in local IndexedDB:

${toolsFormatted}

### STRATEGY FOR ANSWERING:
1. For blast radius, deleting or renaming a column: ALWAYS call \`analyze_column_impact\` first.
2. For adding validations, making a field required, or column constraints: ALWAYS call \`analyze_validation_impact\` first.
3. For questions about connectors or external services: ALWAYS call \`query_flow_integrations\` first.
4. For client-side JavaScript, forms, or deprecated APIs: Call \`audit_web_resources\`.
5. For hardcoded GUIDs, URLs, or ALM environment drift: Call \`audit_hardcoded_literals\`.
6. For table schemas or relationships: Call \`inspect_dataverse_entity\`.
7. For cloud flow triggers or action steps: Call \`inspect_cloud_flow\`.
8. For Canvas App screens or formulas: Call \`inspect_canvas_app\`.
9. For general architectural concepts, topics, or explanations: Call \`semantic_search\` or \`read_document_markdown\`.

### HOW TO CALL A TOOL:
If you need to query information to answer the user's question, output ONLY a JSON code block in this exact format:
\`\`\`json
{
  "tool": "tool_name",
  "parameters": {
    "param_name": "value"
  }
}
\`\`\`
Do NOT output conversational text before or after the JSON code block when calling a tool.

### HOW TO GIVE YOUR FINAL ANSWER:
When you have collected sufficient information from the tools, or if no tools are needed, write your comprehensive final answer directly in GitHub Flavored Markdown (with tables, bold headers, and citations). Do NOT output a tool code block when giving your final answer.`;
}

/**
 * Parses potential text-encoded tool calls if the model emits markdown JSON code blocks or raw JSON instead of native tool_calls.
 */
function extractFallbackToolCalls(
  text: string,
  availableToolNames: Set<string>
): Array<{ name: string; args: Record<string, unknown> }> {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  if (!text) return calls;

  // 1. Check for markdown code blocks (```json ... ``` or ```tool_call ... ``` or just ``` ... ```)
  const codeBlockRegex = /```(?:json|tool_call)?\s*([\s\S]*?)\s*```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    const parsed = tryParseToolCallJson(candidate, availableToolNames);
    if (parsed) {
      calls.push(parsed);
    }
  }

  if (calls.length > 0) return calls;

  // 2. Check for raw JSON object in text
  const jsonObjectRegex = /\{[\s\S]*?\}/g;
  while ((match = jsonObjectRegex.exec(text)) !== null) {
    const candidate = match[0].trim();
    const parsed = tryParseToolCallJson(candidate, availableToolNames);
    if (parsed) {
      calls.push(parsed);
    }
  }

  if (calls.length > 0) return calls;

  // 3. Check for ReAct style Action: ... Action Input: ...
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
 * Strips tool call code blocks from final answer if present.
 */
function cleanFinalAnswer(text: string): string {
  if (!text) return '';
  // Remove markdown tool call blocks like ```json\n{\n  "tool": "..."\n}\n```
  let cleaned = text.replace(/```(?:json|tool_call)?\s*\{\s*(?:"tool"|"name"|"action")[\s\S]*?\}\s*```/g, '').trim();
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
  let supportsNativeTools = isNativeFunctionCallingSupported(modelId);

  const context: AgentExecutionContext = {
    projectId,
    citations: [],
    steps: [],
    onActivity,
  };

  const initStepId = `step_gemma_init_${Date.now()}`;
  const modelShortName = modelId.startsWith('gemma') ? 'Gemma SLM' : 'Local SLM';
  const initStep: AgentActivityStep = {
    id: initStepId,
    toolName: 'gemma_engine',
    label: `Initialize ${modelShortName} (WebGPU)`,
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
    initStep.outputSummary = `${modelShortName} active in Web Worker (${modelId})`;
    onActivity?.([...context.steps]);
  } catch (err: any) {
    initStep.status = 'failed';
    initStep.outputSummary = `WebGPU model initialization failed: ${err?.message || err}`;
    onActivity?.([...context.steps]);
    throw err;
  }

  const { tools, executorMap } = getGemmaAgentTools(true);
  const availableToolNames = new Set(tools.map((t) => t.function.name));

  const systemInstruction = supportsNativeTools
    ? NATIVE_AGENT_SYSTEM_INSTRUCTION
    : buildPromptToolInstruction(tools);

  // Build message history
  const messages: any[] = [
    { role: 'system', content: systemInstruction },
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

    const requestPayload: any = {
      messages,
      temperature: 0.1,
    };

    if (supportsNativeTools && !isLastTurn) {
      requestPayload.tools = tools as any;
      requestPayload.tool_choice = 'auto';
    }

    logger.agentCycle(modelShortName, turn, modelId, requestPayload);
    const cycleStartTime = performance.now();

    let response;
    try {
      response = await engine.chat.completions.create(requestPayload);
    } catch (err: any) {
      // If native tool calling threw UnsupportedModelIdError, switch to prompt-based tool execution
      const errMsg = String(err?.message || err);
      if (
        requestPayload.tools &&
        (err?.name === 'UnsupportedModelIdError' || errMsg.includes('tools') || errMsg.includes('UnsupportedModelIdError'))
      ) {
        console.warn('Native tools rejected by WebLLM, switching to prompt-based tool execution:', err);
        supportsNativeTools = false;
        delete requestPayload.tools;
        delete requestPayload.tool_choice;
        messages[0] = { role: 'system', content: buildPromptToolInstruction(tools) };
        response = await engine.chat.completions.create(requestPayload);
      } else {
        throw err;
      }
    }

    const duration = Math.round(performance.now() - cycleStartTime);
    const choice = response.choices[0];
    const message = choice.message;
    const toolCalls = message.tool_calls;
    const rawContent = message.content || '';

    // Check for native tool calls or fallback text tool calls
    const fallbackCalls =
      !toolCalls || toolCalls.length === 0
        ? extractFallbackToolCalls(rawContent, availableToolNames)
        : [];

    logger.llmResponse(
      modelShortName,
      turn,
      {
        content: rawContent,
        toolCalls: toolCalls?.map((c: any) => ({ name: c.function?.name, args: c.function?.arguments })) || [],
        fallbackCalls,
      },
      response.usage,
      duration
    );

    if ((!toolCalls || toolCalls.length === 0) && fallbackCalls.length === 0) {
      // Model produced final synthesized answer
      finalAnswer = cleanFinalAnswer(rawContent);
      break;
    }

    // Process native tool calls
    if (toolCalls && toolCalls.length > 0) {
      messages.push(message);

      for (const call of toolCalls) {
        const toolName = call.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs =
            typeof call.function.arguments === 'string'
              ? JSON.parse(call.function.arguments)
              : call.function.arguments || {};
        } catch {
          toolArgs = {};
        }

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
          role: 'tool',
          tool_call_id: call.id,
          content: toolOutput,
        });
      }
    } else if (fallbackCalls.length > 0) {
      // Process fallback text tool calls (Gemma)
      messages.push({ role: 'assistant', content: rawContent });

      for (const call of fallbackCalls) {
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

        const isApproachingMax = turn >= maxTurns - 1;
        const guidance = isApproachingMax
          ? `You have reached the limit of tool queries. Based on all gathered observations, provide your comprehensive, final technical answer now using Markdown tables and bold headers. Do NOT call any more tools.`
          : `Review the observation above. If you have enough information, synthesize your comprehensive final answer in Markdown. If you need more details, you may call another tool.`;

        messages.push({
          role: 'user',
          content: `[Observation from tool "${toolName}"]:\n${toolOutput}\n\n${guidance}`,
        });
      }
    }
  }

  // If finalAnswer was not set during loop, perform one final stream synthesis
  if (!finalAnswer) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant') {
      messages.push({
        role: 'user',
        content: 'Please summarize all gathered findings and provide your comprehensive final answer now in Markdown.',
      });
    }

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
    finalAnswer = cleanFinalAnswer(fullText);
  } else if (onToken) {
    onToken(finalAnswer);
  }

  // Fallback if final answer is somehow empty
  if (!finalAnswer && context.citations.length > 0) {
    const primary = context.citations[0];
    finalAnswer = `Based on the retrieved solution documentation for **${primary.project_name}**:\n\n### ${primary.title} (${primary.heading_context || 'Section'})\n${primary.chunk_content}`;
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
