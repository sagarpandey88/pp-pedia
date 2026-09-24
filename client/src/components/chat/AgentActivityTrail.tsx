import React, { useState } from 'react';
import {
  Search,
  BookOpen,
  FileText,
  Database,
  Workflow,
  Layout,
  Layers,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  Wrench,
} from 'lucide-react';
import { AgentActivityStep } from '../../services/agent/agentTypes';

interface AgentActivityTrailProps {
  steps: AgentActivityStep[];
  isLive?: boolean;
}

const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case 'semantic_search':
      return <Search className="w-3.5 h-3.5 text-indigo-400" />;
    case 'list_documents':
      return <BookOpen className="w-3.5 h-3.5 text-sky-400" />;
    case 'read_document_markdown':
      return <FileText className="w-3.5 h-3.5 text-emerald-400" />;
    case 'inspect_dataverse_entity':
      return <Database className="w-3.5 h-3.5 text-amber-400" />;
    case 'inspect_cloud_flow':
      return <Workflow className="w-3.5 h-3.5 text-purple-400" />;
    case 'inspect_canvas_app':
      return <Layout className="w-3.5 h-3.5 text-pink-400" />;
    case 'list_solutions':
      return <Layers className="w-3.5 h-3.5 text-cyan-400" />;
    default:
      return <Wrench className="w-3.5 h-3.5 text-slate-400" />;
  }
};

export const AgentActivityTrail: React.FC<AgentActivityTrailProps> = ({
  steps,
  isLive = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(isLive);

  if (!steps || steps.length === 0) return null;

  const runningStep = steps.find((s) => s.status === 'running');
  const hasErrors = steps.some((s) => s.status === 'failed');

  return (
    <div className="my-2.5 rounded-xl border border-slate-800/90 bg-slate-950/60 overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3.5 py-2 flex items-center justify-between bg-slate-900/70 hover:bg-slate-900 transition border-b border-slate-800/60 text-slate-300 font-medium select-none"
      >
        <div className="flex items-center gap-2">
          {runningStep ? (
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
          ) : hasErrors ? (
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span className="font-semibold text-slate-200">
            {runningStep ? 'Agent Thinking & Tool Execution' : 'Agent Activity Trail'}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700/60">
            {steps.length} {steps.length === 1 ? 'action' : 'actions'}
          </span>
          {runningStep && (
            <span className="text-[11px] text-indigo-400 animate-pulse font-normal truncate max-w-xs">
              {runningStep.label}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <span>{isExpanded ? 'Hide' : 'Details'}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isExpanded ? 'rotate-180 text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="p-3 space-y-2 bg-slate-950/40">
          {steps.map((step, idx) => (
            <div
              key={step.id || idx}
              className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs"
            >
              <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5 border border-slate-700/50">
                {getToolIcon(step.toolName)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-200 text-xs truncate">
                    {step.label}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0 text-[10px] font-mono text-slate-400">
                    {step.durationMs !== undefined && (
                      <span>{step.durationMs}ms</span>
                    )}
                    {step.status === 'running' && (
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse">
                        running
                      </span>
                    )}
                    {step.status === 'completed' && (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        done
                      </span>
                    )}
                    {step.status === 'failed' && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        failed
                      </span>
                    )}
                  </div>
                </div>

                {step.outputSummary && (
                  <p className="mt-1 text-[11px] text-slate-400 truncate">
                    {step.outputSummary}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
