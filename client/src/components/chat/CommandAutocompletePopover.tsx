import React, { useEffect, useRef } from 'react';
import {
  Zap,
  Database,
  Columns,
  Workflow,
  GitBranch,
  FileText,
  Lock,
  ChevronRight,
} from 'lucide-react';
import { AutocompleteItem } from '../../services/autocomplete/pgliteAutocomplete';

export interface CommandAutocompletePopoverProps {
  items: AutocompleteItem[];
  selectedIndex: number;
  onSelectItem: (item: AutocompleteItem) => void;
  onClose: () => void;
  categoryLabel?: string;
}

const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  command: Zap,
  entity: Database,
  column: Columns,
  connector: Workflow,
  flow: GitBranch,
  doc: FileText,
  literal: Lock,
};

const CATEGORY_COLORS: Record<string, string> = {
  command: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  entity: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  column: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  connector: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  flow: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  doc: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  literal: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
};

export const CommandAutocompletePopover: React.FC<CommandAutocompletePopoverProps> = ({
  items,
  selectedIndex,
  onSelectItem,
  onClose,
  categoryLabel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-2 max-h-72 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden z-50 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
        <span className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-indigo-400" />
          <span>{categoryLabel || 'PGlite Autocomplete Suggestions'}</span>
        </span>
        <span className="text-[10px] text-slate-500 flex items-center gap-2">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">↑</kbd>
            <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 ml-0.5">↓</kbd> navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">Tab</kbd> / <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">Enter</kbd> select
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">Esc</kbd>
          </span>
        </span>
      </div>

      {/* Items list */}
      <div className="overflow-y-auto p-1.5 space-y-0.5 divide-y divide-slate-850/50">
        {items.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          const IconComp = CATEGORY_ICONS[item.category] || Zap;
          const badgeColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.command;

          return (
            <button
              key={item.id}
              ref={isSelected ? activeItemRef : null}
              type="button"
              onClick={() => onSelectItem(item)}
              className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between gap-3 transition text-xs ${
                isSelected
                  ? 'bg-indigo-600/25 border border-indigo-500/40 text-white shadow-sm'
                  : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0 ${badgeColor}`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-slate-100 truncate">
                      {item.label}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase tracking-wider border ${badgeColor}`}
                    >
                      {item.category}
                    </span>
                  </div>

                  {item.detail && (
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {item.detail}
                    </div>
                  )}
                </div>
              </div>

              <ChevronRight
                className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${
                  isSelected ? 'opacity-100 text-indigo-400' : 'opacity-0'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
