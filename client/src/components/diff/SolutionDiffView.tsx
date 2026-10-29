import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowSwap20Regular,
  ChevronLeft20Regular,
  Sparkle20Filled,
} from '@fluentui/react-icons';
import { Button, Select } from '@fluentui/react-components';
import { ProjectRecord } from '../../types/db';
import { SolutionDiffResult } from '../../types/diff';
import { computeSolutionDiff } from '../../services/diff/diffEngine';
import {
  generateExecutiveDiffSummary,
  generateDeterministicSummary,
} from '../../services/diff/aiSummary';
import {
  exportDiffAsMarkdown,
  exportDiffAsJson,
} from '../../services/diff/diffExporter';
import { DiffSummaryCard } from './DiffSummaryCard';
import { ComponentDiffTree, SelectedComponentInfo } from './ComponentDiffTree';
import { ComponentDetailDiff } from './ComponentDetailDiff';
import { ActiveAIInfo, getAISettings } from '../../services/generator/docGenerator';

interface SolutionDiffViewProps {
  projects: ProjectRecord[];
  baseProjectId: string;
  targetProjectId: string;
  onSelectBaseProject: (id: string) => void;
  onSelectTargetProject: (id: string) => void;
  onBackToDashboard: () => void;
  aiInfo: ActiveAIInfo;
}

export const SolutionDiffView: React.FC<SolutionDiffViewProps> = ({
  projects,
  baseProjectId,
  targetProjectId,
  onSelectBaseProject,
  onSelectTargetProject,
  onBackToDashboard,
  aiInfo,
}) => {
  const baseProject = projects.find((p) => p.id === baseProjectId);
  const targetProject = projects.find((p) => p.id === targetProjectId);

  const [selectedComponent, setSelectedComponent] = useState<SelectedComponentInfo | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);

  // Compute deterministic diff AST
  const diffResult: SolutionDiffResult | null = useMemo(() => {
    if (!baseProject?.ast_json || !targetProject?.ast_json) return null;
    return computeSolutionDiff(baseProject.ast_json, targetProject.ast_json);
  }, [baseProject, targetProject]);

  // Set default selected component if none selected
  useEffect(() => {
    if (!diffResult) return;
    if (selectedComponent) return;

    // Default select first modified or added entity or flow
    const firstChangedEntity = diffResult.entities.find((e) => e.status !== 'unchanged');
    if (firstChangedEntity) {
      setSelectedComponent({ category: 'entities', id: firstChangedEntity.logical_name });
      return;
    }
    const firstChangedFlow = diffResult.flows.find((f) => f.status !== 'unchanged');
    if (firstChangedFlow) {
      setSelectedComponent({ category: 'flows', id: firstChangedFlow.name });
      return;
    }
    if (diffResult.entities.length > 0) {
      setSelectedComponent({ category: 'entities', id: diffResult.entities[0].logical_name });
    }
  }, [diffResult, selectedComponent]);

  // AI Summary generation
  const handleGenerateAiSummary = useCallback(async () => {
    if (!diffResult) return;
    setIsAiGenerating(true);
    try {
      const settings = getAISettings();
      const summary = await generateExecutiveDiffSummary(diffResult, settings);
      setAiSummary(summary);
    } catch (err: any) {
      console.error('Failed to generate AI diff summary:', err);
      // Fallback to deterministic
      setAiSummary(generateDeterministicSummary(diffResult));
    } finally {
      setIsAiGenerating(false);
    }
  }, [diffResult]);

  // Initial summary load
  useEffect(() => {
    if (!diffResult) return;
    // Always start with deterministic summary instantly
    const initialSummary = generateDeterministicSummary(diffResult);
    setAiSummary(initialSummary);

    // If AI is configured, run AI summary in background
    if (aiInfo.provider !== 'offline') {
      handleGenerateAiSummary();
    }
  }, [diffResult, aiInfo.provider, handleGenerateAiSummary]);

  // Swap Base & Target
  const handleSwap = () => {
    const temp = baseProjectId;
    onSelectBaseProject(targetProjectId);
    onSelectTargetProject(temp);
  };

  if (!baseProject || !targetProject || !diffResult) {
    return (
      <div className="h-[calc(100vh-65px)] flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-300">
        <p className="text-base font-semibold">Select valid base and target solutions to compare.</p>
        <Button
          appearance="secondary"
          className="mt-4"
          icon={<ChevronLeft20Regular />}
          onClick={onBackToDashboard}
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header / Solution Selectors Toolbar */}
      <div className="h-[60px] border-b border-slate-800 bg-slate-900/60 px-6 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            appearance="subtle"
            size="small"
            icon={<ChevronLeft20Regular />}
            onClick={onBackToDashboard}
          >
            Dashboard
          </Button>

          <div className="h-4 w-[1px] bg-slate-800" />

          {/* Base Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Base:</span>
            <select
              value={baseProjectId}
              onChange={(e) => onSelectBaseProject(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg text-xs py-1 px-2.5 font-medium focus:outline-none focus:border-purple-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} (v{p.version})
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            title="Swap Base and Target"
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition"
          >
            <ArrowSwap20Regular className="w-3.5 h-3.5" />
          </button>

          {/* Target Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Target:</span>
            <select
              value={targetProjectId}
              onChange={(e) => onSelectTargetProject(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg text-xs py-1 px-2.5 font-medium focus:outline-none focus:border-purple-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} (v{p.version})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Info: Version transition */}
        <div className="hidden md:flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400 font-sans">Delta:</span>
          <span className="text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/40">
            v{baseProject.version} ➔ v{targetProject.version}
          </span>
        </div>
      </div>

      {/* Main Workspace Body: Scrollable */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Executive Summary & KPI Stats Card */}
          <DiffSummaryCard
            diff={diffResult}
            aiSummary={aiSummary}
            isAiGenerating={isAiGenerating}
            onGenerateAiSummary={handleGenerateAiSummary}
            aiInfo={aiInfo}
            onExportMarkdown={() => exportDiffAsMarkdown(baseProject, targetProject, diffResult, aiSummary)}
            onExportJson={() => exportDiffAsJson(baseProject, targetProject, diffResult)}
          />

          {/* Component Diff Explorer & Detail Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[720px]">
            {/* Left Column: Explorer Tree (4 cols) */}
            <div className="lg:col-span-4 h-full">
              <ComponentDiffTree
                diff={diffResult}
                selectedComponent={selectedComponent}
                onSelectComponent={setSelectedComponent}
              />
            </div>

            {/* Right Column: Detail Inspector (8 cols) */}
            <div className="lg:col-span-8 h-full">
              <ComponentDetailDiff
                diff={diffResult}
                selectedComponent={selectedComponent}
                aiInfo={aiInfo}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

