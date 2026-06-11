import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getWorkspaces,
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  addSource,
  uploadVideoSource,
  getSourceStatus,
  deleteSource,
  listChats,
  getChatHistory,
  deleteChat,
  generateOutput,
  listOutputs,
  getOutput,
  deleteOutput,
  getWorkspaceGraph,
  searchWorkspace,
  getMetrics,
  getMemory,
  getLearningIntelligence,
  getKnowledgeCoverage,
  generateVisual,
  generateOutline,
  compilePresentation,
  duplicateArtifact,
  renameArtifact,
  generateAudio
} from '../services/workspaceApi';

export const workspaceKeys = {
  all: ['workspaces'],
  list: (uid) => [...workspaceKeys.all, 'list', ...(uid ? [uid] : [])],
  detail: (wid) => [...workspaceKeys.all, 'detail', wid],
  sources: (wid) => [...workspaceKeys.all, 'sources', wid],
  sourceStatus: (wid, sid) => [...workspaceKeys.all, 'sourceStatus', wid, sid],
  chats: (wid) => [...workspaceKeys.all, 'chats', wid],
  chatHistory: (wid, cid) => [...workspaceKeys.all, 'chatHistory', wid, cid],
  outputs: (wid) => [...workspaceKeys.all, 'outputs', wid],
  outputDetail: (wid, oid) => [...workspaceKeys.all, 'outputDetail', wid, oid],
  graph: (wid) => [...workspaceKeys.all, 'graph', wid],
  metrics: (wid) => [...workspaceKeys.all, 'metrics', wid],
  memory: (wid) => [...workspaceKeys.all, 'memory', wid],
};

export function useWorkspacesQuery(userId, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.list(userId),
    queryFn: getWorkspaces,
    enabled: Boolean(userId),
    ...options,
  });
}

export function useWorkspaceQuery(wid, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.detail(wid),
    queryFn: () => getWorkspace(wid),
    enabled: Boolean(wid),
    ...options,
  });
}

export function useCreateWorkspaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
    },
  });
}

export function useUpdateWorkspaceMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => updateWorkspace(wid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wid) });
    },
  });
}

export function useDeleteWorkspaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
    },
  });
}

export function useAddSourceMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData) => addSource(wid, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.graph(wid) });
    },
  });
}

export function useUploadVideoSourceMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData) => uploadVideoSource(wid, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.graph(wid) });
    },
  });
}

export function useSourceStatusQuery(wid, sid, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.sourceStatus(wid, sid),
    queryFn: () => getSourceStatus(wid, sid),
    enabled: Boolean(wid) && Boolean(sid),
    refetchInterval: (data) => {
      // Poll every 2s while in a pending/processing state
      const status = data?.state?.data?.status || data?.status;
      return ['pending', 'processing', 'extracting', 'transcribing', 'chunking', 'embedding', 'indexing'].includes(status) ? 2000 : false;
    },
    ...options,
  });
}

export function useDeleteSourceMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sid) => deleteSource(wid, sid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.graph(wid) });
    },
  });
}

export function useChatsQuery(wid, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.chats(wid),
    queryFn: () => listChats(wid),
    enabled: Boolean(wid),
    ...options,
  });
}

export function useChatHistoryQuery(wid, cid, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.chatHistory(wid, cid),
    queryFn: () => getChatHistory(wid, cid),
    enabled: Boolean(wid) && Boolean(cid),
    ...options,
  });
}

export function useDeleteChatMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cid) => deleteChat(wid, cid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.chats(wid) });
    },
  });
}

export function useGenerateOutputMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => generateOutput(wid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.outputs(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
    },
  });
}

export function useOutputsQuery(wid, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.outputs(wid),
    queryFn: () => listOutputs(wid),
    enabled: Boolean(wid),
    ...options,
  });
}

export function useOutputDetailQuery(wid, oid, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.outputDetail(wid, oid),
    queryFn: () => getOutput(wid, oid),
    enabled: Boolean(wid) && Boolean(oid),
    ...options,
  });
}

export function useDeleteOutputMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (oid) => deleteOutput(wid, oid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.outputs(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
    },
  });
}

export function useWorkspaceGraphQuery(wid, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.graph(wid),
    queryFn: () => getWorkspaceGraph(wid),
    enabled: Boolean(wid),
    ...options,
  });
}

export function useWorkspaceMetricsQuery(wid, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.metrics(wid),
    queryFn: () => getMetrics(wid),
    enabled: Boolean(wid),
    ...options,
  });
}

export function useWorkspaceMemoryQuery(wid, options = {}) {
  return useQuery({
    queryKey: workspaceKeys.memory(wid),
    queryFn: () => getMemory(wid),
    enabled: Boolean(wid),
    ...options,
  });
}

export function useWorkspaceLearningQuery(wid, options = {}) {
  return useQuery({
    queryKey: [...workspaceKeys.all, 'learning', wid],
    queryFn: () => getLearningIntelligence(wid),
    enabled: Boolean(wid),
    ...options,
  });
}

export function useWorkspaceCoverageQuery(wid, options = {}) {
  return useQuery({
    queryKey: [...workspaceKeys.all, 'coverage', wid],
    queryFn: () => getKnowledgeCoverage(wid),
    enabled: Boolean(wid),
    ...options,
  });
}

export function useGenerateVisualMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => generateVisual(wid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.outputs(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
    },
  });
}

export function useGenerateOutlineMutation(wid) {
  return useMutation({
    mutationFn: (data) => generateOutline(wid, data),
  });
}

export function useCompilePresentationMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => compilePresentation(wid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.outputs(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
    },
  });
}

export function useDuplicateArtifactMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (oid) => duplicateArtifact(wid, oid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.outputs(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
    },
  });
}

export function useRenameArtifactMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ oid, title }) => renameArtifact(wid, oid, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.outputs(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
    },
  });
}

export function useGenerateAudioMutation(wid) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => generateAudio(wid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.outputs(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wid) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.metrics(wid) });
    },
  });
}

