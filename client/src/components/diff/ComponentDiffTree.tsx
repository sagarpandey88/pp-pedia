import React, { useState, useMemo } from 'react';
import {
  Database20Regular,
  Flow20Regular,
  AppGeneric20Regular,
  SlideSettings20Regular,
  Code20Regular,
  Scales20Regular,
  Shield20Regular,
  FolderZip20Regular,
  Search20Regular,
  Warning16Filled,
  Filter20Regular,
  ChevronRight16Regular,
  ChevronDown16Regular,
} from '@fluentui/react-icons';
import { Badge, Input } from '@fluentui/react-components';
import { SolutionDiffResult, DiffStatus } from '../../types/diff';

export type ComponentCategory =
  | 'entities'
  | 'flows'
  | 'canvasApps'
  | 'envVars'
  | 'webResources'
  | 'businessRules'
  | 'securityRoles'
  | 'optionSets';

export interface SelectedComponentInfo {
  category: ComponentCategory;
  id: string;
}

interface ComponentDiffTreeProps {
  diff: SolutionDiffResult;
  selectedComponent: SelectedComponentInfo | null;
  onSelectComponent: (info: SelectedComponentInfo) => void;
}

type StatusFilter = 'all' | 'modified' | 'added' | 'removed' | 'breaking';

export const ComponentDiffTree: React.FC<ComponentDiffTreeProps> = ({
  diff,
  selectedComponent,
  onSelectComponent,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const matchesFilter = (status: DiffStatus, isBreaking?: boolean, name?: string) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!name || !name.toLowerCase().includes(q)) return false;
    }
    if (statusFilter === 'all') return true;
    if (statusFilter === 'breaking') return Boolean(isBreaking);
    return status === statusFilter;
  };

  const categories = useMemo(() => {
    return [
      {
        key: 'entities' as ComponentCategory,
        label: 'Dataverse Tables',
        icon: Database20Regular,
        color: 'text-emerald-400',
        items: diff.entities
          .filter((e) => matchesFilter(e.status, e.isBreaking, `${e.display_name} ${e.logical_name}`))
          .map((e) => ({
            id: e.logical_name,
            name: e.display_name,
            subName: e.logical_name,
            status: e.status,
            isBreaking: e.isBreaking,
            badge: e.status === 'modified' ? `~${e.modifiedAttributesCount + e.addedAttributesCount + e.removedAttributesCount}` : undefined,
          })),
      },
      {
        key: 'flows' as ComponentCategory,
        label: 'Cloud Flows',
        icon: Flow20Regular,
        color: 'text-sky-400',
        items: diff.flows
          .filter((f) => matchesFilter(f.status, f.isBreaking, `${f.display_name} ${f.name}`))
          .map((f) => ({
            id: f.name,
            name: f.display_name,
            subName: f.name,
            status: f.status,
            isBreaking: f.isBreaking,
            badge: f.status === 'modified' ? `~${f.modifiedActionsCount + f.addedActionsCount + f.removedActionsCount}` : undefined,
          })),
      },
      {
        key: 'canvasApps' as ComponentCategory,
        label: 'Canvas Apps',
        icon: AppGeneric20Regular,
        color: 'text-purple-400',
        items: diff.canvasApps
          .filter((a) => matchesFilter(a.status, false, `${a.display_name} ${a.name}`))
          .map((a) => ({
            id: a.name,
            name: a.display_name,
            subName: a.name,
            status: a.status,
            isBreaking: false,
            badge: undefined,
          })),
      },
      {
        key: 'webResources' as ComponentCategory,
        label: 'Web Resources & Scripts',
        icon: Code20Regular,
        color: 'text-teal-400',
        items: diff.webResources
          .filter((w) => matchesFilter(w.status, w.isBreaking, `${w.display_name} ${w.name}`))
          .map((w) => ({
            id: w.name,
            name: w.display_name || w.name,
            subName: `${w.resource_type} • ${w.sizeDeltaBytes >= 0 ? `+${w.sizeDeltaBytes}` : w.sizeDeltaBytes} B`,
            status: w.status,
            isBreaking: w.isBreaking,
            badge: undefined,
          })),
      },
      {
        key: 'envVars' as ComponentCategory,
        label: 'Environment Variables',
        icon: SlideSettings20Regular,
        color: 'text-amber-400',
        items: diff.envVars
          .filter((v) => matchesFilter(v.status, v.isBreaking, `${v.display_name} ${v.schema_name}`))
          .map((v) => ({
            id: v.schema_name,
            name: v.display_name,
            subName: v.schema_name,
            status: v.status,
            isBreaking: v.isBreaking,
            badge: undefined,
          })),
      },
      {
        key: 'securityRoles' as ComponentCategory,
        label: 'Security Roles',
        icon: Shield20Regular,
        color: 'text-indigo-400',
        items: diff.securityRoles
          .filter((s) => matchesFilter(s.status, s.isBreaking, s.name))
          .map((s) => ({
            id: s.name,
            name: s.name,
            subName: `${s.tablePrivilegeDiffs.length} table privs changed`,
            status: s.status,
            isBreaking: s.isBreaking,
            badge: undefined,
          })),
      },
      {
        key: 'businessRules' as ComponentCategory,
        label: 'Business Rules',
        icon: Scales20Regular,
        color: 'text-rose-400',
        items: diff.businessRules
          .filter((b) => matchesFilter(b.status, false, `${b.name} ${b.table}`))
          .map((b) => ({
            id: b.id,
            name: b.name,
            subName: `Table: ${b.table}`,
            status: b.status,
            isBreaking: false,
            badge: undefined,
          })),
      },
      {
        key: 'optionSets' as ComponentCategory,
        label: 'Option Sets (Choices)',
        icon: FolderZip20Regular,
        color: 'text-blue-400',
        items: diff.optionSets
          .filter((o) => matchesFilter(o.status, o.isBreaking, `${o.display_name} ${o.name}`))
          .map((o) => ({
            id: o.name,
            name: o.display_name || o.name,
            subName: o.name,
            status: o.status,
            isBreaking: o.isBreaking,
            badge: undefined,
          })),
      },
    ];
  }, [diff, searchQuery, statusFilter]);

  const getStatusBadge = (status: DiffStatus, isBreaking?: boolean) => {
    if (isBreaking) {
      return (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
          <Warning16Filled className="w-3 h-3 text-rose-400" />
          BREAKING
        </span>
      );
    }
    switch (status) {
      case 'added':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            + Added
          </span>
        );
      case 'modified':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
            ~ Mod
          </span>
        );
      case 'removed':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
            - Del
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
            Unchanged
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col h-full overflow-hidden shadow-lg">
      {/* Header & Search */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white tracking-wide">Component Explorer</h3>
          <span className="text-xs text-slate-400 font-mono">
            {categories.reduce((acc, c) => acc + c.items.length, 0)} visible
          </span>
        </div>

        {/* Search */}
        <Input
          contentBefore={<Search20Regular className="text-slate-400" />}
          placeholder="Filter components..."
          value={searchQuery}
          onChange={(_, d) => setSearchQuery(d.value)}
          size="small"
          className="w-full"
        />

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
          {(['all', 'modified', 'added', 'removed', 'breaking'] as StatusFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition whitespace-nowrap capitalize ${
                statusFilter === filter
                  ? 'bg-purple-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Component Tree List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {categories.map((category) => {
          const isCollapsed = collapsedCategories[category.key];
          const hasItems = category.items.length > 0;
          const Icon = category.icon;

          if (!hasItems && searchQuery) return null;

          return (
            <div key={category.key} className="rounded-xl border border-slate-800/60 overflow-hidden bg-slate-950/40">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category.key)}
                className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${category.color}`} />
                  <span className="text-xs font-semibold text-slate-200">{category.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                    {category.items.length}
                  </span>
                  {isCollapsed ? (
                    <ChevronRight16Regular className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown16Regular className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Items List */}
              {!isCollapsed && (
                <div className="px-1.5 pb-1.5 space-y-1">
                  {category.items.length === 0 ? (
                    <div className="text-[11px] text-slate-500 py-1.5 px-3 italic">
                      No matching components
                    </div>
                  ) : (
                    category.items.map((item) => {
                      const isSelected =
                        selectedComponent?.category === category.key &&
                        selectedComponent?.id === item.id;

                      return (
                        <button
                          key={item.id}
                          onClick={() =>
                            onSelectComponent({
                              category: category.key,
                              id: item.id,
                            })
                          }
                          className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 transition ${
                            isSelected
                              ? 'bg-purple-600/25 border border-purple-500/50 text-white shadow-sm'
                              : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">{item.name}</div>
                            {item.subName && (
                              <div className="text-[10px] font-mono text-slate-500 truncate">
                                {item.subName}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            {getStatusBadge(item.status, item.isBreaking)}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

