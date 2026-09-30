import { findSlashCommand, SLASH_COMMANDS } from './slashCommands';
import { getLocalAgentTools } from './agentTools';
import { ChatMessage } from '../rag/ragService';
import { AgentActivityStep, AgentExecutionContext } from './agentTypes';

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

export function parseCommandArguments(rawArgs: string): string[] {
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawArgs)) !== null) {
    args.push(match[1] || match[2] || match[0]);
  }

  return args;
}

/**
 * Executes a slash command directly against the local PGlite database without invoking remote LLMs.
 */
export async function executeLocalSlashCommand(
  rawInput: string,
  projectId?: string,
  onActivity?: (steps: AgentActivityStep[]) => void
): Promise<ChatMessage> {
  const startTime = performance.now();
  const trimmed = rawInput.trim();
  const firstSpaceIdx = trimmed.indexOf(' ');
  const commandRaw = firstSpaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, firstSpaceIdx);
  const rawArgs = firstSpaceIdx === -1 ? '' : trimmed.slice(firstSpaceIdx + 1).trim();

  const commandDef = findSlashCommand(commandRaw);
  if (!commandDef) {
    return {
      id: `cmd_err_${Date.now()}`,
      role: 'assistant',
      content: `❌ Unknown command **\`/${commandRaw}\`**.\n\n### Available Slash Commands (Local PGlite Engine):\n${SLASH_COMMANDS.map(
        (c) => `- **\`/${c.name}\`**: ${c.description}`
      ).join('\n')}\n\nType \`/\` in the chat box for autocomplete.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  const args = parseCommandArguments(rawArgs);
  const toolName = commandDef.toolName;

  // Validate required parameters
  const missingParams = commandDef.parameters
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.required && !args[p.idx]);

  if (missingParams.length > 0) {
    const missingNames = missingParams.map((p) => `\`<${p.name}>\``).join(', ');
    return {
      id: `cmd_err_${Date.now()}`,
      role: 'assistant',
      content: `⚠️ Missing required parameter(s) for **\`/${commandDef.name}\`**: ${missingNames}.\n\n**Example Usage:**\n\`${commandDef.example}\`\n\n_${commandDef.description}_`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  const toolArgs: Record<string, unknown> = {};

  switch (commandDef.name) {
    case 'impact':
      toolArgs.entity_name = args[0];
      toolArgs.column_name = args[1];
      toolArgs.projectId = projectId;
      break;

    case 'health':
      toolArgs.solution_id = projectId;
      break;

    case 'er':
      toolArgs.root_entity = args[0] || undefined;
      toolArgs.projectId = projectId;
      break;

    case 'triggers':
      toolArgs.entity_name = args[0] || undefined;
      toolArgs.projectId = projectId;
      break;

    case 'flows':
      toolArgs.connector_type = args.join(' ') || undefined;
      toolArgs.projectId = projectId;
      break;

    case 'components':
      toolArgs.solution_id = projectId;
      break;

    case 'js':
      toolArgs.projectId = projectId;
      break;

    case 'validate':
      toolArgs.entity_name = args[0];
      toolArgs.column_name = args[1];
      toolArgs.validation_type = args[2] || 'required';
      toolArgs.projectId = projectId;
      break;

    case 'literals':
      toolArgs.literal_type = args[0]?.toUpperCase() || undefined;
      toolArgs.projectId = projectId;
      break;

    case 'entity':
      toolArgs.entity_name = args[0];
      toolArgs.projectId = projectId;
      break;

    case 'flow':
      toolArgs.flow_name = args.join(' ');
      toolArgs.projectId = projectId;
      break;

    case 'app':
      toolArgs.app_name = args.join(' ');
      toolArgs.projectId = projectId;
      break;

    case 'solutions':
      toolArgs.filter = args.join(' ') || undefined;
      break;

    case 'docs':
      toolArgs.project_id = projectId;
      break;

    case 'read':
      toolArgs.slug_or_id = args[0];
      toolArgs.projectId = projectId;
      break;

    case 'search':
      toolArgs.query = args.join(' ');
      toolArgs.limit = 8;
      toolArgs.projectId = projectId;
      break;

    default:
      toolArgs.projectId = projectId;
  }

  const steps: AgentActivityStep[] = [];
  const context: AgentExecutionContext = {
    projectId,
    citations: [],
    steps,
    onActivity: (liveSteps) => {
      onActivity?.(liveSteps);
    },
  };

  const { executorMap } = getLocalAgentTools(false);
  const executor = executorMap.get(toolName);

  if (!executor) {
    return {
      id: `cmd_err_${Date.now()}`,
      role: 'assistant',
      content: `Internal Error: Local executor for tool "${toolName}" is not registered.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  try {
    const rawResult = await executor(toolArgs, context);
    const durationMs = Math.round(performance.now() - startTime);

    let content = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);

    if (content.startsWith('{') && content.endsWith('}')) {
      content = `\`\`\`json\n${content}\n\`\`\``;
    }

    const promptFollowUp = `\n\n> 💡 *Need advice? Ask: **"What steps should I take to remediate these findings?"** to reason with your configured AI model.*`;

    return {
      id: `asst_local_${Date.now()}`,
      role: 'assistant',
      content: `${content}${promptFollowUp}`,
      citations: context.citations,
      steps: context.steps.length > 0 ? context.steps : [
        {
          id: `step_pglite_${Date.now()}`,
          toolName,
          label: `Local PGlite Engine: /${commandDef.name}`,
          status: 'completed',
          durationMs,
          args: toolArgs,
          outputSummary: `Computed in ${durationMs}ms directly from PGlite WASM (0 LLM tokens)`,
        },
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
      },
    };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    return {
      id: `asst_err_${Date.now()}`,
      role: 'assistant',
      content: `❌ **Local Execution Error (/${commandDef.name}):** ${err?.message || err}`,
      steps: [
        {
          id: `step_err_${Date.now()}`,
          toolName,
          label: `Local PGlite Engine: /${commandDef.name}`,
          status: 'failed',
          durationMs,
          args: toolArgs,
          outputSummary: `Execution failed: ${err?.message || err}`,
        },
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }
}
