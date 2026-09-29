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
  Download,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Terminal,
} from 'lucide-react';
import { getAISettings, saveAISettings, AISettings } from '../../services/generator/docGenerator';
import { getDatabaseStats, clearAllData } from '../../services/db';
import { DatabaseStats } from '../../types/db';
import {
  checkWebGPUSupport,
  isGemmaCached,
  deleteGemmaCache,
  getOrInitGemmaEngine,
  GEMMA_MODELS,
  DEFAULT_GEMMA_MODEL,
  WebGPUStatus,
} from '../../services/gemma/gemmaEngine';

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
    localGemmaModel: DEFAULT_GEMMA_MODEL,
    forceDeterministicDocs: false,
    forceLocalAnswers: false,
  });
  const [saved, setSaved] = useState(false);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);

  // Gemma state
  const [gpuStatus, setGpuStatus] = useState<WebGPUStatus | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ text: string; progress: number } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const s = getAISettings();
      setSettings(s);
      getDatabaseStats().then(setDbStats).catch(console.error);
      checkWebGPUSupport().then(setGpuStatus);
      isGemmaCached(s.localGemmaModel || DEFAULT_GEMMA_MODEL).then(setIsCached);
    }
  }, [isOpen]);

  const refreshCacheStatus = async (modelId: string) => {
    const cached = await isGemmaCached(modelId);
    setIsCached(cached);
  };

  const handleDownloadModel = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await getOrInitGemmaEngine(settings.localGemmaModel || DEFAULT_GEMMA_MODEL, (report) => {
        setDownloadProgress(report);
      });
      setIsCached(true);
    } catch (err: any) {
      setDownloadError(err?.message || 'Failed to download Gemma model');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteCache = async () => {
    const modelObj =
      GEMMA_MODELS.find((m) => m.id === (settings.localGemmaModel || DEFAULT_GEMMA_MODEL)) ||
      GEMMA_MODELS[0];
    const shortName = modelObj.name.split(' (')[0];
    if (confirm(`Delete cached weights for ${shortName} to free up browser storage?`)) {
      await deleteGemmaCache(settings.localGemmaModel || DEFAULT_GEMMA_MODEL);
      setIsCached(false);
      setDownloadProgress(null);
    }
  };

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

  const selectedLocalModel =
    GEMMA_MODELS.find((m) => m.id === (settings.localGemmaModel || DEFAULT_GEMMA_MODEL)) ||
    GEMMA_MODELS[0];
  const selectedModelShortName = selectedLocalModel.name.split(' (')[0];

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
          {/* Provider Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Agentic AI Provider
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, provider: 'openai' })}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition ${
                  settings.provider === 'openai'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm shadow-indigo-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className="font-semibold text-xs mb-0.5">OpenAI SDK</span>
                <span className="text-[10px] text-slate-400">Cloud BYOK</span>
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
              <button
                type="button"
                onClick={() => {
                  setSettings({ ...settings, provider: 'local_gemma' });
                  refreshCacheStatus(settings.localGemmaModel || DEFAULT_GEMMA_MODEL);
                }}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition ${
                  settings.provider === 'local_gemma'
                    ? 'bg-purple-600/20 border-purple-500 text-white shadow-sm shadow-purple-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className="font-semibold text-xs mb-0.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  Local Gemma
                </span>
                <span className="text-[10px] text-purple-300/80">In-Browser WebGPU</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {settings.provider === 'local_gemma'
                ? 'Runs 100% in your browser using WebGPU. No API keys or internet connection required.'
                : 'The selected provider is used by default when API keys are configured.'}
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
                  Obtain a Gemini API key free from Google AI Studio. If blank, pp-pedia runs offline.
                </p>
              </div>

              {/* Gemini Model Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Gemini Model Name</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Free text / Custom</span>
                </label>
                <input
                  type="text"
                  list="gemini-model-suggestions"
                  placeholder="e.g. gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash"
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

          {settings.provider === 'local_gemma' && (
            <div className="space-y-4">
              {/* WebGPU Hardware Status */}
              <div
                className={`p-3 rounded-xl border ${
                  gpuStatus?.supported
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {gpuStatus?.supported ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>WebGPU Hardware Acceleration Available</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>WebGPU Acceleration Not Detected</span>
                    </>
                  )}
                </div>
                <p className="text-[11px] mt-1 text-slate-300/80 leading-relaxed">
                  {gpuStatus?.supported
                    ? `Adapter: ${gpuStatus.adapterName || 'GPU Hardware'}. High-speed in-browser tensor execution is enabled.`
                    : gpuStatus?.reason ||
                      'WebGPU is not enabled in this browser. Please enable chrome://flags/#enable-unsafe-webgpu or use Chrome/Edge 113+.'}
                </p>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    <span>Local Gemma Model</span>
                  </span>
                  <span className="text-[10px] text-purple-400 font-mono">WebLLM / Apache TVM</span>
                </label>
                <select
                  value={settings.localGemmaModel || DEFAULT_GEMMA_MODEL}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSettings({ ...settings, localGemmaModel: val });
                    refreshCacheStatus(val);
                  }}
                  className="w-full px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500 transition"
                >
                  {GEMMA_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.size} • {m.vram} VRAM)
                    </option>
                  ))}
                </select>
              </div>

              {/* Model Download & Cache Management */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                    <span>Browser Model Cache</span>
                  </span>
                  {isCached ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Cached & Ready
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Not Downloaded ({selectedLocalModel.size})
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Model weights are cached in your browser's persistent CacheStorage. Gemma 2B models run lightweight agentic reasoning via prompt-based tool calling, while 8B Hermes models support native WebLLM function calling. Once downloaded, inference runs entirely offline.
                </p>

                {downloadProgress && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                      <span className="truncate pr-2">{downloadProgress.text}</span>
                      <span>{Math.round(downloadProgress.progress * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-purple-500 h-full transition-all duration-200 ease-out"
                        style={{ width: `${Math.round(downloadProgress.progress * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {downloadError && (
                  <p className="text-[11px] text-rose-400 bg-rose-950/30 p-2 rounded-lg border border-rose-800/40">
                    {downloadError}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  {!isCached ? (
                    <button
                      type="button"
                      disabled={isDownloading || !gpuStatus?.supported}
                      onClick={handleDownloadModel}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs transition shadow-sm shadow-purple-600/20"
                    >
                      {isDownloading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Downloading Weights...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Download & Initialize {selectedModelShortName}</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDeleteCache}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-850 hover:bg-rose-950/40 text-rose-400 text-xs transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Cached {selectedModelShortName}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

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

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 cursor-pointer transition select-none group">
              <input
                type="checkbox"
                checked={Boolean(settings.enableVerboseLogging)}
                onChange={(e) =>
                  setSettings({ ...settings, enableVerboseLogging: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 bg-slate-900 cursor-pointer"
              />
              <div className="text-xs">
                <div className="font-medium text-slate-200 group-hover:text-indigo-300 transition flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  <span>Enable verbose agent & LLM telemetry</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-950/80 border border-purple-800/60 text-purple-300">
                    Console & UI
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Log full prompts, tool arguments, raw observations, token usage, and execution latency to the browser DevTools console and chat inspection trail for code optimization.
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

