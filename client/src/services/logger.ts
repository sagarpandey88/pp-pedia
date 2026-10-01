import { getAISettings } from './generator/docGenerator';

/**
 * Structured telemetry and diagnostic logger for autonomous agents, LLM requests,
 * and tool executions across pp-pedia. Controlled via settings.enableVerboseLogging.
 */
export const logger = {
  isVerbose(): boolean {
    try {
      return Boolean(getAISettings().enableVerboseLogging);
    } catch {
      return false;
    }
  },

  agentCycle(provider: string, turn: number, model: string, inputPayload: unknown) {
    if (!this.isVerbose()) return;
    console.groupCollapsed(
      `%c🤖 [Agent Cycle] ${provider} | Turn #${turn} | Model: ${model}`,
      'color: #818cf8; font-weight: bold; font-size: 11px;'
    );
    console.log('%cContext & Input Payload:', 'color: #94a3b8; font-weight: bold;', inputPayload);
    console.groupEnd();
  },

  llmResponse(provider: string, turn: number, response: unknown, usage?: unknown, durationMs?: number) {
    if (!this.isVerbose()) return;
    console.groupCollapsed(
      `%c⚡ [LLM Response] ${provider} | Turn #${turn} ${durationMs !== undefined ? `(${durationMs}ms)` : ''}`,
      'color: #f472b6; font-weight: bold; font-size: 11px;'
    );
    console.log('%cResponse / Dispatched Calls:', 'color: #94a3b8; font-weight: bold;', response);
    if (usage) {
      console.log('%cToken Metrics:', 'color: #fbbf24; font-weight: bold;', usage);
    }
    console.groupEnd();
  },

  toolCall(toolName: string, args: unknown, output: unknown, durationMs?: number) {
    if (!this.isVerbose()) return;
    console.groupCollapsed(
      `%c🔧 [Tool Execution] ${toolName} ${durationMs !== undefined ? `(${durationMs}ms)` : ''}`,
      'color: #34d399; font-weight: bold; font-size: 11px;'
    );
    console.log('%cArguments:', 'color: #94a3b8; font-weight: bold;', args);
    console.log('%cOutput Result:', 'color: #94a3b8; font-weight: bold;', output);
    console.groupEnd();
  },

  info(tag: string, message: string, data?: unknown) {
    if (!this.isVerbose()) return;
    if (data !== undefined) {
      console.log(
        `%c[${tag}]%c ${message}`,
        'color: #38bdf8; font-weight: bold; font-size: 11px;',
        'color: inherit;',
        data
      );
    } else {
      console.log(
        `%c[${tag}]%c ${message}`,
        'color: #38bdf8; font-weight: bold; font-size: 11px;',
        'color: inherit;'
      );
    }
  },

  warn(tag: string, message: string, data?: unknown) {
    if (!this.isVerbose()) return;
    console.warn(`[${tag}] ${message}`, data !== undefined ? data : '');
  },

  error(tag: string, message: string, data?: unknown) {
    console.error(`[${tag}] ${message}`, data !== undefined ? data : '');
  },
};
