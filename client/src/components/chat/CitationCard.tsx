import React from 'react';
import { Open20Regular, BookOpen20Regular, Layer20Regular } from '@fluentui/react-icons';
import { SimilarityResult } from '../../types/db';

interface CitationCardProps {
  citation: SimilarityResult;
  index: number;
  onSelectCitation: (citation: SimilarityResult) => void;
}

export const CitationCard: React.FC<CitationCardProps> = ({
  citation,
  index,
  onSelectCitation,
}) => {
  const matchPercentage = Math.round(citation.similarity * 100);

  const getMatchColor = (pct: number) => {
    if (pct >= 80) return 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40';
    if (pct >= 60) return 'text-sky-400 border-sky-500/30 bg-sky-950/40';
    return 'text-amber-400 border-amber-500/30 bg-amber-950/40';
  };

  return (
    <div
      onClick={() => onSelectCitation(citation)}
      className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 hover:border-purple-500/50 hover:bg-slate-850/80 transition-all duration-150 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-purple-900/40 text-purple-300 text-[11px] font-bold border border-purple-500/30">
            {index}
          </span>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 truncate transition flex items-center gap-1.5">
              <BookOpen20Regular className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              {citation.title}
            </h4>
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
              <Layer20Regular className="w-3 h-3 text-slate-500" />
              {citation.heading_context || 'General'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${getMatchColor(
              matchPercentage
            )}`}
          >
            {matchPercentage}% Match
          </span>
          <Open20Regular className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400 transition" />
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed bg-slate-950/40 p-2 rounded-lg font-mono">
        {citation.chunk_content}
      </p>

      <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
        <span>Solution: {citation.project_name}</span>
        <span className="text-purple-400 font-medium group-hover:underline">Open in Reader →</span>
      </div>
    </div>
  );
};
