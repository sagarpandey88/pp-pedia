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
  ChevronRight,
  Wrench,
  Terminal,
} from 'lucide-react';
import { AgentActivityStep } from '../../services/agent/agentTypes';
import { logger } from '../../services/logger';

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
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());

  if (!steps || steps.length === 0) return null;

  const runningStep = steps.find((s) => s.status === 'running');
  const hasErrors = steps.some((s) => s.status === 'failed');
  const isVerbose = logger.isVerbose();

  const toggleStepDetails = (stepId: string) => {
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  return (
    <div className="my-2.5 rounded-xl border border-slate-800/90 bg-slate-950/60 overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-slate-900/70 hover:bg-slate-900 transition border-b border-slate-800/60 text-slate-300 font-medium select-none gap-2"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {runningStep ? (
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" />
          ) : hasErrors ? (
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          )}
          <span className="font-semibold text-slate-200 truncate text-xs">
            {runningStep ? 'Agent Thinking & Tool Execution' : 'Agent Activity Trail'}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700/60 flex-shrink-0">
            {steps.length} {steps.length === 1 ? 'action' : 'actions'}
          </span>
          {isVerbose && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
              <Terminal className="w-2.5 h-2.5" />
              Verbose
            </span>
          )}
          {runningStep && (
            <span className="text-[11px] text-indigo-400 animate-pulse font-normal truncate max-w-[120px] hidden sm:inline">
              {runningStep.label}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0">
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
          {steps.map((step, idx) => {
            const stepKey = step.id || String(idx);
            const isStepExpanded = expandedStepIds.has(stepKey);
            const hasPayload = Boolean(
              (step.args && Object.keys(step.args).length > 0) || step.outputDetails
            );

            return (
              <div
                key={stepKey}
                className="flex flex-col p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs"
              >
                <div className="flex items-start gap-2.5">
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
                      <p className="mt-1 text-[11px] text-slate-400">
                        {step.outputSummary}
                      </p>
                    )}

                    {hasPayload && (
                      <button
                        type="button"
                        onClick={() => toggleStepDetails(stepKey)}
                        className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-300 font-mono transition"
                      >
                        <ChevronRight
                          className={`w-3 h-3 transition-transform ${
                            isStepExpanded ? 'rotate-90 text-indigo-400' : ''
                          }`}
                        />
                        <span>{isStepExpanded ? 'Hide payload' : 'Inspect payload & observation'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {isStepExpanded && hasPayload && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-2 text-[10px] font-mono pl-8">
                    {step.args && Object.keys(step.args).length > 0 && (
                      <div>
                        <div className="text-slate-400 font-semibold mb-1">Tool Input Arguments:</div>
                        <pre className="p-2 rounded bg-slate-950/80 border border-slate-800 text-indigo-300 overflow-x-auto leading-tight">
                          {JSON.stringify(step.args, null, 2)}
                        </pre>
                      </div>
                    )}
                    {step.outputDetails && (
                      <div>
                        <div className="text-slate-400 font-semibold mb-1">Tool Observation Details:</div>
                        <pre className="p-2 rounded bg-slate-950/80 border border-slate-800 text-emerald-300 overflow-x-auto max-h-48 overflow-y-auto leading-tight whitespace-pre-wrap break-all">
                          {step.outputDetails}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
