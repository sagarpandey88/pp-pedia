import React from 'react';
import {
  ShieldCheckmark20Regular,
  Flash20Regular,
  ShareAndroid20Regular,
  Flow20Regular,
  Warning20Regular,
  Layer20Regular,
  Code20Regular,
  Search20Regular,
  Database20Regular,
  LockClosed20Regular,
} from '@fluentui/react-icons';
import { SLASH_COMMANDS, SlashCommandDefinition } from '../../services/agent/slashCommands';

export interface ChatActionChipsProps {
  onSelectCommand: (command: SlashCommandDefinition, runInstantly: boolean) => void;
  disabled?: boolean;
}

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  ShieldCheck: ShieldCheckmark20Regular,
  Zap: Flash20Regular,
  Network: ShareAndroid20Regular,
  Workflow: Flow20Regular,
  AlertTriangle: Warning20Regular,
  Layers: Layer20Regular,
  Code2: Code20Regular,
  Search: Search20Regular,
  Database: Database20Regular,
  Lock: LockClosed20Regular,
};

export const ChatActionChips: React.FC<ChatActionChipsProps> = ({
  onSelectCommand,
  disabled = false,
}) => {
  const priorityCommandNames = ['health', 'impact', 'er', 'triggers', 'flows', 'components', 'js'];
  const chips = priorityCommandNames
    .map((name) => SLASH_COMMANDS.find((c) => c.name === name))
    .filter(Boolean) as SlashCommandDefinition[];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent select-none">
      <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider flex-shrink-0 mr-1 flex items-center gap-1">
        <Flash20Regular className="w-3.5 h-3.5 text-purple-400" />
        <span>Local Tools:</span>
      </div>

      {chips.map((cmd) => {
        const IconComponent = ICON_MAP[cmd.icon] || Flash20Regular;
        const hasRequiredArgs = cmd.parameters.some((p) => p.required);

        return (
          <button
            key={cmd.name}
            type="button"
            disabled={disabled}
            onClick={() => onSelectCommand(cmd, !hasRequiredArgs)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-950/40 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white transition text-xs font-medium whitespace-nowrap flex-shrink-0 group shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title={`${cmd.label}: ${cmd.description} (${cmd.example})`}
          >
            <IconComponent className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-300 transition-colors" />
            <span className="font-mono text-[11px] text-purple-300 group-hover:text-purple-200">
              /{cmd.name}
            </span>
            <span className="text-[11px] text-slate-400 group-hover:text-slate-200 hidden sm:inline">
              {cmd.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
