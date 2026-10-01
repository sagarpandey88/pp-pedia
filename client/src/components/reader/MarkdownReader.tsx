import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
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
  PanelLeftClose,
  PanelLeft,
  MessageSquare,
  Scale,
  Shield,
  Bot,
  BookOpenCheck,
  Sparkles,
  Copy,
  Check,
  Printer,
  ArrowUp,
} from 'lucide-react';
import { ProjectRecord, DocumentRecord, DocumentType } from '../../types/db';
import { MermaidDiagram } from './MermaidDiagram';
import {
  exportDocsAsZip,
  exportDocsAsSingleMarkdown,
  exportAstJson,
  buildCombinedMarkdown,
  slugifyTitle,
} from '../../services/exporter';
import { ChatAssistant } from '../chat/ChatAssistant';
import { ChatMessage } from '../../services/rag/ragService';

export const ALL_DOCS_ID = '__all_docs__';

export interface MarkdownReaderProps {
  project: ProjectRecord;
  documents: DocumentRecord[];
  activeDocId?: string;
  onSelectDoc: (id: string) => void;
  projects?: ProjectRecord[];
  onSelectProject?: (id: string | undefined) => void;
  onNavigateToDoc?: (projectId: string, docSlug: string) => void;
  onExpandToFullChat?: () => void;
  chatMessages?: ChatMessage[];
  setChatMessages?: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

function getNodeText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  if (node.props && node.props.children) return getNodeText(node.props.children);
  return '';
}

export const MarkdownReader: React.FC<MarkdownReaderProps> = ({
  project,
  documents,
  activeDocId,
  onSelectDoc,
  projects = [],
  onSelectProject,
  onNavigateToDoc,
  onExpandToFullChat,
  chatMessages,
  setChatMessages,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Chat sidepanel state
  const [isChatOpen, setIsChatOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('pp_doc_chat_open');
    return saved !== null ? saved === 'true' : true;
  });
  const [chatPanelWidth, setChatPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('pp_doc_chat_width');
    const parsed = saved ? parseInt(saved, 10) : 440;
    return isNaN(parsed) ? 440 : Math.min(Math.max(parsed, 320), 720);
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const contentPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('pp_doc_chat_open', String(isChatOpen));
  }, [isChatOpen]);

  useEffect(() => {
    localStorage.setItem('pp_doc_chat_width', String(chatPanelWidth));
  }, [chatPanelWidth]);

  useEffect(() => {
    contentPaneRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeDocId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = Math.min(720, Math.floor(window.innerWidth * 0.55));
      if (newWidth >= 320 && newWidth <= maxWidth) {
        setChatPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const handleChatNavigateToDoc = useCallback(
    (projId: string, docSlug: string) => {
      if (projId === project.id) {
        if (docSlug === 'all' || docSlug === 'combined' || docSlug === ALL_DOCS_ID) {
          onSelectDoc(ALL_DOCS_ID);
          return;
        }
        const match = documents.find((d) => d.slug === docSlug);
        if (match) {
          onSelectDoc(match.id);
          return;
        }
      }
      if (onNavigateToDoc) {
        onNavigateToDoc(projId, docSlug);
      }
    },
    [project.id, documents, onSelectDoc, onNavigateToDoc]
  );

  const isAllInOne = activeDocId === ALL_DOCS_ID;

  const combinedMarkdown = useMemo(() => {
    return buildCombinedMarkdown(project, documents);
  }, [project, documents]);

  const combinedDoc: DocumentRecord = useMemo(
    () => ({
      id: ALL_DOCS_ID,
      project_id: project.id,
      doc_type: 'index' as DocumentType,
      title: `${project.display_name} - Complete Solution Handbook`,
      slug: 'complete-solution-handbook',
      content_markdown: combinedMarkdown,
    }),
    [project.id, project.display_name, combinedMarkdown]
  );

  const activeDoc = isAllInOne
    ? combinedDoc
    : documents.find((d) => d.id === activeDocId) || documents[0];

  const [hasCopiedMarkdown, setHasCopiedMarkdown] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handleCopyCombinedMarkdown = useCallback(() => {
    navigator.clipboard.writeText(combinedMarkdown);
    setHasCopiedMarkdown(true);
    setTimeout(() => setHasCopiedMarkdown(false), 2000);
  }, [combinedMarkdown]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setShowBackToTop(scrollTop > 450);
  };

  const scrollToTop = () => {
    contentPaneRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAllInOne) {
      document.title = `${project.display_name} - Complete Solution Handbook | pp-pedia`;
    } else if (activeDoc) {
      document.title = `${activeDoc.title} | ${project.display_name} | pp-pedia`;
    }
  }, [isAllInOne, activeDoc?.title, project.display_name]);

  const [showAgentMetadata, setShowAgentMetadata] = useState(false);

  useEffect(() => {
    setShowAgentMetadata(false);
  }, [activeDoc?.id]);

  const rawFrontmatter = useMemo(() => {
    if (!activeDoc?.content_markdown) return null;
    const match = activeDoc.content_markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return match ? match[1].trim() : null;
  }, [activeDoc?.content_markdown]);

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
    setCollapsedCategories(new Set(['business_rules', 'security_roles', 'flows', 'canvas_apps', 'other']));
  };

  const getDocIcon = (type: DocumentType) => {
    switch (type) {
      case 'overview':
        return <Layers className="w-4 h-4 text-indigo-400 flex-shrink-0" />;
      case 'dataverse':
        return <Database className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
      case 'business_rule':
        return <Scale className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
      case 'security_role':
        return <Shield className="w-4 h-4 text-amber-400 flex-shrink-0" />;
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
    const brDocs = filteredDocs.filter((d) => d.doc_type === 'business_rule');
    const roleDocs = filteredDocs.filter((d) => d.doc_type === 'security_role');
    const flowDocs = filteredDocs.filter((d) => d.doc_type === 'flow');
    const appDocs = filteredDocs.filter((d) => d.doc_type === 'canvas_app');
    const envDocs = filteredDocs.filter((d) => d.doc_type === 'env_vars');
    const otherDocs = filteredDocs.filter(
      (d) => !['overview', 'dataverse', 'business_rule', 'security_role', 'flow', 'canvas_app', 'env_vars'].includes(d.doc_type)
    );

    return {
      standalone: [...overviewDocs, ...dataverseDocs, ...envDocs],
      folders: [
        {
          id: 'business_rules',
          name: 'Business Rules',
          icon: <Scale className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
          docs: brDocs,
          totalCount: documents.filter((d) => d.doc_type === 'business_rule').length,
        },
        {
          id: 'security_roles',
          name: 'Security Roles',
          icon: <Shield className="w-4 h-4 text-amber-400 flex-shrink-0" />,
          docs: roleDocs,
          totalCount: documents.filter((d) => d.doc_type === 'security_role').length,
        },
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
            (d) => !['overview', 'dataverse', 'business_rule', 'security_role', 'flow', 'canvas_app', 'env_vars'].includes(d.doc_type)
          ).length,
        },
      ].filter((f) => f.docs.length > 0),
    };
  }, [filteredDocs, documents]);

  return (
    <div className="flex h-[calc(100vh-65px)] w-full overflow-hidden bg-slate-950 text-slate-100 relative">
      {/* Sidebar navigation */}
      {isSidebarOpen && (
        <div className="w-80 flex-shrink-0 border-r border-slate-800/80 bg-slate-900/40 flex flex-col backdrop-blur-sm h-full">
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
          {/* Featured All-in-One Documentation Page for Sidebar AIs */}
          <div className="mb-2">
            <button
              onClick={() => onSelectDoc(ALL_DOCS_ID)}
              className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left transition group relative overflow-hidden border ${
                isAllInOne
                  ? 'bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-slate-900 text-indigo-200 border-indigo-500/60 shadow-md shadow-indigo-950/50'
                  : 'bg-slate-950/40 hover:bg-slate-800/60 text-slate-300 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div
                className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${
                  isAllInOne
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 text-indigo-400 group-hover:bg-slate-700'
                }`}
              >
                <BookOpenCheck className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold truncate text-slate-100 group-hover:text-white">
                    Full Solution Handbook
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    AI Ready
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                  Consolidated DOM for Copilot &amp; Sidebar AIs
                </p>
              </div>
            </button>
          </div>

          <div className="w-full h-px bg-slate-800/70 my-2" />

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
                          : doc.doc_type === 'business_rule'
                          ? doc.title.replace(/^Business Rule:\s*/i, '')
                          : doc.doc_type === 'security_role'
                          ? doc.title.replace(/^Security Role:\s*/i, '')
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
      )}

      {/* Main markdown content column */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden">
        {/* Top Doc Toolbar */}
        <div className="h-11 px-4 lg:px-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-sm flex items-center justify-between flex-shrink-0 text-xs text-slate-400 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Toggle left sidebar button */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition flex-shrink-0"
              title={isSidebarOpen ? 'Hide Navigation Sidebar' : 'Show Navigation Sidebar'}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeft className="w-4 h-4 text-indigo-400" />
              )}
            </button>

            {/* Breadcrumb trail */}
            <div className="flex items-center gap-1.5 truncate text-[11px] sm:text-xs">
              <span className="text-slate-400 font-medium truncate max-w-[120px] sm:max-w-[180px]">
                {project.display_name}
              </span>
              <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
              <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold flex-shrink-0">
                {isAllInOne
                  ? 'Handbook'
                  : activeDoc?.doc_type === 'flow'
                  ? 'Cloud Flows'
                  : activeDoc?.doc_type === 'canvas_app'
                  ? 'Canvas Apps'
                  : activeDoc?.doc_type === 'dataverse'
                  ? 'Dataverse'
                  : activeDoc?.doc_type === 'business_rule'
                  ? 'Business Rules'
                  : activeDoc?.doc_type === 'security_role'
                  ? 'Security Roles'
                  : 'Architecture'}
              </span>
              {activeDoc && (
                <>
                  <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                  <span className="text-slate-200 font-semibold truncate max-w-[150px] sm:max-w-[260px]">
                    {activeDoc.title}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* View Agent Metadata Toggle Button */}
            {rawFrontmatter && (
              <button
                type="button"
                onClick={() => setShowAgentMetadata((prev) => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition border ${
                  showAgentMetadata
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50'
                    : 'text-slate-400 hover:text-slate-200 border-slate-700/60 hover:bg-slate-800/60'
                }`}
                title={showAgentMetadata ? 'Hide Agent Metadata' : 'View Hidden Agent Metadata'}
              >
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Agent Meta</span>
              </button>
            )}

            {/* AI Chat Assistant Toggle Button */}
            <button
              type="button"
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-sm ${
                isChatOpen
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
              title={isChatOpen ? 'Hide PP AI Sidepanel' : 'Open PP AI Sidepanel'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="font-medium">
                {isChatOpen ? 'PP AI' : 'Ask PP AI'}
              </span>
              {isChatOpen ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ) : (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/40 text-indigo-100 font-mono hidden sm:inline">
                  AI
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Scrollable markdown body */}
        <div
          ref={contentPaneRef}
          onScroll={handleScroll}
          className="flex-1 h-full overflow-y-auto p-6 sm:p-8 lg:p-12 relative"
        >
          <div className="max-w-4xl mx-auto">
            {activeDoc ? (
              <article className="prose prose-invert prose-slate max-w-none">
                {isAllInOne && (
                  <div className="not-prose mb-8 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900/90 to-purple-950/30 p-5 shadow-xl backdrop-blur-md">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 flex-shrink-0">
                          <Sparkles className="w-5 h-5 text-indigo-100" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white tracking-tight">
                              Consolidated Solution Handbook
                            </h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Sidebar AI Ready
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            All {documents.length} modules loaded into a single page. Open your browser's AI sidebar (Edge Copilot, Chrome AI) to query this solution.
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                        <button
                          type="button"
                          onClick={handleCopyCombinedMarkdown}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border shadow-sm ${
                            hasCopiedMarkdown
                              ? 'bg-emerald-600 text-white border-emerald-500'
                              : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700/80 hover:text-white'
                          }`}
                          title="Copy full combined markdown to clipboard"
                        >
                          {hasCopiedMarkdown ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-white" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Copy Markdown</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => exportDocsAsSingleMarkdown(project, documents)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:text-white transition shadow-sm"
                          title="Export consolidated markdown file"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Export .md</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:text-white transition shadow-sm"
                          title="Print or save as PDF"
                        >
                          <Printer className="w-3.5 h-3.5 text-sky-400" />
                          <span>Print / PDF</span>
                        </button>
                      </div>
                    </div>

                    {/* Tips for Copilot / Browser AI */}
                    <div className="mt-3.5 pt-1 text-[11px] text-slate-400 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                      <span className="font-semibold text-slate-300 flex items-center gap-1">
                        <Bot className="w-3.5 h-3.5 text-indigo-400" />
                        Sample Copilot prompts:
                      </span>
                      <span className="text-slate-400 font-mono text-[10px] bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800 truncate">
                        "Summarize all cloud flows and their triggers in this solution."
                      </span>
                    </div>
                  </div>
                )}
                {rawFrontmatter && (
                  <div
                    className="sr-only"
                    aria-hidden="true"
                    data-testid="doc-agent-metadata"
                  >
                    {rawFrontmatter}
                  </div>
                )}

                {showAgentMetadata && rawFrontmatter && (
                  <div className="not-prose mb-6 rounded-xl border border-indigo-500/30 bg-slate-900/90 p-4 shadow-lg backdrop-blur-sm">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs font-semibold text-indigo-300">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-indigo-400" />
                        <span>Background Agent Metadata (Hidden from Document)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAgentMetadata(false)}
                        className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded hover:bg-slate-800 transition"
                      >
                        Hide
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 overflow-x-auto whitespace-pre-wrap">
                      {rawFrontmatter}
                    </pre>
                  </div>
                )}

                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkFrontmatter]}
                  components={{
                    pre({ children }: any) {
                      return <>{children}</>;
                    },
                    a({ href, children, ...props }: any) {
                      const isInternal = href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:');
                      return (
                        <a
                          href={href}
                          onClick={(e) => {
                            if (isInternal) {
                              e.preventDefault();
                              const cleanSlug = href.replace(/^[#/]+/, '');
                              if (!cleanSlug) return;

                              // Check if target anchor exists in current DOM
                              const targetEl =
                                document.getElementById(cleanSlug) ||
                                document.getElementById(`doc-${cleanSlug}`);
                              if (targetEl) {
                                targetEl.scrollIntoView({ behavior: 'smooth' });
                                return;
                              }

                              // Otherwise find document matching slug/id and switch
                              const targetDoc = documents.find(
                                (d) => d.slug === cleanSlug || d.id === cleanSlug
                              );
                              if (targetDoc) {
                                onSelectDoc(targetDoc.id);
                              }
                            }
                          }}
                          target={isInternal ? undefined : '_blank'}
                          rel={isInternal ? undefined : 'noopener noreferrer'}
                          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition cursor-pointer font-medium"
                          {...props}
                        >
                          {children}
                        </a>
                      );
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
                      const anchor = slugifyTitle(getNodeText(children));
                      return (
                        <h1 id={anchor || undefined} className="text-2xl lg:text-3xl font-bold tracking-tight text-white mb-4 border-b border-slate-800 pb-3 scroll-mt-14">
                          {children}
                        </h1>
                      );
                    },
                    h2({ children }: any) {
                      const anchor = slugifyTitle(getNodeText(children));
                      return (
                        <h2 id={anchor || undefined} className="text-xl font-bold tracking-tight text-slate-100 mt-8 mb-3 border-b border-slate-800/60 pb-2 flex items-center gap-2 scroll-mt-14">
                          {children}
                        </h2>
                      );
                    },
                    h3({ children }: any) {
                      const anchor = slugifyTitle(getNodeText(children));
                      return (
                        <h3 id={anchor || undefined} className="text-base font-semibold text-slate-200 mt-6 mb-2 scroll-mt-14">
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
            {showBackToTop && (
              <button
                type="button"
                onClick={scrollToTop}
                className="fixed bottom-6 right-8 lg:right-12 z-30 p-2.5 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/60 backdrop-blur-sm transition-all duration-200 hover:scale-105 border border-indigo-400/40 flex items-center gap-1.5 text-xs font-medium"
                title="Scroll back to top"
              >
                <ArrowUp className="w-4 h-4" />
                <span className="hidden sm:inline">Top</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Drag handle divider when chat is open */}
      {isChatOpen && (
        <div
          onMouseDown={() => setIsDragging(true)}
          className={`w-1.5 hover:w-2 -ml-1 h-full cursor-col-resize z-20 group relative transition-all duration-150 flex items-center justify-center select-none ${
            isDragging ? 'bg-indigo-500 w-2' : 'hover:bg-indigo-500/60 bg-slate-800/80'
          }`}
          title="Drag to resize PP AI Sidepanel"
        >
          <div className="w-0.5 h-8 bg-slate-500 rounded group-hover:bg-indigo-300 transition-colors" />
        </div>
      )}

      {/* Right PP AI Sidepanel */}
      {isChatOpen && (
        <aside
          style={{ width: `${chatPanelWidth}px` }}
          className="flex-shrink-0 border-l border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex flex-col h-full overflow-hidden z-10 animate-in slide-in-from-right duration-200"
          aria-label="PP AI Assistant"
        >
          <ChatAssistant
            isSidepanel={true}
            projects={projects && projects.length > 0 ? projects : [project]}
            activeProjectId={project.id}
            activeDocTitle={activeDoc?.title}
            onSelectProject={onSelectProject || (() => {})}
            onNavigateToDoc={handleChatNavigateToDoc}
            onClose={() => setIsChatOpen(false)}
            onExpandToFull={onExpandToFullChat}
            messages={chatMessages}
            setMessages={setChatMessages}
          />
        </aside>
      )}
    </div>
  );
};

