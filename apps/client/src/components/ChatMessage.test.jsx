import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import ChatMessage from './ChatMessage';

describe('ChatMessage Component rendering tests', () => {
  const onSeek = () => {};

  it('renders user message', () => {
    const msg = { role: 'user', content: 'hello' };
    const html = ReactDOMServer.renderToString(
      <ChatMessage message={msg} onSeek={onSeek} />
    );
    expect(html).toContain('hello');
  });

  it('renders streaming non-JSON message', () => {
    const msg = { role: 'assistant', content: 'typing...' };
    const html = ReactDOMServer.renderToString(
      <ChatMessage message={msg} onSeek={onSeek} isStreaming={true} />
    );
    expect(html).toContain('typing...');
  });

  it('renders streaming JSON message skeleton', () => {
    const msg = { role: 'assistant', content: '{\n  "type": "answer",\n  "answer": "typing' };
    const html = ReactDOMServer.renderToString(
      <ChatMessage message={msg} onSeek={onSeek} isStreaming={true} />
    );
    // Should render animated skeleton classes
    expect(html).toContain('animate-pulse');
  });

  it('renders complete standard answer card', () => {
    const data = {
      type: 'answer',
      topicOverview: 'Overview of RAG',
      directAnswer: 'RAG stands for Retrieval-Augmented Generation.',
      mentalModel: 'Think of it as an open-book exam.',
      howItWorks: ['Retrieve documents', 'Append context', 'Generate response'],
      whyItMatters: 'It grounds models in external knowledge.',
      realWorldExample: 'Search engines use it.',
      examInsight: 'Traps include bad retrieval depth.',
      commonMistakes: ['Thinking it is retraining'],
      relatedConcepts: ['Vector search', 'Embeddings'],
      keyTakeaway: 'Always ground your outputs.',
      learnNext: ['Vector stores', 'Reranking'],
      timestamps: [{ display: '01:23', seconds: 83 }]
    };
    const msg = { role: 'assistant', content: JSON.stringify(data) };
    const html = ReactDOMServer.renderToString(
      <ChatMessage message={msg} onSeek={onSeek} />
    );
    expect(html).toContain('Overview of RAG');
    expect(html).toContain('RAG stands for Retrieval-Augmented Generation.');
    expect(html).toContain('open-book exam');
    expect(html).toContain('grounds models');
    expect(html).toContain('01:23');
  });

  it('renders complete comparison card', () => {
    const data = {
      type: 'comparison',
      topicOverview: 'RAG vs Fine-Tuning',
      overview: 'Comparing dynamic retrieval vs parameter updates.',
      conceptA: {
        name: 'RAG',
        definition: 'Dynamic context injection.',
        strengths: ['No retraining', 'Real-time updates'],
        weaknesses: ['Context limit', 'Retrieval latency']
      },
      conceptB: {
        name: 'Fine-Tuning',
        definition: 'Updating model weights.',
        strengths: ['Custom behavior', 'Fast inference'],
        weaknesses: ['Catastrophic forgetting', 'Stale knowledge']
      },
      differences: [
        { aspect: 'Knowledge Update', a: 'Instant/Dynamic', b: 'Slow/Retraining' }
      ],
      whenToUseA: 'For highly dynamic external data.',
      whenToUseB: 'For behavior adaptation.',
      examInsight: 'RAG does not update weights.',
      verdict: 'Use RAG for knowledge, FT for tone.'
    };
    const msg = { role: 'assistant', content: JSON.stringify(data) };
    const html = ReactDOMServer.renderToString(
      <ChatMessage message={msg} onSeek={onSeek} />
    );
    expect(html).toContain('RAG vs Fine-Tuning');
    expect(html).toContain('Dynamic context injection.');
    expect(html).toContain('Updating model weights.');
    expect(html).toContain('Knowledge Update');
    expect(html).toContain('tone');
  });

  it('renders complete architecture card', () => {
    const data = {
      type: 'architecture',
      topicOverview: 'RAG Pipeline Architecture',
      overview: 'Three main components: ingestion, retrieval, generation.',
      components: ['Ingestion worker', 'Vector DB', 'LLM orchestrator'],
      dataFlow: 'Data flows from documents to query results.',
      howItWorks: ['Index docs', 'Retrieve matches', 'Synthesize answer'],
      tradeoffs: ['Latency vs Relevance'],
      failureModes: ['Retrieval timeout'],
      scalingConsiderations: 'Connection pooling on Redis.',
      realWorldUsage: 'Sentry uses this pattern.',
      keyTakeaway: 'Decouple ingestion from query time.'
    };
    const msg = { role: 'assistant', content: JSON.stringify(data) };
    const html = ReactDOMServer.renderToString(
      <ChatMessage message={msg} onSeek={onSeek} />
    );
    expect(html).toContain('RAG Pipeline Architecture');
    expect(html).toContain('Ingestion worker');
    expect(html).toContain('Latency vs Relevance');
    expect(html).toContain('Sentry');
  });

  it('does not crash when howItWorks is a string', () => {
    const data = {
      type: 'answer',
      directAnswer: 'RAG stands for...',
      howItWorks: 'This is a string step'
    };
    const msg = { role: 'assistant', content: JSON.stringify(data) };
    let html;
    expect(() => {
      html = ReactDOMServer.renderToString(<ChatMessage message={msg} onSeek={onSeek} />);
    }).not.toThrow();
    expect(html).toContain('This is a string step');
  });
});
