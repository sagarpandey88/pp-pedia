import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Layers,
  Search,
  BookOpen,
  Loader2,
  Trash2,
  ChevronDown,
  Copy,
  Check,
  Zap,
  X,
  Maximize2,
  PanelRightOpen,
} from 'lucide-react';
import { ProjectRecord, SimilarityResult } from '../../types/db';
import { TokenUsage } from '../../types/solution';
import { askRAGAssistant, ChatMessage } from '../../services/rag/ragService';
import { AgentActivityStep } from '../../services/agent/agentTypes';
import { CitationCard } from './CitationCard';
import { AgentActivityTrail } from './AgentActivityTrail';
import { MermaidDiagram } from '../reader/MermaidDiagram';

const ChatCodeBlock: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const codeText = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy code:', e);
    }
  };

  return (
    <div className="relative my-3 rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-md">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400">
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition text-[11px]"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs font-mono text-slate-200 leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
};

const ChatMessageContent: React.FC<{
  content: string;
  role: 'user' | 'assistant' | 'system';
}> = ({ content, role }) => {
  if (role === 'user') {
    return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{content}</div>;
  }

  return (
    <div className="text-sm leading-relaxed text-slate-200 break-words">
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

            const isBlock = Boolean(match) || (typeof children === 'string' && children.includes('\n'));

            if (isBlock && lang === 'mermaid') {
              return <MermaidDiagram chart={codeText} />;
            }

            if (isBlock) {
              return <ChatCodeBlock className={className}>{children}</ChatCodeBlock>;
            }

            return (
              <code
                className="px-1.5 py-0.5 rounded-md bg-slate-800/90 text-indigo-300 font-mono text-xs border border-slate-700/60 font-medium"
                {...props}
              >
                {children}
              </code>
            );
          },
          h1({ children }: any) {
            return (
              <h1 className="text-lg font-bold tracking-tight text-white mt-4 mb-2 pb-1.5 border-b border-slate-800 flex items-center gap-2">
                {children}
              </h1>
            );
          },
          h2({ children }: any) {
            return (
              <h2 className="text-base font-bold tracking-tight text-slate-100 mt-4 mb-2 pb-1 border-b border-slate-800/60 flex items-center gap-2">
                {children}
              </h2>
            );
          },
          h3({ children }: any) {
            return (
              <h3 className="text-sm font-semibold text-indigo-300 mt-3 mb-1.5">
                {children}
              </h3>
            );
          },
          h4({ children }: any) {
            return (
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mt-2.5 mb-1">
                {children}
              </h4>
            );
          },
          p({ children }: any) {
            return <p className="text-slate-200 text-sm leading-relaxed my-2.5 first:mt-0 last:mb-0">{children}</p>;
          },
          ul({ children }: any) {
            return <ul className="list-disc pl-5 space-y-1.5 my-2 text-sm text-slate-300">{children}</ul>;
          },
          ol({ children }: any) {
            return <ol className="list-decimal pl-5 space-y-1.5 my-2 text-sm text-slate-300">{children}</ol>;
          },
          li({ children }: any) {
            return <li className="leading-relaxed text-slate-300 pl-1">{children}</li>;
          },
          table({ children }: any) {
            return (
              <div className="my-3.5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 shadow-md">
                <table className="w-full text-left text-xs text-slate-200 border-collapse">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }: any) {
            return <thead className="bg-slate-850/90 text-slate-200 border-b border-slate-800 font-semibold">{children}</thead>;
          },
          th({ children }: any) {
            return <th className="px-3.5 py-2.5 font-semibold text-slate-200">{children}</th>;
          },
          td({ children }: any) {
            return <td className="px-3.5 py-2 border-b border-slate-800/60 text-slate-300">{children}</td>;
          },
          blockquote({ children }: any) {
            return (
              <blockquote className="my-3 border-l-3 border-indigo-500 bg-indigo-950/20 px-3.5 py-2.5 rounded-r-lg text-slate-300 italic text-sm">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="my-3.5 border-slate-800" />;
          },
          strong({ children }: any) {
            return <strong className="font-semibold text-slate-100">{children}</strong>;
          },
          a({ href, children }: any) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

interface CollapsibleCitationsProps {
  citations: SimilarityResult[];
  onSelectCitation: (citation: SimilarityResult) => void;
}

const CollapsibleCitations: React.FC<CollapsibleCitationsProps> = ({
  citations,
  onSelectCitation,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-4 pt-3 border-t border-slate-800/80">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center justify-between py-1 transition group select-none rounded focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-300 transition" />
          <span>Source Citations ({citations.length})</span>
        </span>
        <span className="flex items-center gap-1 text-[11px] font-normal text-slate-500 group-hover:text-slate-300">
          <span>{isOpen ? 'Hide' : 'Show'}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-400' : ''
            }`}
          />
        </span>
      </button>

      {isOpen && (
        <div className="space-y-2 mt-2 pt-1 animate-in fade-in duration-200">
          {citations.map((cit, idx) => (
            <CitationCard
              key={cit.id || idx}
              citation={cit}
              index={idx + 1}
              onSelectCitation={onSelectCitation}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export interface ChatAssistantProps {
  projects: ProjectRecord[];
  activeProjectId?: string;
  onSelectProject: (id: string | undefined) => void;
  onNavigateToDoc: (projectId: string, docSlug: string) => void;
  isSidepanel?: boolean;
  onClose?: () => void;
  onExpandToFull?: () => void;
  onDockToReader?: () => void;
  activeDocTitle?: string;
  messages?: ChatMessage[];
  setMessages?: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onNavigateToDoc,
  isSidepanel = false,
  onClose,
  onExpandToFull,
  onDockToReader,
  activeDocTitle,
  messages: controlledMessages,
  setMessages: controlledSetMessages,
}) => {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const messages = controlledMessages ?? internalMessages;
  const setMessages = controlledSetMessages ?? setInternalMessages;

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [liveSteps, setLiveSteps] = useState<AgentActivityStep[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, liveSteps]);

  const quickQuestions = React.useMemo(() => {
    const list: string[] = [];
    if (activeDocTitle) {
      list.push(`Explain the architecture and purpose of "${activeDocTitle}".`);
      list.push(`What are the key dependencies and connections in "${activeDocTitle}"?`);
    }
    list.push('What Dataverse tables and relationships exist in this solution?');
    list.push('Explain the trigger and logic of the Cloud Flows.');
    if (!activeDocTitle) {
      list.push('Inspect the schema and columns of the primary entities.');
      list.push('Read the solution overview documentation and summarize ALM details.');
    }
    return list;
  }, [activeDocTitle]);

  const handleSend = async (queryText?: string) => {
    const text = (queryText || inputQuery).trim();
    if (!text || isLoading) return;

    setInputQuery('');
    setLiveSteps([]);
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await askRAGAssistant(
        text,
        activeProjectId,
        10,
        messages,
        (steps) => setLiveSteps([...steps])
      );
      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: response.content,
        citations: response.citations,
        steps: response.steps || liveSteps,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        usage: response.usage,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Sorry, an error occurred during agent execution: ${err?.message || err}`,
        steps: liveSteps,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setLiveSteps([]);
    }
  };

  const handleSelectCitation = (cit: SimilarityResult) => {
    onNavigateToDoc(cit.project_id, cit.slug);
  };

  const sessionTokens = messages.reduce(
    (acc, msg) => {
      if (msg.usage) {
        acc.promptTokens += msg.usage.promptTokens;
        acc.completionTokens += msg.usage.completionTokens;
        acc.totalTokens += msg.usage.totalTokens;
        acc.requests = (acc.requests || 0) + (msg.usage.requests || 1);
      }
      return acc;
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 } as TokenUsage
  );

  return (
    <div
      className={`flex flex-col w-full bg-slate-950 text-slate-100 ${
        isSidepanel ? 'h-full' : 'h-[calc(100vh-65px)]'
      }`}
    >
      {/* Top Header / Bar */}
      {isSidepanel ? (
        <div className="flex flex-col border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex-shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5 truncate">
                  <span>PP AI</span>
                  {sessionTokens.totalTokens > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 border border-indigo-500/30 text-indigo-300 font-mono flex items-center gap-0.5"
                      title={`LLM Session: ${sessionTokens.totalTokens.toLocaleString()} tokens (${sessionTokens.promptTokens.toLocaleString()} in / ${sessionTokens.completionTokens.toLocaleString()} out)`}
                    >
                      <Zap className="w-2.5 h-2.5 text-indigo-400" />
                      {sessionTokens.totalTokens.toLocaleString()}
                    </span>
                  )}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                  title="Clear conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {onExpandToFull && (
                <button
                  type="button"
                  onClick={onExpandToFull}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition"
                  title="Expand to Full Page Chat"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                  title="Close chat sidepanel"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Sub-bar: Scope and active context */}
          <div className="px-3.5 py-1.5 bg-slate-950/40 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Layers className="w-3 h-3 text-slate-500 flex-shrink-0" />
              <span className="text-[10px] text-slate-500 font-medium">Scope:</span>
              <select
                value={activeProjectId || ''}
                onChange={(e) => onSelectProject(e.target.value || undefined)}
                className="bg-transparent text-[11px] text-slate-300 font-medium focus:outline-none cursor-pointer truncate max-w-[160px]"
              >
                <option value="" className="bg-slate-900 text-slate-200">
                  All Solutions
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>

            {activeDocTitle && (
              <span
                className="text-[10px] text-indigo-300 bg-indigo-950/70 border border-indigo-500/25 px-1.5 py-0.5 rounded truncate max-w-[130px] font-mono flex-shrink-0"
                title={`Active Document Context: ${activeDocTitle}`}
              >
                Doc: {activeDocTitle}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                PP AI
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">
                  OpenAI Agent SDK • Multi-Tool
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Autonomous reasoning with IndexedDB markdown reader, AST inspector, and PGlite semantic search
              </p>
            </div>
          </div>

          {/* Project scope dropdown and session metrics */}
          <div className="flex items-center gap-3">
            {sessionTokens.totalTokens > 0 && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs shadow-sm transition-all"
                title={`LLM Session Usage: ${sessionTokens.totalTokens.toLocaleString()} total tokens (${sessionTokens.promptTokens.toLocaleString()} prompt · ${sessionTokens.completionTokens.toLocaleString()} completion across ${sessionTokens.requests || 1} API turns)`}
              >
                <Zap className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-white font-mono">
                  {sessionTokens.totalTokens.toLocaleString()}
                </span>
                <span className="text-[11px] text-indigo-300/80">tokens</span>
                <span className="text-[10px] text-slate-400 hidden md:inline border-l border-slate-700/80 pl-1.5 ml-0.5 font-mono">
                  {sessionTokens.promptTokens.toLocaleString()} in / {sessionTokens.completionTokens.toLocaleString()} out
                </span>
              </div>
            )}

            {onDockToReader && (
              <button
                type="button"
                onClick={onDockToReader}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700/80 text-xs text-slate-200 transition"
                title="Dock Chat as Sidepanel in Documentation view"
              >
                <PanelRightOpen className="w-3.5 h-3.5 text-indigo-400" />
                <span>Dock to Docs</span>
              </button>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Scope:</span>
            </div>
            <select
              value={activeProjectId || ''}
              onChange={(e) => onSelectProject(e.target.value || undefined)}
              className="px-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Solutions (Cross-Project Search)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} (v{p.version})
                </option>
              ))}
            </select>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition"
                title="Clear conversation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className={`flex-1 overflow-y-auto ${isSidepanel ? 'p-3.5 space-y-4' : 'p-6 space-y-6'}`}>
        {messages.length === 0 ? (
          <div className={`mx-auto text-center ${isSidepanel ? 'max-w-md py-6 px-2' : 'max-w-2xl py-12'}`}>
            <div
              className={`rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center mx-auto mb-3 text-indigo-400 ${
                isSidepanel ? 'w-10 h-10' : 'w-14 h-14 mb-4'
              }`}
            >
              <Sparkles className={isSidepanel ? 'w-5 h-5' : 'w-7 h-7'} />
            </div>
            <h3 className={`font-bold text-slate-100 ${isSidepanel ? 'text-sm' : 'text-lg'}`}>
              Ask anything about your Power Platform Solutions
            </h3>
            <p className={`text-slate-400 mt-1.5 mx-auto ${isSidepanel ? 'text-xs max-w-xs' : 'text-sm max-w-md mt-2'}`}>
              {isSidepanel
                ? 'Vector RAG search and AI agent tools across Dataverse, Cloud Flows, and Canvas Apps.'
                : 'Answers are retrieved using in-browser dense vector similarity search over parsed Dataverse tables, Cloud Flows, and Canvas Apps.'}
            </p>

            <div className={`text-left ${isSidepanel ? 'mt-5' : 'mt-8'}`}>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 text-center">
                Suggested Prompts
              </div>
              <div className={`grid gap-2 ${isSidepanel ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 gap-2.5'}`}>
                {quickQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(q)}
                    className={`text-left rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-850 hover:border-indigo-500/40 text-xs text-slate-300 hover:text-white transition flex items-start gap-2.5 ${
                      isSidepanel ? 'p-2.5 text-[11px]' : 'p-3'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={`${isSidepanel ? 'w-full space-y-3.5' : 'max-w-4xl mx-auto space-y-6'}`}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 sm:gap-3.5 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role !== 'user' && (
                  <div
                    className={`rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isSidepanel ? 'w-7 h-7' : 'w-8 h-8'
                    }`}
                  >
                    {msg.role === 'system' ? (
                      <Sparkles className={isSidepanel ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                    ) : (
                      <Bot className={isSidepanel ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                    )}
                  </div>
                )}

                <div
                  className={`rounded-2xl shadow-sm overflow-hidden ${
                    isSidepanel
                      ? 'p-3 text-xs leading-relaxed max-w-[90%] sm:max-w-[85%]'
                      : 'p-4 sm:p-4.5 text-sm max-w-3xl'
                  } ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-900/90 border border-slate-800/90 text-slate-200 rounded-tl-none w-full'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2 text-[10px] sm:text-[11px] opacity-75">
                    <span className="font-semibold truncate">
                      {msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'pp-pedia Agent'}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {msg.usage && msg.usage.totalTokens > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-500/25 text-indigo-300 text-[9px] sm:text-[10px] font-mono flex items-center gap-1"
                          title={`Prompt: ${msg.usage.promptTokens.toLocaleString()} · Completion: ${msg.usage.completionTokens.toLocaleString()}`}
                        >
                          <Zap className="w-2.5 h-2.5 text-indigo-400" />
                          <span>{msg.usage.totalTokens.toLocaleString()}</span>
                        </span>
                      )}
                      <span className="font-mono text-[9px] sm:text-[10px]">{msg.timestamp}</span>
                    </div>
                  </div>

                  {msg.steps && msg.steps.length > 0 && (
                    <AgentActivityTrail steps={msg.steps} />
                  )}

                  <ChatMessageContent content={msg.content} role={msg.role} />

                  {/* Citations section */}
                  {msg.citations && msg.citations.length > 0 && (
                    <CollapsibleCitations
                      citations={msg.citations}
                      onSelectCitation={handleSelectCitation}
                    />
                  )}
                </div>

                {msg.role === 'user' && (
                  <div
                    className={`rounded-lg bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isSidepanel ? 'w-7 h-7' : 'w-8 h-8'
                    }`}
                  >
                    <User className={isSidepanel ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start gap-2.5 sm:gap-3.5 justify-start">
                <div
                  className={`rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isSidepanel ? 'w-7 h-7' : 'w-8 h-8'
                  }`}
                >
                  <Bot className={isSidepanel ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                </div>
                <div className={`flex-1 min-w-0 ${isSidepanel ? 'max-w-full' : 'max-w-3xl'}`}>
                  {liveSteps.length > 0 ? (
                    <AgentActivityTrail steps={liveSteps} isLive={true} />
                  ) : (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-3.5 text-xs text-slate-400 flex items-center gap-2.5">
                      <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" />
                      <span className="truncate">Agent reasoning & planning tool execution...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Query input area */}
      <div
        className={`border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-sm flex-shrink-0 ${
          isSidepanel ? 'p-2.5 sm:p-3' : 'p-4'
        }`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className={`mx-auto flex items-center gap-2 ${isSidepanel ? 'w-full' : 'max-w-4xl'}`}
        >
          <input
            type="text"
            placeholder={
              activeDocTitle
                ? `Ask about ${activeDocTitle}...`
                : activeProject
                ? `Ask about ${activeProject.display_name}...`
                : 'Ask a question across all solutions...'
            }
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={isLoading}
            className={`flex-1 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner ${
              isSidepanel ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'
            }`}
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className={`bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-xl font-medium flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20 flex-shrink-0 ${
              isSidepanel ? 'px-3.5 py-2 text-xs' : 'px-5 py-3 text-sm'
            }`}
          >
            {isLoading ? (
              <Loader2 className={isSidepanel ? 'w-3.5 h-3.5 animate-spin' : 'w-4 h-4 animate-spin'} />
            ) : (
              <Send className={isSidepanel ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            )}
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

