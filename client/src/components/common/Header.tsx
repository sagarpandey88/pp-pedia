import React from 'react';
import {
  Layers,
  BookOpen,
  MessageSquare,
  Settings,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { ProjectRecord } from '../../types/db';

export type AppView = 'dashboard' | 'reader' | 'chat';

interface HeaderProps {
  currentView: AppView;
  onNavigateView: (view: AppView) => void;
  projects: ProjectRecord[];
  activeProjectId?: string;
  onSelectProject: (id: string) => void;
  onOpenSettings: () => void;
  hasApiKey: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigateView,
  projects,
  activeProjectId,
  onSelectProject,
  onOpenSettings,
  hasApiKey,
}) => {
  return (
    <header className="h-[65px] border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md px-6 flex items-center justify-between text-slate-100 sticky top-0 z-40">
      {/* Brand logo */}
      <div className="flex items-center gap-6">
        <button
          onClick={() => onNavigateView('dashboard')}
          className="flex items-center gap-2.5 hover:opacity-90 transition text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-indigo-400 font-black text-sm">
              PP
            </div>
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              pp-pedia
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                v1.0
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Power Platform Docs &amp; RAG
            </div>
          </div>
        </button>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => onNavigateView('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              currentView === 'dashboard'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => onNavigateView('reader')}
            disabled={projects.length === 0}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
              currentView === 'reader'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Documentation</span>
          </button>

          <button
            onClick={() => onNavigateView('chat')}
            disabled={projects.length === 0}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
              currentView === 'chat'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>RAG Assistant</span>
          </button>
        </nav>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Solution Switcher (Visible in Reader or Chat) */}
        {projects.length > 0 && currentView !== 'dashboard' && (
          <div className="hidden sm:flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400">Active:</span>
            <select
              value={activeProjectId || ''}
              onChange={(e) => onSelectProject(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[180px] truncate"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* AI Provider Status */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 text-xs text-slate-300 transition"
          title="Configure AI & Storage"
        >
          {hasApiKey ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span className="hidden sm:inline">
            {hasApiKey ? 'OpenAI BYOK' : 'Local AI Engine'}
          </span>
          <Settings className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
        </button>
      </div>
    </header>
  );
};

