import { apiClient } from '../api/httpClient';
import { buildApiUrl } from '../config/env';

const getHeaders = () => ({
  headers: {
    'x-workspace-user-id': localStorage.getItem('sheryai_workspace_uid') || '',
  }
});

export async function getWorkspaces() {
  return apiClient.get('/api/workspaces', getHeaders());
}

export async function createWorkspace(data) {
  return apiClient.post('/api/workspaces', data, getHeaders());
}

export async function getWorkspace(wid) {
  return apiClient.get(`/api/workspaces/${wid}`, getHeaders());
}

export async function updateWorkspace(wid, data) {
  return apiClient.patch(`/api/workspaces/${wid}`, data, getHeaders());
}

export async function deleteWorkspace(wid) {
  return apiClient.delete(`/api/workspaces/${wid}`, getHeaders());
}

export async function addSource(wid, formData) {
  const config = getHeaders();
  config.headers['Content-Type'] = 'multipart/form-data';
  return apiClient.post(`/api/workspaces/${wid}/sources`, formData, config);
}

export async function uploadVideoSource(wid, formData) {
  const config = getHeaders();
  config.headers['Content-Type'] = 'multipart/form-data';
  return apiClient.post(`/api/workspaces/${wid}/sources/video-upload`, formData, config);
}

export async function getSourceStatus(wid, sid) {
  return apiClient.get(`/api/workspaces/${wid}/sources/${sid}/status`, getHeaders());
}

export async function deleteSource(wid, sid) {
  return apiClient.delete(`/api/workspaces/${wid}/sources/${sid}`, getHeaders());
}

export async function listChats(wid) {
  return apiClient.get(`/api/workspaces/${wid}/chats`, getHeaders());
}

export async function getChatHistory(wid, cid) {
  return apiClient.get(`/api/workspaces/${wid}/chats/${cid}`, getHeaders());
}

export async function deleteChat(wid, cid) {
  return apiClient.delete(`/api/workspaces/${wid}/chats/${cid}`, getHeaders());
}

export async function generateOutput(wid, data) {
  return apiClient.post(`/api/workspaces/${wid}/generate`, data, getHeaders());
}

export async function listOutputs(wid) {
  return apiClient.get(`/api/workspaces/${wid}/outputs`, getHeaders());
}

export async function getOutput(wid, oid) {
  return apiClient.get(`/api/workspaces/${wid}/outputs/${oid}`, getHeaders());
}

export async function deleteOutput(wid, oid) {
  return apiClient.delete(`/api/workspaces/${wid}/outputs/${oid}`, getHeaders());
}

export async function getWorkspaceGraph(wid) {
  return apiClient.get(`/api/workspaces/${wid}/graph`, getHeaders());
}

export async function searchWorkspace(wid, query) {
  return apiClient.get(`/api/workspaces/${wid}/search`, {
    ...getHeaders(),
    params: { q: query },
  });
}

export async function getMetrics(wid) {
  return apiClient.get(`/api/workspaces/${wid}/metrics`, getHeaders());
}

export async function getMemory(wid) {
  return apiClient.get(`/api/workspaces/${wid}/memory`, getHeaders());
}

export function buildWorkspaceChatUrl(wid) {
  return buildApiUrl(`/api/workspaces/${wid}/chat`);
}

export async function getLearningIntelligence(wid) {
  return apiClient.get(`/api/workspaces/${wid}/learning`, getHeaders());
}

export async function getKnowledgeCoverage(wid) {
  return apiClient.get(`/api/workspaces/${wid}/coverage`, getHeaders());
}

export async function retrySource(wid, sid) {
  return apiClient.post(`/api/workspaces/${wid}/sources/${sid}/retry`, {}, getHeaders());
}

export async function getInfrastructureHealth() {
  return apiClient.get('/api/workspaces/infrastructure/health', getHeaders());
}

export async function sweepOrphans() {
  return apiClient.post('/api/workspaces/infrastructure/sweep-orphans', {}, getHeaders());
}

export async function generateVisual(wid, data) {
  return apiClient.post(`/api/workspaces/${wid}/artifacts/generate-visual`, data, getHeaders());
}

export async function generateOutline(wid, data) {
  return apiClient.post(`/api/workspaces/${wid}/artifacts/generate-outline`, data, getHeaders());
}

export async function compilePresentation(wid, data) {
  return apiClient.post(`/api/workspaces/${wid}/artifacts/compile-presentation`, data, getHeaders());
}

export async function getArtifactVersions(wid, aid) {
  return apiClient.get(`/api/workspaces/${wid}/artifacts/${aid}/versions`, getHeaders());
}

export async function duplicateArtifact(wid, oid) {
  return apiClient.post(`/api/workspaces/${wid}/artifacts/${oid}/duplicate`, {}, getHeaders());
}

export async function renameArtifact(wid, oid, title) {
  return apiClient.patch(`/api/workspaces/${wid}/artifacts/${oid}/rename`, { title }, getHeaders());
}

export async function generateAudio(wid, data) {
  return apiClient.post(`/api/workspaces/${wid}/artifacts/generate-audio`, data, getHeaders());
}




