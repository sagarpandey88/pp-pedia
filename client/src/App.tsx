import React, { useState, useEffect, useCallback } from 'react';
import { Header, AppView } from './components/common/Header';
import { Dashboard } from './components/dashboard/Dashboard';
import { MarkdownReader } from './components/reader/MarkdownReader';
import { ChatAssistant } from './components/chat/ChatAssistant';
import { SettingsModal } from './components/settings/SettingsModal';
import {
  IngestionProgressModal,
  IngestionStep,
} from './components/ingestion/IngestionProgressModal';
import {
  getProjects,
  getDocuments,
  saveProject,
  saveDocuments,
  saveChunks,
  saveFullProjectIngestion,
  deleteProject,
} from './services/db';
import { unpackAndParseSolution } from './services/parser/solutionParser';
import { generateDocumentationSuite, getAISettings } from './services/generator/docGenerator';
import { chunkMarkdown } from './services/chunker';
import { embedBatch, initEmbeddings } from './services/embeddingService';
import { ProjectRecord, DocumentRecord, ChunkRecord } from './types/db';
import { TokenUsage } from './types/solution';

export function App() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(undefined);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Ingestion modal state
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionStatusText, setIngestionStatusText] = useState('');
  const [ingestionProgress, setIngestionProgress] = useState(0);
  const [ingestionTokenUsage, setIngestionTokenUsage] = useState<TokenUsage | undefined>();
  const [ingestionError, setIngestionError] = useState<string | null>(null);
  const [ingestionSteps, setIngestionSteps] = useState<IngestionStep[]>([
    { id: 'unpack', label: '1. Unpack & Parse Solution XML/JSON', status: 'pending' },
    { id: 'docs', label: '2. Generate Architecture & Developer Documentation', status: 'pending' },
    { id: 'chunk', label: '3. Semantic Markdown Chunking & Heading Hierarchy', status: 'pending' },
    { id: 'embed', label: '4. Web Worker Dense Vectorization (bge-small-en-v1.5)', status: 'pending' },
    { id: 'db', label: '5. Persist to PGlite (IndexedDB + pgvector)', status: 'pending' },
  ]);

  const checkApiKey = useCallback(() => {
    const s = getAISettings();
    setHasApiKey(Boolean(s.apiKey && s.apiKey.length > 5));
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const projs = await getProjects();
      setProjects(projs);
      if (projs.length > 0 && !activeProjectId) {
        setActiveProjectId(projs[0].id);
      }
    } catch (err) {
      console.error('Error fetching projects from PGlite:', err);
    }
  }, [activeProjectId]);

  const loadProjectDocs = useCallback(async (projId: string) => {
    try {
      const docs = await getDocuments(projId);
      setDocuments(docs);
      if (docs.length > 0) {
        setActiveDocId(docs[0].id);
      }
    } catch (err) {
      console.error('Error fetching documents from PGlite:', err);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
    checkApiKey();
    // Warm up embedding worker in background
    initEmbeddings().catch((err) => console.warn('Pre-warming embedding worker:', err));
  }, [refreshProjects, checkApiKey]);

  useEffect(() => {
    if (activeProjectId) {
      loadProjectDocs(activeProjectId);
    } else {
      setDocuments([]);
    }
  }, [activeProjectId, loadProjectDocs]);

  const updateStepStatus = (
    stepId: string,
    status: IngestionStep['status'],
    detail?: string
  ) => {
    setIngestionSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status, detail } : s))
    );
  };

  const handleUploadFile = async (fileOrBlob: File | Blob) => {
    setIsIngesting(true);
    setIngestionError(null);
    setIngestionTokenUsage(undefined);
    setIngestionProgress(5);
    setIngestionStatusText('Reading solution file...');

    // Reset steps
    setIngestionSteps([
      { id: 'unpack', label: '1. Unpack & Parse Solution XML/JSON', status: 'in_progress' },
      { id: 'docs', label: '2. Generate Architecture & Developer Documentation', status: 'pending' },
      { id: 'chunk', label: '3. Semantic Markdown Chunking & Heading Hierarchy', status: 'pending' },
      { id: 'embed', label: '4. Web Worker Dense Vectorization (bge-small-en-v1.5)', status: 'pending' },
      { id: 'db', label: '5. Persist to PGlite (IndexedDB + pgvector)', status: 'pending' },
    ]);

    try {
      const arrayBuffer = await fileOrBlob.arrayBuffer();

      // Step 1: Unpack & Parse
      setIngestionProgress(15);
      const ast = await unpackAndParseSolution(arrayBuffer, (status) => {
        setIngestionStatusText(status);
      });

      const projectId = `proj_${ast.solution.unique_name.toLowerCase()}_${Date.now()}`;
      const wrCount = ast.web_resources?.length || 0;
      updateStepStatus(
        'unpack',
        'completed',
        `Parsed ${ast.entities.length} tables, ${ast.flows.length} flows${wrCount > 0 ? `, ${wrCount} web resources` : ''}`
      );

      // Step 2: Generate Docs
      updateStepStatus('docs', 'in_progress');
      setIngestionProgress(35);
      let cumulativeTokenUsage: TokenUsage | undefined;
      const generatedDocs = await generateDocumentationSuite(
        projectId,
        ast,
        (current, total, stepLabel, tokenUsage) => {
          setIngestionStatusText(stepLabel);
          setIngestionProgress(35 + Math.round((current / total) * 25));
          if (tokenUsage && tokenUsage.totalTokens > 0) {
            cumulativeTokenUsage = tokenUsage;
            setIngestionTokenUsage({ ...tokenUsage });
          }
        }
      );
      updateStepStatus(
        'docs',
        'completed',
        `Generated ${generatedDocs.length} technical documents${
          cumulativeTokenUsage && cumulativeTokenUsage.totalTokens > 0
            ? ` (${cumulativeTokenUsage.totalTokens.toLocaleString()} LLM tokens)`
            : ''
        }`
      );

      // Step 3: Semantic Chunking
      updateStepStatus('chunk', 'in_progress');
      setIngestionStatusText('Chunking documents with heading preservation...');
      setIngestionProgress(65);

      const allRawChunks: Array<{
        docId: string;
        chunkIndex: number;
        chunkContent: string;
        headingContext: string;
      }> = [];

      for (const doc of generatedDocs) {
        const rawChunks = chunkMarkdown(doc.content_markdown);
        for (const rc of rawChunks) {
          allRawChunks.push({
            docId: doc.id,
            chunkIndex: rc.chunk_index,
            chunkContent: rc.chunk_content,
            headingContext: rc.heading_context,
          });
        }
      }
      updateStepStatus('chunk', 'completed', `Split into ${allRawChunks.length} semantic chunks`);

      // Step 4: Embeddings
      updateStepStatus('embed', 'in_progress');
      setIngestionStatusText('Generating dense vectors in Web Worker...');
      setIngestionProgress(75);

      const chunkTexts = allRawChunks.map(
        (c) => `${c.headingContext}\n\n${c.chunkContent}`
      );
      const embeddings = await embedBatch(chunkTexts, (current, total) => {
        setIngestionStatusText(`Embedding chunk ${current} of ${total}...`);
        setIngestionProgress(75 + Math.round((current / total) * 15));
      });
      updateStepStatus('embed', 'completed', `Generated ${embeddings.length} 384-d vectors`);

      // Step 5: Save to PGlite
      updateStepStatus('db', 'in_progress');
      setIngestionStatusText('Writing to PGlite IndexedDB...');
      setIngestionProgress(92);

      const projectRecord: ProjectRecord = {
        id: projectId,
        unique_name: ast.solution.unique_name,
        display_name: ast.solution.display_name,
        version: ast.solution.version,
        is_managed: ast.solution.is_managed,
        publisher_name: ast.solution.publisher_name,
        description: ast.solution.description,
        ast_json: ast,
        stats: ast.stats,
      };

      const chunkRecords: ChunkRecord[] = allRawChunks.map((rc, idx) => ({
        id: `chunk_${projectId}_${idx}`,
        document_id: rc.docId,
        project_id: projectId,
        chunk_index: rc.chunkIndex,
        chunk_content: rc.chunkContent,
        heading_context: rc.headingContext,
        embedding: embeddings[idx],
      }));

      await saveFullProjectIngestion(projectRecord, generatedDocs, chunkRecords);
      const depCount = ast.dependencies?.length || 0;
      updateStepStatus(
        'db',
        'completed',
        `Saved project, docs, vectors, and ${depCount} relational dependencies`
      );

      setIngestionProgress(100);
      setIngestionStatusText('Ingestion complete!');

      await refreshProjects();
      setActiveProjectId(projectId);
      await loadProjectDocs(projectId);
    } catch (err: any) {
      console.error('Ingestion failed:', err);
      setIngestionError(err?.message || String(err));
      // Mark active step as error
      setIngestionSteps((prev) =>
        prev.map((s) => (s.status === 'in_progress' ? { ...s, status: 'error' } : s))
      );
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProject(id);
      if (activeProjectId === id) {
        setActiveProjectId(undefined);
      }
      await refreshProjects();
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  const handleNavigateToDoc = (projId: string, docSlug: string) => {
    setActiveProjectId(projId);
    getDocuments(projId).then((docs) => {
      setDocuments(docs);
      const targetDoc = docs.find((d) => d.slug === docSlug);
      if (targetDoc) {
        setActiveDocId(targetDoc.id);
      }
      setCurrentView('reader');
    });
  };

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Top Header */}
      <Header
        currentView={currentView}
        onNavigateView={setCurrentView}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={(id) => {
          setActiveProjectId(id);
          loadProjectDocs(id);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        hasApiKey={hasApiKey}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {currentView === 'dashboard' && (
          <Dashboard
            projects={projects}
            onSelectProjectForDocs={(id) => {
              setActiveProjectId(id);
              loadProjectDocs(id);
              setCurrentView('reader');
            }}
            onSelectProjectForChat={(id) => {
              setActiveProjectId(id);
              setCurrentView('chat');
            }}
            onDeleteProject={handleDeleteProject}
            onUploadFile={handleUploadFile}
            isProcessing={isIngesting}
          />
        )}

        {currentView === 'reader' && activeProject && (
          <MarkdownReader
            project={activeProject}
            documents={documents}
            activeDocId={activeDocId}
            onSelectDoc={setActiveDocId}
          />
        )}

        {currentView === 'chat' && (
          <ChatAssistant
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
            onNavigateToDoc={handleNavigateToDoc}
          />
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          checkApiKey();
        }}
        onDataCleared={async () => {
          await refreshProjects();
          setActiveProjectId(undefined);
          setDocuments([]);
        }}
      />

      {/* Ingestion Progress Modal */}
      <IngestionProgressModal
        isOpen={isIngesting}
        steps={ingestionSteps}
        currentStatusText={ingestionStatusText}
        overallProgress={ingestionProgress}
        tokenUsage={ingestionTokenUsage}
        error={ingestionError}
        onClose={() => {
          setIsIngesting(false);
          if (!ingestionError) {
            setCurrentView('reader');
          }
        }}
      />
    </div>
  );
}

export default App;

