import React, { useState, useEffect } from 'react';
import { X, Key, Server, Cpu, Database, Trash2, Check, ExternalLink, Sliders } from 'lucide-react';
import { getAISettings, saveAISettings, AISettings } from '../../services/generator/docGenerator';
import { getDatabaseStats, clearAllData } from '../../services/db';
import { DatabaseStats } from '../../types/db';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataCleared: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onDataCleared,
}) => {
  const [settings, setSettings] = useState<AISettings>({
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    forceDeterministicDocs: false,
    forceLocalAnswers: false,
  });
  const [saved, setSaved] = useState(false);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSettings(getAISettings());
      getDatabaseStats().then(setDbStats).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveAISettings(settings);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  const handleClearAll = async () => {
    if (
      confirm(
        'Are you sure you want to delete ALL solutions, documents, and vector embeddings from local PGlite storage? This cannot be undone.'
      )
    ) {
      await clearAllData();
      const updated = await getDatabaseStats();
      setDbStats(updated);
      onDataCleared();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Settings & Storage</h3>
              <p className="text-xs text-slate-400">Configure AI Providers & Local Database</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-5 space-y-5 overflow-y-auto flex-1 pr-1">
          {/* OpenAI API Key */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>OpenAI API Key (BYOK)</span>
              <span className="text-[10px] text-slate-500 font-normal">Optional</span>
            </label>
            <input
              type="password"
              placeholder="sk-proj-..."
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              If left blank, pp-pedia runs in 100% offline mode with full deterministic documentation & local RAG.
            </p>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span>API Base URL</span>
            </label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={settings.baseUrl}
              onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Use default for OpenAI, or configure for Azure OpenAI, Ollama, OpenRouter, or local proxies.
            </p>
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>Model Name</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal">Free text / Custom</span>
            </label>
            <input
              type="text"
              list="model-suggestions"
              placeholder="e.g. gpt-4o-mini, gpt-4o, llama3, deepseek-chat"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition font-mono"
            />
            <datalist id="model-suggestions">
              <option value="gpt-4o-mini" />
              <option value="gpt-4o" />
              <option value="gpt-4-turbo" />
              <option value="gpt-3.5-turbo" />
              <option value="llama3" />
              <option value="llama3.1" />
              <option value="mistral" />
              <option value="deepseek-chat" />
            </datalist>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['gpt-4o-mini', 'gpt-4o', 'llama3', 'deepseek-chat'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSettings({ ...settings, model: preset })}
                  className={`text-[10px] px-2 py-0.5 rounded-md font-mono border transition ${
                    settings.model === preset
                      ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                      : 'bg-slate-800/60 text-slate-400 border-slate-750 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Enter any standard model ID or custom deployment name supported by your API endpoint.
            </p>
          </div>

          {/* Execution Overrides */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Offline & Execution Overrides</span>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 cursor-pointer transition select-none group">
              <input
                type="checkbox"
                checked={Boolean(settings.forceDeterministicDocs)}
                onChange={(e) =>
                  setSettings({ ...settings, forceDeterministicDocs: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 bg-slate-900 cursor-pointer"
              />
              <div className="text-xs">
                <div className="font-medium text-slate-200 group-hover:text-indigo-300 transition">
                  Force deterministic documentation generation
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Skip LLM API calls during solution ingestion and generate documentation instantly using built-in deterministic AST templates.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 cursor-pointer transition select-none group">
              <input
                type="checkbox"
                checked={Boolean(settings.forceLocalAnswers)}
                onChange={(e) =>
                  setSettings({ ...settings, forceLocalAnswers: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 bg-slate-900 cursor-pointer"
              />
              <div className="text-xs">
                <div className="font-medium text-slate-200 group-hover:text-indigo-300 transition">
                  Force local answers
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Synthesize chat answers strictly from local vector search chunks without sending queries to OpenAI or external models.
                </div>
              </div>
            </label>
          </div>

          {/* Database Stats */}
          <div className="pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                Local PGlite Vector Storage
              </span>
              <span className="text-[10px] font-mono text-slate-400">idb://pp_pedia_db</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-850 text-center">
              <div>
                <div className="text-sm font-bold text-slate-100">{dbStats?.project_count ?? '-'}</div>
                <div className="text-[10px] text-slate-500">Solutions</div>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100">{dbStats?.document_count ?? '-'}</div>
                <div className="text-[10px] text-slate-500">Documents</div>
              </div>
              <div>
                <div className="text-sm font-bold text-indigo-400">{dbStats?.chunk_count ?? '-'}</div>
                <div className="text-[10px] text-slate-500">Vector Chunks</div>
              </div>
            </div>

            <button
              onClick={handleClearAll}
              className="mt-3 w-full py-1.5 px-3 rounded-lg border border-rose-900/50 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 text-xs font-medium flex items-center justify-center gap-2 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Local Database Data</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{saved ? 'Saved!' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

