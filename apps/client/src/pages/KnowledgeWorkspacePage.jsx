import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppIcon from '../components/AppIcon';
import WorkspaceSidebar from '../components/workspace/WorkspaceSidebar';
import WorkspaceHeader from '../components/workspace/WorkspaceHeader';
import WorkspaceEmptyState from '../components/workspace/WorkspaceEmptyState';
import SourcesPanel from '../components/workspace/SourcesPanel';
import ChatPanel from '../components/workspace/ChatPanel';
import StudioPanel from '../components/workspace/StudioPanel';
import StudioWorkbench from '../components/workspace/StudioWorkbench';
import KnowledgeDashboard from '../components/workspace/KnowledgeDashboard';
import CreateWorkspaceModal from '../components/workspace/CreateWorkspaceModal';
import AddSourceModal from '../components/workspace/AddSourceModal';
import GlobalSearchModal from '../components/workspace/GlobalSearchModal';
import SourcePreviewDrawer from '../components/workspace/SourcePreviewDrawer';
import OutputViewer from '../components/workspace/OutputViewer';
import VisualGeneratorModal from '../components/workspace/VisualGeneratorModal';
import PresentationGeneratorModal from '../components/workspace/PresentationGeneratorModal';
import PresentationOutlineEditor from '../components/workspace/PresentationOutlineEditor';
import AudioGeneratorModal from '../components/workspace/AudioGeneratorModal';

// React Query hooks
import {
  useWorkspacesQuery,
  useWorkspaceQuery,
  useCreateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useAddSourceMutation,
  useDeleteSourceMutation,
  useGenerateOutputMutation,
  useDeleteOutputMutation,
  useWorkspaceGraphQuery,
  useWorkspaceMetricsQuery,
  useWorkspaceMemoryQuery,
  useWorkspaceLearningQuery,
  useWorkspaceCoverageQuery,
  useGenerateVisualMutation,
  useGenerateOutlineMutation,
  useCompilePresentationMutation,
  useDuplicateArtifactMutation,
  useRenameArtifactMutation,
  useGenerateAudioMutation,
} from '../api/workspaceQueries';

// Shared hooks
import { useWorkspaceUser } from '../hooks/useWorkspaceUser';
import { useWorkspaceChat } from '../hooks/useWorkspaceChat';

export default function KnowledgeWorkspacePage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();

  // Custom persistent User Identity hook
  const { userId } = useWorkspaceUser();

  // Sidebar collapse persistence state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sheryai-sidebar-collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sheryai-sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Right Studio Panel collapse persistence state
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(() => {
    const stored = localStorage.getItem('sheryai-rightpanel-collapsed');
    return stored !== null ? stored === 'true' : true;
  });

  // Left Sources Panel collapse persistence state
  const [isSourcesCollapsed, setIsSourcesCollapsed] = useState(() => {
    const stored = localStorage.getItem('sheryai-sources-collapsed');
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('sheryai-rightpanel-collapsed', String(isRightPanelCollapsed));
  }, [isRightPanelCollapsed]);

  useEffect(() => {
    localStorage.setItem('sheryai-sources-collapsed', String(isSourcesCollapsed));
  }, [isSourcesCollapsed]);

  // Handlers for mutual exclusion
  const handleToggleSources = () => {
    setIsSourcesCollapsed(prev => {
      const next = !prev;
      if (!next) setIsRightPanelCollapsed(true);
      return next;
    });
  };

  const handleToggleStudio = () => {
    setIsRightPanelCollapsed(prev => {
      const next = !prev;
      if (!next) setIsSourcesCollapsed(true);
      return next;
    });
  };

  // Active workspace states
  const [activeTab, setActiveTab] = useState('chat');
  const [createOpen, setCreateOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [selectedOutput, setSelectedOutput] = useState(null);

  // V4 Generative Assets state
  const [visualModalOpen, setVisualModalOpen] = useState(false);
  const [presentationModalOpen, setPresentationModalOpen] = useState(false);
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [editingOutline, setEditingOutline] = useState(null);
  const [editingOutlineTheme, setEditingOutlineTheme] = useState('Professional');
  const [outlineGenerationPrompt, setOutlineGenerationPrompt] = useState('');

  // Queries
  const { data: workspacesRes, isLoading: spacesLoading } = useWorkspacesQuery(userId, {
    enabled: Boolean(userId),
  });

  const workspaces = workspacesRes?.list || [];

  const { data: workspaceDetailRes, isLoading: workspaceLoading, refetch: refetchWorkspace } = useWorkspaceQuery(workspaceId, {
    enabled: Boolean(workspaceId),
    refetchInterval: (data) => {
      const outputs = data?.outputs || [];
      const hasGenerating = outputs.some(out => out.status === 'generating');
      return hasGenerating ? 2000 : false;
    }
  });

  const workspace = workspaceDetailRes?.workspace;
  const sources = workspaceDetailRes?.sources || [];
  const outputs = workspaceDetailRes?.outputs || [];

  const { data: graphRes } = useWorkspaceGraphQuery(workspaceId, {
    enabled: Boolean(workspaceId) && activeTab === 'dashboard',
  });

  const { data: metricsRes } = useWorkspaceMetricsQuery(workspaceId, {
    enabled: Boolean(workspaceId) && activeTab === 'dashboard',
  });

  const { data: memoryRes } = useWorkspaceMemoryQuery(workspaceId, {
    enabled: Boolean(workspaceId) && activeTab === 'dashboard',
  });

  const { data: learningRes } = useWorkspaceLearningQuery(workspaceId, {
    enabled: Boolean(workspaceId) && activeTab === 'dashboard',
  });

  const { data: coverageRes } = useWorkspaceCoverageQuery(workspaceId, {
    enabled: Boolean(workspaceId) && activeTab === 'dashboard',
  });

  // Mutations
  const createWorkspaceMutation = useCreateWorkspaceMutation();
  const deleteWorkspaceMutation = useDeleteWorkspaceMutation();
  const addSourceMutation = useAddSourceMutation(workspaceId);
  const deleteSourceMutation = useDeleteSourceMutation(workspaceId);
  const generateOutputMutation = useGenerateOutputMutation(workspaceId);
  const deleteOutputMutation = useDeleteOutputMutation(workspaceId);
  const generateVisualMutation = useGenerateVisualMutation(workspaceId);
  const generateOutlineMutation = useGenerateOutlineMutation(workspaceId);
  const compilePresentationMutation = useCompilePresentationMutation(workspaceId);
  const duplicateArtifactMutation = useDuplicateArtifactMutation(workspaceId);
  const renameArtifactMutation = useRenameArtifactMutation(workspaceId);
  const generateAudioMutation = useGenerateAudioMutation(workspaceId);

  // Streaming chat hook
  const chatStream = useWorkspaceChat(workspaceId);

  // Command Palette executor
  const handleRunCommand = (cmd) => {
    if (cmd === 'chat') {
      setActiveTab('chat');
    } else if (cmd === 'studio') {
      setActiveTab('studio');
    } else if (cmd === 'dashboard') {
      setActiveTab('dashboard');
    } else if (cmd === 'reset') {
      chatStream.clearSession();
    } else if (cmd === 'guide') {
      handleGenerateOutput({ type: 'study_guide' });
    } else if (cmd === 'glossary') {
      handleGenerateOutput({ type: 'glossary' });
    }
  };

  // Drag and Drop Grounding documents logic
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type !== 'application/pdf') {
        alert('Only PDF documents are supported for grounding upload.');
        return;
      }

      const formData = new FormData();
      formData.append('type', 'pdf');
      formData.append('file', file);
      formData.append('title', file.name);

      try {
        await handleAddSource(formData);
      } catch (err) {
        alert(`Document upload failed: ${err.response?.data?.message || err.message}`);
      }
    }
  };

  // Auto-redirect to first workspace if none opened and list exists
  useEffect(() => {
    if (!workspaceId && workspaces.length > 0 && !spacesLoading) {
      navigate(`/workspace/${workspaces[0].id}`);
    }
  }, [workspaceId, workspaces, spacesLoading, navigate]);

  // Listen for Global Cmd+K Search trigger
  useEffect(() => {
    const handleGlobalKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  const handleSelectWorkspace = (wid) => {
    chatStream.clearSession();
    setSelectedCitation(null);
    setSelectedOutput(null);
    navigate(`/workspace/${wid}`);
  };

  const handleCreateWorkspace = (data) => {
    createWorkspaceMutation.mutate(data, {
      onSuccess: (newWorkspace) => {
        setCreateOpen(false);
        handleSelectWorkspace(newWorkspace.id);
      },
    });
  };

  const handleDeleteWorkspace = () => {
    if (!window.confirm('Are you sure you want to permanently delete this Knowledge Space and cascade purge all vectors?')) return;
    deleteWorkspaceMutation.mutate(workspaceId, {
      onSuccess: () => {
        chatStream.clearSession();
        setSelectedCitation(null);
        setSelectedOutput(null);
        navigate('/workspace');
      },
    });
  };

  const handleAddSource = async (formData) => {
    return new Promise((resolve, reject) => {
      addSourceMutation.mutate(formData, {
        onSuccess: () => resolve(),
        onError: (err) => reject(err),
      });
    });
  };

  const handleDeleteSource = (sid) => {
    if (!window.confirm('Remove this source document and erase its vector points?')) return;
    deleteSourceMutation.mutate(sid, {
      onSuccess: () => {
        if (selectedCitation?.sourceId === sid) setSelectedCitation(null);
      },
    });
  };

  const handleGenerateOutput = (data) => {
    generateOutputMutation.mutate(data, {
      onSuccess: (newOutput) => {
        setSelectedOutput(newOutput);
      },
    });
  };

  const handleDeleteOutput = (oid) => {
    if (!window.confirm('Delete this generated study document?')) return;
    deleteOutputMutation.mutate(oid, {
      onSuccess: () => {
        if (selectedOutput?.id === oid) setSelectedOutput(null);
      },
    });
  };

  const handleOpenVisualModal = () => {
    setVisualModalOpen(true);
  };

  const handleOpenPresentationModal = () => {
    setPresentationModalOpen(true);
  };

  const handleOpenAudioModal = () => {
    setAudioModalOpen(true);
  };

  const handleGenerateVisual = async (data) => {
    const newOutput = await generateVisualMutation.mutateAsync(data);
    if (newOutput) {
      setSelectedOutput(newOutput);
    }
  };

  const handleGenerateAudio = async (data) => {
    const newOutput = await generateAudioMutation.mutateAsync(data);
    if (newOutput) {
      setSelectedOutput(newOutput);
    }
  };

  const handleGenerateOutline = async (data) => {
    const res = await generateOutlineMutation.mutateAsync(data);
    if (res?.slides) {
      setEditingOutline(res.slides);
      setEditingOutlineTheme(data.theme || 'Professional');
      setOutlineGenerationPrompt(data.prompt);
      setPresentationModalOpen(false);
    }
  };

  const handleCompilePresentation = async (slides, theme) => {
    const newOutput = await compilePresentationMutation.mutateAsync({
      outline: slides,
      theme,
      title: `Presentation: ${theme}`,
      prompt: outlineGenerationPrompt,
    });
    if (newOutput) {
      setSelectedOutput(newOutput);
      setEditingOutline(null);
    }
  };

  const handleDuplicateOutput = async (oid) => {
    await duplicateArtifactMutation.mutateAsync(oid);
  };

  const handleRenameOutput = async (oid, title) => {
    await renameArtifactMutation.mutateAsync({ oid, title });
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="fixed inset-0 w-full h-full flex bg-[#030305] text-slate-200 overflow-hidden font-sans dark-workspace"
    >
      {/* Ambient background glow spheres */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-orange-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />

      {/* 1. Left Nav Sidebar */}
      <WorkspaceSidebar
        workspaces={workspaces}
        activeWorkspaceId={workspaceId}
        onSelectWorkspace={handleSelectWorkspace}
        onNewWorkspace={() => setCreateOpen(true)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        activeWorkspaceSources={sources}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 min-h-0 bg-transparent">
        {workspaceId && workspace ? (
          <>
            {/* 2. Top Header bar */}
            <WorkspaceHeader
              workspace={workspace}
              onAddSource={() => setAddSourceOpen(true)}
              onOpenSearch={() => setSearchOpen(true)}
              onDeleteWorkspace={handleDeleteWorkspace}
            />

            {/* Ingestion Pipeline Grid area */}
            {sources.length === 0 ? (
              <WorkspaceEmptyState onAddSource={() => setAddSourceOpen(true)} workspaceName={workspace.name} />
            ) : (
              <div className="flex-1 flex overflow-hidden min-h-0 relative">
                {/* 3. Left Sources List Panel (Collapsible) */}
                <div className="flex shrink-0 h-full relative z-10">
                  <div
                    style={{
                      width: isSourcesCollapsed ? '0px' : '280px',
                      minWidth: isSourcesCollapsed ? '0px' : '280px',
                      maxWidth: isSourcesCollapsed ? '0px' : '280px',
                      opacity: isSourcesCollapsed ? 0 : 1,
                      transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                    className="h-full overflow-hidden flex shrink-0"
                  >
                    <SourcesPanel
                      sources={sources}
                      activeSourceId={selectedCitation?.sourceId}
                      onSelectSource={(sid) => setSelectedCitation({ sourceId: sid })}
                      onDeleteSource={handleDeleteSource}
                      onAddSource={() => setAddSourceOpen(true)}
                    />
                  </div>
                  {/* Collapsible toggle handle button for sources */}
                  <button
                    onClick={handleToggleSources}
                    className="absolute right-[-12px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#0b0c10] border border-white/10 flex items-center justify-center text-slate-400 hover:text-slate-200 shadow-md hover:scale-110 cursor-pointer z-30 transition-all duration-200"
                    title={isSourcesCollapsed ? 'Expand Sources' : 'Collapse Sources'}
                  >
                    <AppIcon
                      name="chevronLeft"
                      size={12}
                      className={`transform transition-transform duration-300 ${isSourcesCollapsed ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>

                {/* Center Content Workspace Container */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
                  {editingOutline ? (
                    <PresentationOutlineEditor
                      outline={editingOutline}
                      theme={editingOutlineTheme}
                      onCompile={handleCompilePresentation}
                      onCancel={() => setEditingOutline(null)}
                    />
                  ) : (
                    <ChatPanel
                      messages={chatStream.messages}
                      isStreaming={chatStream.isStreaming}
                      currentStreamText={chatStream.currentStreamText}
                      sources={chatStream.sources}
                      error={chatStream.error}
                      mode={chatStream.mode}
                      onSelectMode={chatStream.setMode}
                      depth={chatStream.depth}
                      onSelectDepth={chatStream.setDepth}
                      onSendMessage={chatStream.sendMessage}
                      onStopStreaming={chatStream.stopStreaming}
                      onClearSession={chatStream.clearSession}
                      onSelectCitation={setSelectedCitation}
                      workspaceSources={sources}
                      outputs={outputs}
                      onSelectOutput={setSelectedOutput}
                    />
                  )}
                </div>

                {/* Right Studio Panel */}
                <div className="flex shrink-0 h-full relative z-10">
                  {/* Collapsible toggle handle button */}
                  <button
                    onClick={handleToggleStudio}
                    className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#0b0c10] border border-white/10 flex items-center justify-center text-slate-400 hover:text-slate-200 shadow-md hover:scale-110 cursor-pointer z-30 transition-all duration-200"
                    title={isRightPanelCollapsed ? 'Expand Studio Panel' : 'Collapse Studio Panel'}
                  >
                    <AppIcon
                      name="chevronLeft"
                      size={12}
                      className={`transform transition-transform duration-300 ${isRightPanelCollapsed ? '' : 'rotate-180'}`}
                    />
                  </button>

                  {/* Sliding wrapper */}
                  <div
                    style={{
                      width: isRightPanelCollapsed ? '0px' : '320px',
                      minWidth: isRightPanelCollapsed ? '0px' : '320px',
                      maxWidth: isRightPanelCollapsed ? '0px' : '320px',
                      opacity: isRightPanelCollapsed ? 0 : 1,
                      transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                    className="h-full overflow-hidden flex shrink-0"
                  >
                    <StudioPanel
                      outputs={outputs}
                      activeOutputId={selectedOutput?.id}
                      isGenerating={generateOutputMutation.isPending || generateVisualMutation.isPending || compilePresentationMutation.isPending || generateAudioMutation.isPending}
                      onGenerate={handleGenerateOutput}
                      onSelectOutput={setSelectedOutput}
                      onDeleteOutput={handleDeleteOutput}
                      onDuplicateOutput={handleDuplicateOutput}
                      onRenameOutput={handleRenameOutput}
                      onViewVersions={setSelectedOutput}
                      onOpenVisualModal={handleOpenVisualModal}
                      onOpenPresentationModal={handleOpenPresentationModal}
                      onOpenAudioModal={handleOpenAudioModal}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none bg-[#08090d]">
            <AppIcon name="loader" size={24} className="animate-spin text-orange-400 mb-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 animate-pulse">Mounting Knowledge Space...</span>
          </div>
        )}
      </div>

      {/* 5. Modals & Slide Drawers */}

      {/* Create workspace modal */}
      <CreateWorkspaceModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateWorkspace}
        isPending={createWorkspaceMutation.isPending}
      />

      {/* Add source modal */}
      <AddSourceModal
        isOpen={addSourceOpen}
        onClose={() => setAddSourceOpen(false)}
        onAddSource={handleAddSource}
        workspaceId={workspaceId}
      />

      {/* Global Cmd+K Search modal */}
      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        workspaceId={workspaceId}
        onSelectResult={setSelectedCitation}
        onRunCommand={handleRunCommand}
      />

      {/* Inline Slide Preview Drawer */}
      <SourcePreviewDrawer
        isOpen={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        citation={selectedCitation}
        workspaceId={workspaceId}
      />

      {/* Study guides/outputs full reading modal */}
      {selectedOutput && (
        <OutputViewer
          isOpen={Boolean(selectedOutput)}
          onClose={() => setSelectedOutput(null)}
          output={outputs.find(o => o.id === selectedOutput?.id) || selectedOutput}
          workspaceId={workspaceId}
          onSelectOutput={setSelectedOutput}
          refetchWorkspace={refetchWorkspace}
        />
      )}

      {/* Visual Generator Modal */}
      <VisualGeneratorModal
        isOpen={visualModalOpen}
        onClose={() => setVisualModalOpen(false)}
        onGenerate={handleGenerateVisual}
        sources={sources}
      />

      {/* Presentation Generator Modal */}
      <PresentationGeneratorModal
        isOpen={presentationModalOpen}
        onClose={() => setPresentationModalOpen(false)}
        onGenerateOutline={handleGenerateOutline}
        sources={sources}
      />

      {/* Audio Generator Modal */}
      <AudioGeneratorModal
        isOpen={audioModalOpen}
        onClose={() => setAudioModalOpen(false)}
        onGenerate={handleGenerateAudio}
        sources={sources}
      />

      {/* Drop overlay for PDF documents upload */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-[#08090d]/60 backdrop-blur-md border-[3px] border-dashed border-orange-500 m-4 rounded-3xl flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-200">
          <AppIcon name="upload" size={48} className="text-orange-450 animate-bounce mb-4" />
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">Grounding Document Upload</h3>
          <p className="text-[9px] text-white/70 mt-1 max-w-xs text-center leading-normal font-semibold">
            Release to instantly process and index your PDF into the Qdrant vector retrieval queue.
          </p>
        </div>
      )}
    </div>
  );
}
