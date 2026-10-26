import React, { useState } from 'react';
import {
  BookOpen20Regular,
  Chat20Regular,
  Delete20Regular,
  ArrowDownload20Regular,
  Database20Regular,
  Flow20Regular,
  AppGeneric20Regular,
  SlideSettings20Regular,
  Layer20Regular,
  FolderZip20Regular,
  DocumentText20Regular,
  Code20Regular,
} from '@fluentui/react-icons';
import { Button, Badge, Tooltip } from '@fluentui/react-components';
import { ProjectRecord } from '../../types/db';
import { UploadZone } from './UploadZone';
import {
  exportDocsAsZip,
  exportDocsAsSingleMarkdown,
  exportAstJson,
} from '../../services/exporter';
import { getDocuments } from '../../services/db';

interface DashboardProps {
  projects: ProjectRecord[];
  onSelectProjectForDocs: (id: string) => void;
  onSelectProjectForChat: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onUploadFile: (file: File | Blob) => void;
  isProcessing?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  projects,
  onSelectProjectForDocs,
  onSelectProjectForChat,
  onDeleteProject,
  onUploadFile,
  isProcessing = false,
}) => {
  const [activeExportMenu, setActiveExportMenu] = useState<string | null>(null);

  const handleExport = async (project: ProjectRecord, format: 'zip' | 'md' | 'json') => {
    setActiveExportMenu(null);
    if (format === 'json') {
      exportAstJson(project);
      return;
    }

    const docs = await getDocuments(project.id);
    if (format === 'zip') {
      exportDocsAsZip(project, docs);
    } else if (format === 'md') {
      exportDocsAsSingleMarkdown(project, docs);
    }
  };

  return (
    <div className="h-[calc(100vh-65px)] overflow-y-auto p-6 lg:p-10 bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Hero & Ingestion Zone */}
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Solution Repositories
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Parse Power Platform packages, explore generated technical architecture, and query with local vector RAG.
              </p>
            </div>
          </div>

          <UploadZone onFileSelected={onUploadFile} isProcessing={isProcessing} />
        </div>

        {/* Existing Projects Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
              <Layer20Regular className="w-4 h-4 text-purple-400" />
              Ingested Solutions ({projects.length})
            </h2>
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20">
              <Layer20Regular className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-300">No solutions ingested yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Upload your solution archive above or click "Load Sample Solution" to explore instantly with sample Dataverse tables and flows.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col justify-between hover:border-purple-600/50 transition shadow-lg group relative"
                >
                  <div>
                    {/* Top line: managed badge & version */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <Badge
                        appearance="tint"
                        color={proj.is_managed ? 'brand' : 'warning'}
                        size="small"
                      >
                        {proj.is_managed ? 'Managed' : 'Unmanaged'}
                      </Badge>
                      <span className="text-[11px] font-mono text-slate-400">
                        v{proj.version}
                      </span>
                    </div>

                    {/* Title */}
                    <h3
                      className="text-base font-semibold text-slate-100 group-hover:text-purple-300 transition truncate"
                      title={proj.display_name}
                    >
                      {proj.display_name}
                    </h3>
                    <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">
                      {proj.unique_name}
                    </p>

                    {/* Description */}
                    <p className="text-xs text-slate-400 mt-3 line-clamp-2 leading-relaxed min-h-[32px]">
                      {proj.description || 'No description provided.'}
                    </p>

                    {/* Component Metrics Badges */}
                    <div className="grid grid-cols-2 gap-2 my-4 pt-3 border-t border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-850">
                        <Database20Regular className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{proj.stats?.entity_count ?? 0} Tables</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-850">
                        <Flow20Regular className="w-3.5 h-3.5 text-sky-400" />
                        <span>{proj.stats?.flow_count ?? 0} Flows</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-850">
                        <AppGeneric20Regular className="w-3.5 h-3.5 text-purple-400" />
                        <span>{proj.stats?.canvas_app_count ?? 0} Apps</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-850">
                        <SlideSettings20Regular className="w-3.5 h-3.5 text-amber-400" />
                        <span>{proj.stats?.env_var_count ?? 0} Vars</span>
                      </div>
                      {((proj.stats?.web_resource_count ?? 0) > 0 || (proj.ast_json?.web_resources?.length ?? 0) > 0) && (
                        <div className="col-span-2 flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-850">
                          <Code20Regular className="w-3.5 h-3.5 text-teal-400" />
                          <span>{proj.stats?.web_resource_count ?? proj.ast_json?.web_resources?.length ?? 0} Web Resources / Scripts</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        appearance="primary"
                        size="small"
                        icon={<BookOpen20Regular />}
                        onClick={() => onSelectProjectForDocs(proj.id)}
                      >
                        Docs
                      </Button>

                      <Button
                        appearance="secondary"
                        size="small"
                        icon={<Chat20Regular className="text-purple-400" />}
                        onClick={() => onSelectProjectForChat(proj.id)}
                      >
                        PP AI
                      </Button>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Export button with popover */}
                      <div className="relative">
                        <Tooltip content="Export documentation" relationship="label">
                          <Button
                            appearance="subtle"
                            size="small"
                            icon={<ArrowDownload20Regular />}
                            onClick={() =>
                              setActiveExportMenu(
                                activeExportMenu === proj.id ? null : proj.id
                              )
                            }
                          />
                        </Tooltip>

                        {activeExportMenu === proj.id && (
                          <div className="absolute right-0 bottom-full mb-1 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-30">
                            <button
                              onClick={() => handleExport(proj, 'zip')}
                              className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                            >
                              <FolderZip20Regular className="w-3.5 h-3.5 text-amber-400" />
                              <span>ZIP Bundle</span>
                            </button>
                            <button
                              onClick={() => handleExport(proj, 'md')}
                              className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                            >
                              <DocumentText20Regular className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Consolidated MD</span>
                            </button>
                            <button
                              onClick={() => handleExport(proj, 'json')}
                              className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                            >
                              <Code20Regular className="w-3.5 h-3.5 text-sky-400" />
                              <span>AST JSON</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Delete */}
                      <Tooltip content="Delete Solution" relationship="label">
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<Delete20Regular className="text-rose-400" />}
                          onClick={() => {
                            if (
                              confirm(
                                `Are you sure you want to delete ${proj.display_name}? This will remove all associated documents and vector embeddings from PGlite.`
                              )
                            ) {
                              onDeleteProject(proj.id);
                            }
                          }}
                        />
                      </Tooltip>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
