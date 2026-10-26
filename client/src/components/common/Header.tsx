import React from 'react';
import {
  bundleIcon,
  Layer20Filled,
  Layer20Regular,
  BookOpen20Filled,
  BookOpen20Regular,
  Chat20Filled,
  Chat20Regular,
  Settings20Regular,
  ShieldCheckmark20Regular,
  Flash20Regular,
  Sparkle20Filled,
} from '@fluentui/react-icons';
import { TabList, Tab, Button } from '@fluentui/react-components';
import { ProjectRecord } from '../../types/db';
import { ActiveAIInfo } from '../../services/generator/docGenerator';

export type AppView = 'dashboard' | 'reader' | 'chat';

const DashboardIcon = bundleIcon(Layer20Filled, Layer20Regular);
const DocsIcon = bundleIcon(BookOpen20Filled, BookOpen20Regular);
const ChatIcon = bundleIcon(Chat20Filled, Chat20Regular);

interface HeaderProps {
  currentView: AppView;
  onNavigateView: (view: AppView) => void;
  projects: ProjectRecord[];
  activeProjectId?: string;
  onSelectProject: (id: string) => void;
  onOpenSettings: () => void;
  aiInfo: ActiveAIInfo;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigateView,
  projects,
  activeProjectId,
  onSelectProject,
  onOpenSettings,
  aiInfo,
}) => {
  return (
    <header className="h-[65px] border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between text-slate-100 sticky top-0 z-40">
      {/* Brand logo & Nav */}
      <div className="flex items-center gap-6">
        <button
          onClick={() => onNavigateView('dashboard')}
          className="flex items-center gap-2.5 hover:opacity-90 transition text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-power-purple via-indigo-600 to-power-blue p-0.5 shadow-lg shadow-purple-900/30">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-purple-300 font-black text-sm">
              PP
            </div>
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              pp-pedia
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                Power Platform
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Architecture &amp; Developer AI Studio
            </div>
          </div>
        </button>

        {/* Fluent Navigation Tabs */}
        <nav className="hidden md:flex items-center">
          <TabList
            selectedValue={currentView}
            onTabSelect={(_, data) => onNavigateView(data.value as AppView)}
            appearance="subtle"
            size="medium"
          >
            <Tab
              value="dashboard"
              icon={<DashboardIcon />}
            >
              Dashboard
            </Tab>
            <Tab
              value="reader"
              disabled={projects.length === 0}
              icon={<DocsIcon />}
            >
              Documentation
            </Tab>
            <Tab
              value="chat"
              disabled={projects.length === 0}
              icon={<ChatIcon />}
            >
              PP AI Copilot
            </Tab>
          </TabList>
        </nav>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Solution Switcher (Visible in Reader or Chat) */}
        {projects.length > 0 && currentView !== 'dashboard' && (
          <div className="hidden sm:flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400">Solution:</span>
            <select
              value={activeProjectId || ''}
              onChange={(e) => onSelectProject(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[190px] truncate"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* AI Provider Status Button */}
        <button
          onClick={onOpenSettings}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition shadow-sm select-none hover:brightness-110 ${aiInfo.badgeStyle}`}
          title={`Active AI: ${aiInfo.label} (${aiInfo.model}) · Click to open Settings`}
        >
          {aiInfo.provider === 'google' ? (
            <Sparkle20Filled className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : aiInfo.provider === 'openai' ? (
            <ShieldCheckmark20Regular className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          ) : (
            <Flash20Regular className="w-4 h-4 text-slate-400 flex-shrink-0" />
          )}

          <div className="flex items-center gap-1.5 leading-none">
            <span className="font-semibold tracking-tight">{aiInfo.label}</span>
            {aiInfo.subLabel && (
              <span className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-700/50 font-mono opacity-80">
                {aiInfo.subLabel}
              </span>
            )}
          </div>

          <Settings20Regular className="w-3.5 h-3.5 opacity-60 ml-0.5 hover:opacity-100 transition" />
        </button>
      </div>
    </header>
  );
};
