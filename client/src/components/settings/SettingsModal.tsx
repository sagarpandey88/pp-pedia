import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Server,
  Cpu,
  Database,
  Trash2,
  Check,
  ExternalLink,
  Sliders,
  Sparkles,
  Zap,
  HardDrive,
  CheckCircle2,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
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
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    googleApiKey: '',
    googleModel: 'gemini-2.5-flash',
    forceDeterministicDocs: false,
    forceLocalAnswers: false,
  });
  const [saved, setSaved] = useState(false);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);

  useEffect(() => {
    if (isOpen) {
      const s = getAISettings();
      setSettings(s);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Application Settings</h2>
              <p className="text-xs text-slate-400">
                Configure AI generation providers, local PGlite engine, and storage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Provider Selector Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Default AI Reasoning Engine
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, provider: 'openai' })}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition ${
                  settings.provider === 'openai'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm shadow-indigo-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className="font-semibold text-xs mb-0.5">OpenAI / Compatible</span>
                <span className="text-[10px] text-slate-400">Agents SDK • BYOK</span>
              </button>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, provider: 'google' })}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition ${
                  settings.provider === 'google'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-sm shadow-emerald-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className="font-semibold text-xs mb-0.5">Google Gen AI</span>
                <span className="text-[10px] text-slate-400">Gemini BYOK</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {settings.forceLocalAnswers
                ? 'Forced local mode is active. AI cloud calls are bypassed; responses are powered by PGlite.'
                : 'The selected provider is used for autonomous agent reasoning and document generation.'}
            </p>
          </div>

          {/* Local PGlite Tools Callout */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                <span>Local Processing &amp; Slash Commands</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">
                PGlite WASM • Zero-Cost
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Use slash commands (e.g. <code className="text-indigo-300">/health</code>, <code className="text-indigo-300">/impact</code>, <code className="text-indigo-300">/er</code>, <code className="text-indigo-300">/flows</code>, <code className="text-indigo-300">/triggers</code>) and action chips in the chat box. They run 100% locally against PGlite with sub-millisecond autocomplete and zero API tokens consumed.
            </p>
          </div>

          {settings.provider === 'openai' && (
            <>
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
                  If left blank, pp-pedia runs in 100% offline mode with full deterministic documentation &amp; local RAG.
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
            </>
          )}

          {settings.provider === 'google' && (
            <>
              {/* Google Gemini API Key */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Google Gemini API Key (BYOK)</span>
                  <a
                    href="https://aistudio.google.com/app/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>Get key</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={settings.googleApiKey}
                  onChange={(e) => setSettings({ ...settings, googleApiKey: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Required for Google GenAI / Gemini provider. Get a free API key from Google AI Studio.
                </p>
              </div>

              {/* Gemini Model */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Gemini Model</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Free text / Custom</span>
                </label>
                <input
                  type="text"
                  list="gemini-model-suggestions"
                  placeholder="gemini-2.5-flash"
                  value={settings.googleModel}
                  onChange={(e) => setSettings({ ...settings, googleModel: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition font-mono"
                />
                <datalist id="gemini-model-suggestions">
                  <option value="gemini-2.5-flash" />
                  <option value="gemini-2.5-pro" />
                  <option value="gemini-2.0-flash" />
                  <option value="gemini-1.5-pro" />
                  <option value="gemini-1.5-flash" />
                </datalist>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSettings({ ...settings, googleModel: preset })}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-mono border transition ${
                        settings.googleModel === preset
                          ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50'
                          : 'bg-slate-800/60 text-slate-400 border-slate-750 hover:text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Select recommended Gemini 2.5 Flash for high performance, or Gemini 2.5 Pro for deep reasoning.
                </p>
              </div>
            </>
          )}

          {/* Execution Overrides */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Execution Overrides</span>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.forceDeterministicDocs || false}
                onChange={(e) =>
                  setSettings({ ...settings, forceDeterministicDocs: e.target.checked })
                }
                className="mt-0.5 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500/20"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Force 100% Deterministic Document Generation
                </span>
                <span className="text-[11px] text-slate-500">
                  Bypass LLM API calls during solution ingestion even if keys are provided. Produces instant, standard markdown.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.forceLocalAnswers || false}
                onChange={(e) =>
                  setSettings({ ...settings, forceLocalAnswers: e.target.checked })
                }
                className="mt-0.5 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500/20"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Force Offline Chat Synthesis (Zero-Token Mode)
                </span>
                <span className="text-[11px] text-slate-500">
                  Forces all chat queries and tools to execute strictly within local PGlite without sending tokens to cloud APIs.
                </span>
              </div>
            </label>
          </div>

          {/* Database Statistics */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                <span>PGlite Local Database</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                Persistent IndexedDB
              </span>
            </div>

            {dbStats && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
                  <div className="text-base font-bold text-white font-mono">
                    {dbStats.project_count}
                  </div>
                  <div className="text-[10px] text-slate-400">Solutions</div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
                  <div className="text-base font-bold text-white font-mono">
                    {dbStats.document_count}
                  </div>
                  <div className="text-[10px] text-slate-400">Documents</div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
                  <div className="text-base font-bold text-indigo-400 font-mono">
                    {dbStats.chunk_count}
                  </div>
                  <div className="text-[10px] text-slate-400">Embeddings</div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-900/60 bg-rose-950/20 hover:bg-rose-900/30 text-rose-300 text-xs font-medium transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Solutions &amp; Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/50">
          <span className="text-xs text-slate-500 font-mono">
            {saved ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Settings saved successfully!</span>
              </span>
            ) : (
              'Changes are saved locally in your browser'
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-lg shadow-indigo-600/20 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
