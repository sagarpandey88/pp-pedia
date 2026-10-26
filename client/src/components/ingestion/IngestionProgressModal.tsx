import React from 'react';
import {
  CheckmarkCircle20Filled,
  Circle20Regular,
  ErrorCircle20Filled,
  Flash20Regular,
} from '@fluentui/react-icons';
import { ProgressBar, Spinner, Button } from '@fluentui/react-components';
import { TokenUsage } from '../../types/solution';

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
  tokenUsage?: TokenUsage;
  error?: string | null;
  onClose?: () => void;
}

export const IngestionProgressModal: React.FC<IngestionProgressModalProps> = ({
  isOpen,
  steps,
  currentStatusText,
  overallProgress,
  tokenUsage,
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
          <span className="text-xs font-mono text-purple-400 font-semibold">
            {overallProgress}%
          </span>
        </div>

        {/* Fluent Progress Bar */}
        <div className="mb-6">
          <ProgressBar
            value={overallProgress / 100}
            color={hasError ? 'error' : isComplete ? 'success' : 'brand'}
            thickness="medium"
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
                <CheckmarkCircle20Filled className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              )}
              {step.status === 'in_progress' && (
                <div className="mt-0.5 flex-shrink-0">
                  <Spinner size="extra-tiny" />
                </div>
              )}
              {step.status === 'pending' && (
                <Circle20Regular className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
              )}
              {step.status === 'error' && (
                <ErrorCircle20Filled className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <div
                  className={`font-medium ${
                    step.status === 'in_progress'
                      ? 'text-purple-300'
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

        {/* Token Usage metrics if LLM was used */}
        {tokenUsage && tokenUsage.totalTokens > 0 && (
          <div className="mb-6 p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-purple-300 font-medium">
              <Flash20Regular className="w-4 h-4 text-purple-400 flex-shrink-0" />
              <span>LLM Token Usage</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-slate-300">
              <span className="text-white font-semibold">{tokenUsage.totalTokens.toLocaleString()} tokens</span>
              <span className="text-[11px] text-slate-400">
                ({tokenUsage.promptTokens.toLocaleString()} prompt · {tokenUsage.completionTokens.toLocaleString()} completion)
              </span>
            </div>
          </div>
        )}

        {hasError && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300 mb-6 font-mono">
            {error}
          </div>
        )}

        {(isComplete || hasError) && (
          <Button
            appearance="primary"
            onClick={onClose}
            className="w-full"
            size="large"
          >
            {isComplete ? 'View Documentation' : 'Dismiss'}
          </Button>
        )}
      </div>
    </div>
  );
};
