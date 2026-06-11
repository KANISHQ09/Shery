import logger from '../../loggers/logger.js';
import AppError from '../../utils/AppError.js';

class AudioGenerationService {
  constructor({ audioProvider, vectorSearchService, contextManagerService, generationLogRepository }) {
    this.audioProvider = audioProvider;
    this.vectorSearch = vectorSearchService;
    this.contextManager = contextManagerService;
    this.generationLogRepository = generationLogRepository;
  }

  /**
   * Generates a grounded audio script and logs the details to analytics.
   * @param {string} workspaceId 
   * @param {object} params 
   */
  async generateAudio(workspaceId, { prompt, audioType = 'podcast', voice, provider, artifactId, version, sourceDocuments, userId }) {
    if (!prompt) {
      throw new AppError('Prompt/Topic is required to generate an audio summary.', 400);
    }

    logger.info('Starting audio summary script generation pipeline', { workspaceId, audioType, version });

    const startTime = Date.now();
    const resolvedModel = 'gemini-2.5-flash';
    const finalProvider = 'gemini';

    try {
      // 1. Retrieve grounded context from Vector DB
      const broadSearchQuery = prompt;
      const matchedChunks = await this.vectorSearch.hybridSearch(workspaceId, broadSearchQuery, {
        topK: 25,
        sourceIds: sourceDocuments?.length ? sourceDocuments : undefined,
      });

      if (!matchedChunks || matchedChunks.length === 0) {
        throw new AppError('Could not retrieve any content from the uploaded documents. Please upload sources first.', 400);
      }

      const { contextText, sourcesUsed } = await this.contextManager.assembleContext(matchedChunks, broadSearchQuery, {
        maxTokens: 6000,
        diversityWeight: 0.6,
      });

      // 2. Synthesize audio script based on type
      const script = await this._synthesizeScript(prompt, contextText, audioType);
      logger.info('Audio script synthesized successfully', { scriptLength: script.length });

      // Log success metrics
      const duration = Date.now() - startTime;
      await this.generationLogRepository.log({
        workspaceId,
        userId,
        artifactType: 'audio',
        provider: finalProvider,
        model: resolvedModel,
        generationDuration: duration,
        generationStatus: 'success',
        promptLength: prompt.length,
      });

      return {
        downloadUrl: null, // script only, no TTS MP3 file compilation
        script,
        provider: finalProvider,
        model: resolvedModel,
        sourcesUsed,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      await this.generationLogRepository.log({
        workspaceId,
        userId,
        artifactType: 'audio',
        provider: finalProvider,
        model: resolvedModel,
        generationDuration: duration,
        generationStatus: 'failed',
        promptLength: prompt.length,
      });
      throw err;
    }
  }

  /**
   * Generates a script via Audio Provider (Gemini 2.5 Flash) based on selected audio type.
   */
  async _synthesizeScript(userPrompt, contextText, audioType) {
    let styleGuide = '';

    if (audioType === 'podcast') {
      styleGuide = `Format this as an engaging, casual NotebookLM-style dialogue.
Synthesize the conversation as a single continuous narrative suitable for reading by a single voice (or simple back-and-forth flow).
Use engaging, conversational language, explanations of complex details, and smooth topic transitions.`;
    } else if (audioType === 'lecture') {
      styleGuide = `Format this as a structured lecture explanation.
The tone should be that of an expert teacher explaining the concepts in a clear, friendly, educational, and structured manner.
Break down formulas or processes step-by-step.`;
    } else if (audioType === 'study_revision') {
      styleGuide = `Format this as a quick study revision flash briefing.
Focus on high-speed takeaways, concise definitions of terms, and key principles.
Keep it extremely punchy and memorable.`;
    } else if (audioType === 'executive_summary') {
      styleGuide = `Format this as an executive summary briefing for business professionals.
The tone should be objective, analytical, concise, and focused on key facts, numbers, and decisions.`;
    }

    const systemPrompt = `You are a professional educational script writer and voice director.
Your goal is to digest the grounded documents and synthesize a highly engaging audio narration script explaining the requested topic.

RULES:
1. Ground all facts strictly in the provided context. Do not hallucinate or add external references.
2. The output script should be clean and optimized for Text-to-Speech (TTS) reading.
3. Keep the script length around 400 to 800 words (approx. 3-5 minutes of spoken content).
4. Output ONLY the actual script text that will be spoken. Do not include quotes, bracketed notes, or introductory/explanatory text.

${styleGuide}`;

    const response = await this.audioProvider.generate({
      contents: [
        { role: 'user', parts: [{ text: `Write an audio script for a "${audioType}" explaining: "${userPrompt}" using the following source documents context:\n\n${contextText}` }] }
      ],
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.4,
      }
    }, { mode: 'script' });

    const scriptText = response?.text;
    if (!scriptText) {
      throw new Error('Empty script response generated from LLM.');
    }
    return scriptText.trim();
  }
}

export default AudioGenerationService;
