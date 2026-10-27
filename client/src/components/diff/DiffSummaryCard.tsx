import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkle20Filled,
  Warning20Filled,
  Checkmark20Regular,
  Copy20Regular,
  ChevronDown20Regular,
  ChevronRight20Regular,
  ArrowSync20Regular,
  Shield20Regular,
  ArrowDownload20Regular,
} from '@fluentui/react-icons';
import { Button, Badge, Spinner, Tooltip } from '@fluentui/react-components';
import { SolutionDiffResult, BreakingChangeItem } from '../../types/diff';
import { ActiveAIInfo } from '../../services/generator/docGenerator';

interface DiffSummaryCardProps {
  diff: SolutionDiffResult;
  aiSummary: string;
  isAiGenerating: boolean;
  onGenerateAiSummary: () => void;
  aiInfo: ActiveAIInfo;
  onExportMarkdown: () => void;
  onExportJson: () => void;
}

export const DiffSummaryCard: React.FC<DiffSummaryCardProps> = ({
  diff,
  aiSummary,
  isAiGenerating,
  onGenerateAiSummary,
  aiInfo,
  onExportMarkdown,
  onExportJson,
}) => {
  const [copied, setCopied] = useState(false);
  const [showBreakingDetails, setShowBreakingDetails] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(aiSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const breakingCount = diff.metrics.breakingChangesCount;
  const warningCount = diff.metrics.warningsCount;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Top Header & Metrics Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
              Executive Release Summary
            </h2>
            <Badge
              appearance="tint"
              color={aiInfo.provider !== 'offline' ? 'brand' : 'informative'}
              size="small"
            >
              {aiInfo.provider !== 'offline' ? `AI Powered (${aiInfo.label})` : 'Deterministic / Local'}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Comparing <span className="font-mono text-purple-300">v{diff.baseMetadata.version}</span> ({diff.baseMetadata.is_managed ? 'Managed' : 'Unmanaged'})
            {' ➔ '}
            <span className="font-mono text-purple-300">v{diff.targetMetadata.version}</span> ({diff.targetMetadata.is_managed ? 'Managed' : 'Unmanaged'})
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {aiInfo.provider !== 'offline' && (
            <Button
              appearance="primary"
              size="small"
              icon={isAiGenerating ? <Spinner size="tiny" /> : <Sparkle20Filled />}
              disabled={isAiGenerating}
              onClick={onGenerateAiSummary}
            >
              {isAiGenerating ? 'Generating Analysis...' : 'Re-run AI Analysis'}
            </Button>
          )}

          {aiSummary && (
            <Button
              appearance="secondary"
              size="small"
              icon={copied ? <Checkmark20Regular className="text-emerald-400" /> : <Copy20Regular />}
              onClick={handleCopy}
            >
              {copied ? 'Copied' : 'Copy Summary'}
            </Button>
          )}

          {/* Export Dropdown */}
          <div className="relative">
            <Button
              appearance="subtle"
              size="small"
              icon={<ArrowDownload20Regular />}
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              Export Diff
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-30">
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    onExportMarkdown();
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                >
                  <span className="text-emerald-400 font-bold">MD</span>
                  <span>Download Markdown Report</span>
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    onExportJson();
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                >
                  <span className="text-sky-400 font-bold">JSON</span>
                  <span>Download JSON Diff AST</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-950/70 border border-emerald-900/40 rounded-xl p-3">
          <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Added</div>
          <div className="text-2xl font-bold text-emerald-300 mt-1">+{diff.metrics.addedCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">New components</div>
        </div>
        <div className="bg-slate-950/70 border border-amber-900/40 rounded-xl p-3">
          <div className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">Modified</div>
          <div className="text-2xl font-bold text-amber-300 mt-1">~{diff.metrics.modifiedCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Updated schemas/flows</div>
        </div>
        <div className="bg-slate-950/70 border border-rose-900/40 rounded-xl p-3">
          <div className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">Removed</div>
          <div className="text-2xl font-bold text-rose-300 mt-1">-{diff.metrics.removedCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Deleted components</div>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Unchanged</div>
          <div className="text-2xl font-bold text-slate-300 mt-1">{diff.metrics.unchangedCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Identical</div>
        </div>
        <div className={`bg-slate-950/70 border rounded-xl p-3 ${
          breakingCount > 0 ? 'border-rose-600/50 bg-rose-950/20' : 'border-slate-800'
        }`}>
          <div className="text-[11px] font-medium text-rose-400 uppercase tracking-wider flex items-center gap-1">
            <Shield20Regular className="w-3.5 h-3.5" />
            Breaking Risks
          </div>
          <div className="text-2xl font-bold text-rose-300 mt-1">{breakingCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{warningCount} warnings</div>
        </div>
      </div>

      {/* Breaking Changes Alert Section */}
      {diff.breakingChanges.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4">
          <button
            onClick={() => setShowBreakingDetails(!showBreakingDetails)}
            className="w-full flex items-center justify-between text-left font-semibold text-rose-300 text-sm"
          >
            <div className="flex items-center gap-2">
              <Warning20Filled className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>
                {breakingCount} Breaking Change{breakingCount === 1 ? '' : 's'} &amp; {warningCount} Warning{warningCount === 1 ? '' : 's'} Detected
              </span>
            </div>
            {showBreakingDetails ? (
              <ChevronDown20Regular className="w-4 h-4 text-rose-400" />
            ) : (
              <ChevronRight20Regular className="w-4 h-4 text-rose-400" />
            )}
          </button>

          {showBreakingDetails && (
            <div className="mt-3 space-y-2 pt-3 border-t border-rose-900/40">
              {diff.breakingChanges.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-950/80 border border-rose-900/40 rounded-lg p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-rose-200 flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${
                        item.severity === 'breaking' ? 'bg-rose-500' : 'bg-amber-500'
                      }`} />
                      {item.title}
                    </span>
                    <Badge
                      appearance="filled"
                      color={item.severity === 'breaking' ? 'danger' : 'warning'}
                      size="small"
                    >
                      {item.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-slate-300 mt-1">{item.description}</p>
                  <p className="text-slate-400 mt-1 font-mono text-[11px]">
                    <strong className="text-slate-300 font-sans">Impact: </strong>
                    {item.impactAssessment}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rendered Summary Markdown */}
      <div className="prose prose-invert prose-sm max-w-none bg-slate-950/60 border border-slate-800/80 rounded-xl p-5 overflow-x-auto leading-relaxed">
        {isAiGenerating ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <Spinner size="medium" label="Analyzing solution differences with AI..." />
            <p className="text-xs text-slate-400">Synthesizing schemas, flows, rules, and blast radius...</p>
          </div>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {aiSummary}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
};
