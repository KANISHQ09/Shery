import axios from 'axios';
import { apiClient, directApiClient } from '../api/httpClient';
import { demoHeaders } from '../api/demoIdentity';
import { API_BASE_URL, API_DIRECT_URL, buildApiUrl } from '../config/env';

export const BASE_URL = API_BASE_URL;
export const DIRECT_URL = API_DIRECT_URL;
export { buildApiUrl };

export async function ingestYoutubeLesson(payload) {
  return apiClient.post('/api/lessons/ingest-youtube', payload);
}

export async function ingestUrlLesson(payload) {
  return apiClient.post('/api/lessons/ingest-url', payload);
}

export async function uploadLesson(formData, onStep) {
  const file = formData.get('file');
  const courseId = formData.get('courseId');
  const moduleId = formData.get('moduleId');
  const title = formData.get('title');
  const description = formData.get('description');
  const order = formData.get('order');
  const language = formData.get('language');

  // Step 1: Request signed upload URL
  const requestPayload = {
    courseId,
    moduleId,
    title,
    description,
    order: Number(order || 0),
    fileName: file.name,
    contentType: file.type || 'video/mp4',
  };

  console.log('[SheryAI Upload] Step 1: Requesting signed URL...', requestPayload);
  onStep?.('requesting');
  const response = await apiClient.post('/api/lessons/request-upload-url', requestPayload);
  console.log('[SheryAI Upload] Step 1 Response:', response);

  // Defensive extraction to support raw JSON body or nested data field
  const data = response?.data || response;
  const lessonId = data?.lessonId || response?.lessonId;
  const uploadUrl = data?.uploadUrl || response?.uploadUrl;

  if (!lessonId || !uploadUrl) {
    console.error('[SheryAI Upload] Failed to extract upload details. Response:', response);
    throw new Error('Server did not return a valid upload URL or Lesson ID.');
  }

  // Step 2: Upload file directly to signed URL
  console.log('[SheryAI Upload] Step 2: PUT uploading binary file directly to:', uploadUrl);
  onStep?.('uploading');
  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type || 'video/mp4',
    },
  });
  console.log('[SheryAI Upload] Step 2: PUT upload completed successfully.');

  // Step 3: Confirm upload
  const confirmPayload = {
    courseId,
    moduleId,
    title,
    description,
    order: Number(order || 0),
    fileName: file.name,
    language,
  };

  console.log('[SheryAI Upload] Step 3: Confirming upload on server...', confirmPayload);
  onStep?.('confirming');
  const confirmResponse = await apiClient.post(`/api/lessons/${lessonId}/confirm-upload`, confirmPayload);
  console.log('[SheryAI Upload] Step 3 Response:', confirmResponse);

  return confirmResponse;
}

export async function getLessonStatus(lessonId) {
  return apiClient.get(`/api/lessons/${lessonId}/status`);
}

export async function getLesson(lessonId) {
  return apiClient.get(`/api/lessons/${lessonId}`);
}

export async function regenerateChapters(lessonId) {
  return apiClient.post(`/api/lessons/${lessonId}/regenerate-chapters`);
}

export async function getLessons(courseId) {
  const data = await apiClient.get('/api/lessons', {
    params: { courseId },
  });

  if (data.lessons) {
    data.lessons = data.lessons.map((lesson) => ({ ...lesson, id: lesson.id || lesson.lessonId }));
  }

  return data;
}

export async function getFailedLessons(courseId) {
  const data = await apiClient.get('/api/lessons/failed', {
    params: { courseId },
  });

  if (data.lessons) {
    data.lessons = data.lessons.map((lesson) => ({ ...lesson, id: lesson.id || lesson.lessonId }));
  }

  return data;
}

export async function deleteFailedLessons(courseId) {
  return apiClient.delete('/api/lessons/failed', {
    params: { courseId },
  });
}

export async function deleteFailedLesson(lessonId) {
  return apiClient.delete(`/api/lessons/${lessonId}/failed`);
}

export async function deleteLesson(lessonId) {
  return apiClient.delete(`/api/lessons/${lessonId}`);
}

export async function getLessonTranscript(lessonId) {
  return apiClient.get(`/api/lessons/${lessonId}/transcript`);
}

export async function checkHealth() {
  return apiClient.get('/api/health');
}

export async function getChatSession(lessonId) {
  return apiClient.get(`/api/chat/session/${lessonId}`);
}

export async function deleteChatSession(sessionId) {
  return apiClient.delete(`/api/chat/session/${sessionId}`);
}

export async function getLectureSummary(lessonId, type = 'full', startTime = 0, endTime = 0) {
  return apiClient.post('/api/chat/summary', { lessonId, type, startTime, endTime });
}

export async function generateQuiz(lessonId, count = 5, type = 'mcq', difficulty = 'mixed') {
  return apiClient.post('/api/chat/quiz', { lessonId, count, type, difficulty });
}

export async function streamChat(payload, signal) {
  return fetch(buildApiUrl('/api/chat/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...demoHeaders(),
    },
    body: JSON.stringify(payload),
    signal,
  });
}
