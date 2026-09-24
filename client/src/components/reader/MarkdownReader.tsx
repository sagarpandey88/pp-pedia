import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Database,
  Workflow,
  Layout,
  Sliders,
  Download,
  Search,
  ChevronRight,
  ChevronDown,
  Archive,
  FileCode,
  Layers,
} from 'lucide-react';
import { ProjectRecord, DocumentRecord, DocumentType } from '../../types/db';
import { MermaidDiagram } from './MermaidDiagram';
import {
  exportDocsAsZip,
  exportDocsAsSingleMarkdown,
  exportAstJson,
} from '../../services/exporter';

interface MarkdownReaderProps {
  project: ProjectRecord;
  documents: DocumentRecord[];
  activeDocId?: string;
  onSelectDoc: (id: string) => void;
}

export const MarkdownReader: React.FC<MarkdownReaderProps> = ({
  project,
  documents,
  activeDocId,
  onSelectDoc,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const activeDoc =
    documents.find((d) => d.id === activeDocId) || documents[0];

  const isSearching = searchQuery.trim().length > 0;

  // Auto-expand folder if active document is inside it
  useEffect(() => {
    if (activeDoc) {
      if (activeDoc.doc_type === 'flow') {
        setCollapsedCategories((prev) => {
          if (prev.has('flows')) {
            const next = new Set(prev);
            next.delete('flows');
            return next;
          }
          return prev;
        });
      } else if (activeDoc.doc_type === 'canvas_app') {
        setCollapsedCategories((prev) => {
          if (prev.has('canvas_apps')) {
            const next = new Set(prev);
            next.delete('canvas_apps');
            return next;
          }
          return prev;
        });
      }
    }
  }, [activeDoc?.id, activeDoc?.doc_type]);

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setCollapsedCategories(new Set());
  };

  const collapseAll = () => {
    setCollapsedCategories(new Set(['flows', 'canvas_apps', 'other']));
  };

  const getDocIcon = (type: DocumentType) => {
    switch (type) {
      case 'overview':
        return <Layers className="w-4 h-4 text-indigo-400 flex-shrink-0" />;
      case 'dataverse':
        return <Database className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
      case 'flow':
        return <Workflow className="w-4 h-4 text-sky-400 flex-shrink-0" />;
      case 'canvas_app':
        return <Layout className="w-4 h-4 text-purple-400 flex-shrink-0" />;
      case 'env_vars':
        return <Sliders className="w-4 h-4 text-amber-400 flex-shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />;
    }
  };

  const filteredDocs = useMemo(() => {
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.doc_type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [documents, searchQuery]);

  const treeGroups = useMemo(() => {
    const overviewDocs = filteredDocs.filter((d) => d.doc_type === 'overview');
    const dataverseDocs = filteredDocs.filter((d) => d.doc_type === 'dataverse');
    const flowDocs = filteredDocs.filter((d) => d.doc_type === 'flow');
    const appDocs = filteredDocs.filter((d) => d.doc_type === 'canvas_app');
    const envDocs = filteredDocs.filter((d) => d.doc_type === 'env_vars');
    const otherDocs = filteredDocs.filter(
      (d) => !['overview', 'dataverse', 'flow', 'canvas_app', 'env_vars'].includes(d.doc_type)
    );

    return {
      standalone: [...overviewDocs, ...dataverseDocs, ...envDocs],
      folders: [
        {
          id: 'flows',
          name: 'Cloud Flows',
          icon: <Workflow className="w-4 h-4 text-sky-400 flex-shrink-0" />,
          docs: flowDocs,
          totalCount: documents.filter((d) => d.doc_type === 'flow').length,
        },
        {
          id: 'canvas_apps',
          name: 'Canvas Applications',
          icon: <Layout className="w-4 h-4 text-purple-400 flex-shrink-0" />,
          docs: appDocs,
          totalCount: documents.filter((d) => d.doc_type === 'canvas_app').length,
        },
        {
          id: 'other',
          name: 'Other Modules',
          icon: <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />,
          docs: otherDocs,
          totalCount: documents.filter(
            (d) => !['overview', 'dataverse', 'flow', 'canvas_app', 'env_vars'].includes(d.doc_type)
          ).length,
        },
      ].filter((f) => f.docs.length > 0),
    };
  }, [filteredDocs, documents]);

  return (
    <div className="flex h-[calc(100vh-65px)] w-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar navigation */}
      <div className="w-80 flex-shrink-0 border-r border-slate-800/80 bg-slate-900/40 flex flex-col backdrop-blur-sm">
        {/* Solution summary card */}
        <div className="p-4 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Solution
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                project.is_managed
                  ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                  : 'bg-amber-900/60 text-amber-300 border border-amber-700/50'
              }`}
            >
              {project.is_managed ? 'Managed' : 'Unmanaged'}
            </span>
          </div>
          <h2 className="text-base font-semibold text-slate-100 mt-1 truncate" title={project.display_name}>
            {project.display_name}
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">
            v{project.version} • {project.unique_name}
          </p>

          {/* Export dropdown */}
          <div className="relative mt-3">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-750 text-xs font-medium rounded-lg text-slate-200 border border-slate-700/70 transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              Export Documentation
            </button>

            {showExportMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 z-20">
                <button
                  onClick={() => {
                    exportDocsAsZip(project, documents);
                    setShowExportMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 transition"
                >
                  <Archive className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="font-medium">ZIP Bundle (.zip)</div>
                    <div className="text-[10px] text-slate-400">Organized Markdown files + AST</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    exportDocsAsSingleMarkdown(project, documents);
                    setShowExportMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 transition"
                >
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="font-medium">Consolidated Markdown (.md)</div>
                    <div className="text-[10px] text-slate-400">Single handbook with TOC</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    exportAstJson(project);
                    setShowExportMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 transition"
                >
                  <FileCode className="w-4 h-4 text-sky-400" />
                  <div>
                    <div className="font-medium">Raw AST JSON (.json)</div>
                    <div className="text-[10px] text-slate-400">Normalized schema metadata</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filter search */}
        <div className="p-3 border-b border-slate-800/80">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>

        {/* Documents tree view */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Modules ({filteredDocs.length})
            </span>
            {treeGroups.folders.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <button
                  onClick={expandAll}
                  className="text-slate-400 hover:text-indigo-300 transition"
                  title="Expand all folders"
                >
                  Expand
                </button>
                <span className="text-slate-600">/</span>
                <button
                  onClick={collapseAll}
                  className="text-slate-400 hover:text-indigo-300 transition"
                  title="Collapse all folders"
                >
                  Collapse
                </button>
              </div>
            )}
          </div>

          {/* Standalone items (Architecture, Dataverse Schema, Env Vars) */}
          {treeGroups.standalone.map((doc) => {
            const isActive = activeDoc?.id === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() => onSelectDoc(doc.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition group ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-medium shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                {getDocIcon(doc.doc_type)}
                <span className="flex-1 truncate">{doc.title}</span>
                <ChevronRight
                  className={`w-3.5 h-3.5 transition-transform ${
                    isActive ? 'text-indigo-400 translate-x-0.5' : 'text-slate-600 opacity-0 group-hover:opacity-100'
                  }`}
                />
              </button>
            );
          })}

          {/* Tree folders (Cloud Flows, Canvas Apps, etc.) */}
          {treeGroups.folders.map((folder) => {
            const isCollapsed = !isSearching && collapsedCategories.has(folder.id);
            const hasActiveChild = folder.docs.some((d) => d.id === activeDoc?.id);

            return (
              <div key={folder.id} className="pt-1">
                {/* Folder Header */}
                <button
                  onClick={() => toggleCategory(folder.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition group font-medium ${
                    hasActiveChild && isCollapsed
                      ? 'text-indigo-300 bg-indigo-950/30 border border-indigo-500/20'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                  }`}
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${
                      isCollapsed ? '-rotate-90' : 'rotate-0'
                    }`}
                  />
                  {folder.icon}
                  <span className="flex-1 truncate">{folder.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800/90 text-slate-400 border border-slate-700/60 font-mono">
                    {folder.docs.length !== folder.totalCount
                      ? `${folder.docs.length}/${folder.totalCount}`
                      : folder.docs.length}
                  </span>
                </button>

                {/* Children tree branch */}
                {!isCollapsed && (
                  <div className="relative ml-4 pl-2.5 my-1 space-y-0.5 border-l border-slate-800/90">
                    {folder.docs.map((doc) => {
                      const isActive = activeDoc?.id === doc.id;
                      const displayTitle =
                        doc.doc_type === 'flow'
                          ? doc.title.replace(/^Flow:\s*/i, '')
                          : doc.doc_type === 'canvas_app'
                          ? doc.title.replace(/^App:\s*/i, '')
                          : doc.title;

                      return (
                        <button
                          key={doc.id}
                          onClick={() => onSelectDoc(doc.id)}
                          title={doc.title}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition group ${
                            isActive
                              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-medium'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full transition-colors flex-shrink-0 ${
                              isActive ? 'bg-indigo-400 scale-125' : 'bg-slate-600 group-hover:bg-slate-400'
                            }`}
                          />
                          <span className="flex-1 truncate">{displayTitle}</span>
                          {isActive && (
                            <ChevronRight className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {filteredDocs.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-500">
              No documents found matching "{searchQuery}"
            </div>
          )}
        </div>
      </div>

      {/* Main markdown content pane */}
      <div className="flex-1 h-full overflow-y-auto p-8 lg:p-12">
        <div className="max-w-4xl mx-auto">
          {activeDoc ? (
            <article className="prose prose-invert prose-slate max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre({ children }: any) {
                    return <>{children}</>;
                  },
                  code({ node, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const lang = match ? match[1] : '';
                    const codeText = String(children).replace(/\n$/, '');

                    // In react-markdown v9, block code has a language class or newlines in content
                    const isBlock = Boolean(match) || (typeof children === 'string' && children.includes('\n'));

                    if (isBlock && lang === 'mermaid') {
                      return <MermaidDiagram chart={codeText} />;
                    }

                    if (isBlock) {
                      return (
                        <div className="relative my-4 rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden">
                          <div className="px-4 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400">
                            {lang || 'code'}
                          </div>
                          <pre className="p-4 overflow-x-auto text-xs font-mono text-slate-200 bg-slate-950/70">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        </div>
                      );
                    }

                    return (
                      <code
                        className="px-1.5 py-0.5 rounded bg-slate-800/80 text-indigo-300 font-mono text-xs border border-slate-700/50"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  table({ children }: any) {
                    return (
                      <div className="my-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50 shadow">
                        <table className="w-full text-left text-xs text-slate-200 border-collapse">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  thead({ children }: any) {
                    return <thead className="bg-slate-850 text-slate-300 border-b border-slate-800 font-semibold">{children}</thead>;
                  },
                  th({ children }: any) {
                    return <th className="px-4 py-3 font-semibold">{children}</th>;
                  },
                  td({ children }: any) {
                    return <td className="px-4 py-3 border-b border-slate-850/80">{children}</td>;
                  },
                  blockquote({ children }: any) {
                    return (
                      <blockquote className="my-4 border-l-4 border-indigo-500 bg-indigo-950/20 px-4 py-3 rounded-r-lg text-slate-300 italic">
                        {children}
                      </blockquote>
                    );
                  },
                  h1({ children }: any) {
                    return (
                      <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white mb-4 border-b border-slate-800 pb-3">
                        {children}
                      </h1>
                    );
                  },
                  h2({ children }: any) {
                    return (
                      <h2 className="text-xl font-bold tracking-tight text-slate-100 mt-8 mb-3 border-b border-slate-800/60 pb-2 flex items-center gap-2">
                        {children}
                      </h2>
                    );
                  },
                  h3({ children }: any) {
                    return (
                      <h3 className="text-base font-semibold text-slate-200 mt-6 mb-2">
                        {children}
                      </h3>
                    );
                  },
                  p({ children }: any) {
                    return <p className="text-slate-300 text-sm leading-relaxed mb-4">{children}</p>;
                  },
                  ul({ children }: any) {
                    return <ul className="list-disc list-inside space-y-1 text-sm text-slate-300 mb-4">{children}</ul>;
                  },
                  ol({ children }: any) {
                    return <ol className="list-decimal list-inside space-y-1 text-sm text-slate-300 mb-4">{children}</ol>;
                  },
                }}
              >
                {activeDoc.content_markdown}
              </ReactMarkdown>
            </article>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <FileText className="w-12 h-12 mb-3 text-slate-600" />
              <p className="text-base font-medium">Select a document from the left navigation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

