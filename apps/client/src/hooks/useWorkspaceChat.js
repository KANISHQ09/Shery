import { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { buildWorkspaceChatUrl } from '../services/workspaceApi';

export function useWorkspaceChat(workspaceId) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamText, setCurrentStreamText] = useState('');
  const [sources, setSources] = useState([]);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('explain');
  const [depth, setDepth] = useState('detailed');
  const [activeChatId, setActiveChatId] = useState(null);

  const abortRef = useRef(null);

  const sendMessage = useCallback(async (text, chatId = null) => {
    if (!text?.trim() || isStreaming) return;

    const userMsg = { role: 'user', content: text.trim(), id: uuidv4() };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setCurrentStreamText('');
    setSources([]);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = buildWorkspaceChatUrl(workspaceId);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-user-id': localStorage.getItem('sheryai_workspace_uid') || '',
        },
        body: JSON.stringify({
          message: text.trim(),
          chatId: chatId || activeChatId,
          mode,
          depth,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to start stream.');
      }

      // Check header for active Chat Session ID
      const receivedChatId = res.headers.get('X-Chat-Id');
      if (receivedChatId && receivedChatId !== activeChatId) {
        setActiveChatId(receivedChatId);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';
      let receivedSources = [];
      let receivedTrustMetrics = null;
      let receivedFollowUpQuestions = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Save the last line if it is incomplete
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));

            if (event.type === 'token') {
              console.log('STREAM STEP 7: Frontend received token');
              fullText += event.content;
              setCurrentStreamText(prev => prev + event.content);
            } else if (event.type === 'sources') {
              receivedSources = event.items || [];
              setSources(receivedSources);
            } else if (event.type === 'followUp') {
              // Received asynchronously after the main response
              receivedFollowUpQuestions = event.questions || [];
            } else if (event.type === 'session') {
              if (event.chatId) setActiveChatId(event.chatId);
            } else if (event.type === 'error') {
              setError(event.message);
              setIsStreaming(false);
              return;
            } else if (event.type === 'done') {
              receivedTrustMetrics = event.trustMetrics || null;
              // Merge any follow-up questions that arrived in the done payload
              if (event.followUpQuestions?.length) {
                receivedFollowUpQuestions = event.followUpQuestions;
              }

              console.log('STREAM STEP 8: Message appended');
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: fullText || event.fullResponse || '',
                sources: receivedSources || event.sourcesUsed || [],
                trustMetrics: receivedTrustMetrics,
                followUpQuestions: receivedFollowUpQuestions,
                id: uuidv4(),
              }]);
              setCurrentStreamText('');
              setIsStreaming(false);
              return;
            }
          } catch {
            // Ignore parse errors on half-received frames
          }
        }
      }

      // Stream ended without 'done' — flush what we have
      if (fullText) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: fullText,
          sources: receivedSources,
          trustMetrics: null,
          followUpQuestions: [],
          id: uuidv4(),
        }]);
      }
      setCurrentStreamText('');
      setIsStreaming(false);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Connection lost. Please try again.');
      setCurrentStreamText('');
      setIsStreaming(false);
    }
  }, [workspaceId, isStreaming, mode, activeChatId]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setCurrentStreamText('');
  }, []);

  const clearSession = useCallback(() => {
    setActiveChatId(null);
    setMessages([]);
    setSources([]);
    setError(null);
    setCurrentStreamText('');
  }, []);

  return {
    messages,
    setMessages,
    isStreaming,
    currentStreamText,
    sources,
    error,
    sendMessage,
    stopStreaming,
    clearSession,
    mode,
    setMode,
    depth,
    setDepth,
    activeChatId,
    setActiveChatId,
  };
}

export default useWorkspaceChat;
