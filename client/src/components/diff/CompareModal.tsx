import React, { useState } from 'react';
import {
  Dismiss20Regular,
  ArrowSwap20Regular,
  FolderZip20Regular,
  ArrowUpload20Regular,
} from '@fluentui/react-icons';
import { Button, Badge } from '@fluentui/react-components';
import { ProjectRecord } from '../../types/db';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseProject: ProjectRecord | null;
  projects: ProjectRecord[];
  onStartCompare: (baseId: string, targetId: string) => void;
  onUploadNewVersion?: (file: File) => Promise<void>;
  isUploading?: boolean;
}

export const CompareModal: React.FC<CompareModalProps> = ({
  isOpen,
  onClose,
  baseProject,
  projects,
  onStartCompare,
  onUploadNewVersion,
  isUploading = false,
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);

  if (!isOpen || !baseProject) return null;

  // Filter out the base project from target options (or keep same unique_name preferred)
  const candidateProjects = projects.filter((p) => p.id !== baseProject.id);

  // Auto-select first candidate if not set
  const currentTargetId = selectedTargetId || (candidateProjects[0]?.id ?? '');

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0] && onUploadNewVersion) {
      onUploadNewVersion(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onUploadNewVersion) {
      onUploadNewVersion(e.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <ArrowSwap20Regular className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Compare Solution Versions</h3>
              <p className="text-xs text-slate-400">Select two solution packages to compute deep component diffs</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <Dismiss20Regular className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Base Solution Card */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              1. Base Version (Source / Reference)
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">{baseProject.display_name}</div>
                <div className="text-xs font-mono text-slate-400 mt-0.5">{baseProject.unique_name}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge appearance="tint" color={baseProject.is_managed ? 'brand' : 'warning'} size="small">
                  {baseProject.is_managed ? 'Managed' : 'Unmanaged'}
                </Badge>
                <span className="text-xs font-mono text-purple-300 font-semibold bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/40">
                  v{baseProject.version}
                </span>
              </div>
            </div>
          </div>

          {/* Target Solution Selection */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              2. Target Version to Compare Against
            </div>

            {candidateProjects.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                  {candidateProjects.map((proj) => {
                    const isSelected = proj.id === currentTargetId;
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => setSelectedTargetId(proj.id)}
                        className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-purple-950/30 border-purple-500/70 text-white shadow-sm'
                            : 'bg-slate-950/40 border-slate-800/80 text-slate-300 hover:bg-slate-850'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold">{proj.display_name}</div>
                          <div className="text-[11px] font-mono text-slate-400">{proj.unique_name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-purple-300 font-semibold">
                            v{proj.version}
                          </span>
                          <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-purple-500 bg-purple-500' : 'border-slate-600'
                          }`}>
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 bg-slate-950/30 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400">No other solutions currently ingested in your workspace.</p>
              </div>
            )}
          </div>

          {/* Quick upload alternative */}
          {onUploadNewVersion && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Or Upload New Target Version (.zip)
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                  dragActive
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/30'
                }`}
              >
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleFileInput}
                  id="target-file-upload"
                  className="hidden"
                  disabled={isUploading}
                />
                <label htmlFor="target-file-upload" className="cursor-pointer block">
                  <ArrowUpload20Regular className="w-6 h-6 text-purple-400 mx-auto mb-1" />
                  <p className="text-xs font-medium text-slate-200">
                    {isUploading ? 'Ingesting solution...' : 'Drop or browse new solution .zip'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Will parse and add to comparison automatically
                  </p>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-950/40">
          <Button appearance="secondary" size="medium" onClick={onClose}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            size="medium"
            disabled={!currentTargetId || isUploading}
            onClick={() => {
              if (currentTargetId) {
                onStartCompare(baseProject.id, currentTargetId);
                onClose();
              }
            }}
          >
            Compare Versions
          </Button>
        </div>
      </div>
    </div>
  );
};

