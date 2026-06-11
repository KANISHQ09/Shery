import logger from '../../loggers/logger.js';
import config from '../../config/env.js';
import AppError from '../../utils/AppError.js';

class ImageGenerationService {
  constructor({
    geminiFlash,
    workspaceStorageService,
    workspaceOutputRepository,
    mediaProviderService,
    promptClassifierService,
    generationLogRepository,
  }) {
    this.geminiFlash = geminiFlash;
    this.storageService = workspaceStorageService;
    this.outputRepository = workspaceOutputRepository;
    this.mediaProviderService = mediaProviderService;
    this.promptClassifierService = promptClassifierService;
    this.generationLogRepository = generationLogRepository;
  }

  async generateVisual(workspaceId, { prompt, visualType, artifactId, version, sourceDocuments, provider, userId }) {
    if (!prompt) {
      throw new AppError('Prompt is required for generating a visual.', 400);
    }

    const startTime = Date.now();
    let modelUsed = config.imageModel || 'gemini-2.5-flash-image-preview';
    let finalProvider = provider || config.imageProvider || 'gemini';

    try {
      // 1. Expand and optimize prompt based on visualType using LLM
      const optimizedPrompt = await this._optimizePrompt(prompt, visualType);
      logger.info('Optimized visual prompt generated', { visualType, optimizedPrompt });

      // 2. Classify prompt to determine correct image model (default vs textHeavy)
      const modelCode = await this.promptClassifierService.resolveModel(prompt);

      // 3. Generate image buffer via provider abstraction
      const { buffer, provider: usedProvider, model } = await this.mediaProviderService.generateImage(optimizedPrompt, {
        provider: finalProvider,
        modelCode,
      });
      finalProvider = usedProvider;
      modelUsed = model;

      // 4. Save file to storage
      const fileName = `version_${version}.png`;
      const storagePath = await this.storageService.saveFile(workspaceId, artifactId, fileName, buffer, {
        contentType: 'image/png',
      });

      // 5. Get public URL (or fallback to signed/local download path)
      let downloadUrl = await this.storageService.getPublicUrl(workspaceId, artifactId, fileName);
      if (!downloadUrl) {
        // For local storage, construct backend route download url
        downloadUrl = `/api/workspaces/${workspaceId}/artifacts/${artifactId}/versions/${version}/download`;
      }

      const duration = Date.now() - startTime;
      await this.generationLogRepository.log({
        workspaceId,
        userId,
        artifactType: 'diagram',
        provider: finalProvider,
        model: modelUsed,
        generationDuration: duration,
        generationStatus: 'success',
        promptLength: prompt.length,
      });

      return {
        storagePath,
        downloadUrl,
        optimizedPrompt,
        provider: finalProvider,
        model: modelUsed,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      await this.generationLogRepository.log({
        workspaceId,
        userId,
        artifactType: 'diagram',
        provider: finalProvider,
        model: modelUsed,
        generationDuration: duration,
        generationStatus: 'failed',
        promptLength: prompt.length,
      });
      throw err;
    }
  }

  async _optimizePrompt(userPrompt, visualType = 'Concept Diagram') {
    const systemPrompt = `You are a professional prompt engineer specializing in technical visual generation for flowcharts, mind maps, infographics, concept diagrams, illustrations, and workflow graphics.
Your job is to expand the user's technical input into a highly detailed, visually clean, aesthetic prompt optimized for modern visual image models.

Follow these rules based on the selected visual type:
1. "Concept Diagram": Isometric 3D presentation layout, crisp labeled boxes for core components, modern tech colors (pastel/neon offsets), dark mode #0B0C10 background, smooth anti-aliased vectors.
2. "Architecture Diagram" / "Process Diagram": Clear multi-layered systems, data pipelines represented by clean arrows, technical system nodes (e.g., "Vector DB", "LLM", "Embedding API") clearly outlined, professional software engineering schema aesthetic.
3. "Flowchart": Standard vector shapes (processes as rectangles, decisions as diamonds), labeled branching lines (Yes/No), solid modern background, neat layout flow.
4. "Infographic" / "Data Infographic" / "Learning Infographic" / "Business Infographic": Multi-column vertical grid, key data metrics styled in large modern typography, visual icon indicators, clear sections, engaging visual hierarchy.
5. "Mind Map": Central root node branching outward into radial sub-concept nodes with clean curved connection curves, structured nodes with mini text labels.
6. "Educational Illustration" / "Technical Illustration" / "Product Visual": Sleek digital design, clean line art, professional blueprint or detailed illustration detailing components, informative and aesthetic presentation.
7. "Hero Illustration" / "Concept Art": Creative high-fidelity metaphorical tech artwork, vibrant color scheme, glowing visual elements, sleek 3D graphic design.

Output ONLY the expanded prompt text. Do not include headers, quotes, or preambles. Ensure high readability for all text boxes in the diagram.`;

    try {
      const response = await this.geminiFlash.generateContent({
        contents: [
          { role: 'user', parts: [{ text: `Expand the following prompt: "${userPrompt}" for a visual type: "${visualType}"` }] }
        ],
        systemInstruction: systemPrompt,
      });

      const expanded = response?.response?.text();
      return expanded ? expanded.trim() : `${visualType} showing: ${userPrompt}, modern technical vector style`;
    } catch (error) {
      logger.warn('Failed to expand prompt via LLM, using fallback', { error: error.message });
      return `${visualType} showing: ${userPrompt}, high resolution, technical schematic diagram style, dark mode`;
    }
  }
}

export default ImageGenerationService;
