import React from 'react';
import { CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';

export interface IngestionStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  detail?: string;
}

interface IngestionProgressModalProps {
  isOpen: boolean;
  steps: IngestionStep[];
  currentStatusText: string;
  overallProgress: number; // 0 - 100
  error?: string | null;
  onClose?: () => void;
}

export const IngestionProgressModal: React.FC<IngestionProgressModalProps> = ({
  isOpen,
  steps,
  currentStatusText,
  overallProgress,
  error,
  onClose,
}) => {
  if (!isOpen) return null;

  const isComplete = steps.every((s) => s.status === 'completed');
  const hasError = Boolean(error);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">
            {hasError
              ? 'Ingestion Error'
              : isComplete
              ? 'Solution Ingested Successfully!'
              : 'Processing Solution Archive...'}
          </h3>
          <span className="text-xs font-mono text-indigo-400 font-semibold">
            {overallProgress}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-6">
          <div
            className={`h-full transition-all duration-300 ${
              hasError
                ? 'bg-rose-500'
                : isComplete
                ? 'bg-emerald-500'
                : 'bg-indigo-500'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Status ticker */}
        <div className="mb-6 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 font-mono truncate">
          {currentStatusText || 'Initializing pipeline...'}
        </div>

        {/* Steps List */}
        <div className="space-y-3 mb-6">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-start gap-3 text-xs"
            >
              {step.status === 'completed' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              )}
              {step.status === 'in_progress' && (
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin mt-0.5 flex-shrink-0" />
              )}
              {step.status === 'pending' && (
                <Circle className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
              )}
              {step.status === 'error' && (
                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <div
                  className={`font-medium ${
                    step.status === 'in_progress'
                      ? 'text-indigo-300'
                      : step.status === 'completed'
                      ? 'text-slate-200'
                      : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </div>
                {step.detail && (
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {hasError && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300 mb-6 font-mono">
            {error}
          </div>
        )}

        {(isComplete || hasError) && (
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
          >
            {isComplete ? 'View Documentation' : 'Dismiss'}
          </button>
        )}
      </div>
    </div>
  );
};

