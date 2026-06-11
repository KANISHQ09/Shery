/**
 * hooks/useChat.js — No auth, SSE streaming chat hook
 */
import { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { deleteChatSession, streamChat } from '../services/api';

export function useChat(lessonId) {
  const [messages,          setMessages]          = useState([]);
  const [isStreaming,       setIsStreaming]        = useState(false);
  const [currentStreamText, setCurrentStreamText] = useState('');
  const [followUps,         setFollowUps]         = useState([]);
  const [error,             setError]             = useState(null);
  const sessionId = useRef(uuidv4());
  const abortRef  = useRef(null);

  const sendMessage = useCallback(async (text, getCurrentTime) => {
    if (!text?.trim() || isStreaming) return;

    const userMsg = { role: 'user', content: text.trim(), id: uuidv4() };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setCurrentStreamText('');
    setFollowUps([]);
    setError(null);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await streamChat({
          lessonId,
          sessionId: sessionId.current,
          message:   text.trim(),
          currentTime: typeof getCurrentTime === 'function' ? Math.floor(getCurrentTime()) : 0,
        },
        controller.signal
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';
      let   fullText = '';
      let   receivedFollowUps = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'token') {
              fullText += event.content;
              setCurrentStreamText(prev => prev + event.content);
            } else if (event.type === 'followUps') {
              receivedFollowUps = event.items || [];
              setFollowUps(receivedFollowUps);
            } else if (event.type === 'error') {
              setError(event.message);
              setIsStreaming(false);
              return;
            } else if (event.type === 'done') {
              setMessages(prev => [...prev, {
                role: 'assistant', content: event.fullResponse || fullText,
                followUps: event.followUps || receivedFollowUps, id: uuidv4(),
              }]);
              setCurrentStreamText('');
              setIsStreaming(false);
              return;
            }
          } catch { /* ignore malformed SSE */ }
        }
      }

      // Process any remaining data in the buffer after stream ends
      if (buffer && buffer.trim()) {
        const line = buffer.trim();
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'token') {
              fullText += event.content;
            } else if (event.type === 'followUps') {
              receivedFollowUps = event.items || [];
              setFollowUps(receivedFollowUps);
            } else if (event.type === 'done') {
              setMessages(prev => [...prev, {
                role: 'assistant', content: event.fullResponse || fullText,
                followUps: event.followUps || receivedFollowUps, id: uuidv4(),
              }]);
              setCurrentStreamText('');
              setIsStreaming(false);
              return;
            }
          } catch { /* ignore */ }
        }
      }

      // Fallback finalization if 'done' event wasn't processed
      setIsStreaming(false);
      setMessages(prev => {
        if (prev.some(m => m.role === 'assistant' && m.content === fullText)) {
          return prev;
        }
        return [...prev, {
          role: 'assistant', content: fullText,
          followUps: receivedFollowUps, id: uuidv4(),
        }];
      });
      setCurrentStreamText('');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Connection lost. Please try again.');
      setCurrentStreamText('');
      setIsStreaming(false);
    }
  }, [lessonId, isStreaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setCurrentStreamText('');
  }, []);

  const clearSession = useCallback(async () => {
    try {
      await deleteChatSession(sessionId.current);
    } catch { /* non-critical */ }
    sessionId.current = uuidv4();
    setMessages([]);
    setFollowUps([]);
    setError(null);
    setCurrentStreamText('');
  }, []);

  return { messages, isStreaming, currentStreamText, followUps, error, sendMessage, stopStreaming, clearSession, sessionId: sessionId.current };
}
