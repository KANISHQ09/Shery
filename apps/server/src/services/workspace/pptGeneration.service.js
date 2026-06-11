import logger from '../../loggers/logger.js';
import AppError from '../../utils/AppError.js';
import pptxgen from 'pptxgenjs';

class PptGenerationService {
  constructor({ presentationProvider, vectorSearchService, contextManagerService, workspaceStorageService, workspaceOutputRepository, generationLogRepository }) {
    this.presentationProvider = presentationProvider;
    this.vectorSearch = vectorSearchService;
    this.contextManager = contextManagerService;
    this.storageService = workspaceStorageService;
    this.outputRepository = workspaceOutputRepository;
    this.generationLogRepository = generationLogRepository;
  }

  async generateOutline(workspaceId, { prompt, slideCount = 10, sourceDocuments, audience = 'General', presentationType = 'Study Deck', userId }) {
    if (!prompt) {
      throw new AppError('Prompt is required to generate a presentation outline.', 400);
    }

    logger.info('Generating presentation outline', { workspaceId, slideCount, sourceDocuments, audience, presentationType });

    const startTime = Date.now();
    const resolvedModel = 'gemini-1.5-flash';
    const finalProvider = 'gemini';

    try {
      // 1. Ingest grounded context
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

      // Custom formatting guide based on presentation style
      let typeInstructions = '';
      if (presentationType === 'Investor Pitch') {
        typeInstructions = '- Structure slides to detail: Problem, Solution, Market/Tech Opportunity, Business Value Proposition, Team/Timeline, and Target Milestones.\n- Make bullets punchy with measurable metrics.';
      } else if (presentationType === 'Research Report') {
        typeInstructions = '- Structure slides like an academic report: Introduction, Methodology, Data Analysis/Findings, Discussion, and Key Conclusions.';
      } else if (presentationType === 'Technical Architecture') {
        typeInstructions = '- Detail system schemas, data flows, database pipelines, API routing layers, security mechanisms, and engineering trade-offs.';
      } else if (presentationType === 'Product Demo') {
        typeInstructions = '- Focus on user-facing features, step-by-step walkthrough of features, user benefits, and clear action results.';
      } else if (presentationType === 'Business Proposal') {
        typeInstructions = '- Cover Executive Summary, Scope of Work, Projected Deliverables, Implementation Timeline, and Pricing/Resource breakdown.';
      } else {
        typeInstructions = '- Structure for educational learning: define concepts first, build with step-by-step progression, use analogies, and include review questions.';
      }

      // 2. Synthesize outline JSON using Gemini
      const systemPrompt = `You are a professional presentation content architect and pitch developer.
Your goal is to digest the grounded documents and synthesize a highly structured presentation outline of exactly ${slideCount} slides covering the requested topic.

AUDIENCE: ${audience}
PRESENTATION STYLE: ${presentationType}

STYLE INSTRUCTIONS:
${typeInstructions}
- Tailor the depth, tone, and technical terminology specifically for the target audience: "${audience}".

Return ONLY a valid JSON array of slide objects. Do not wrap in markdown code blocks like \`\`\`json.
Ensure the JSON array exactly follows this schema:
[
  {
    "slideNumber": 1,
    "title": "Title of Slide",
    "description": "Short metadata describing the goal of this slide.",
    "bulletPoints": [
      "Key bullet point 1 summarizing details",
      "Key bullet point 2 summarizing details",
      "Key bullet point 3 summarizing details"
    ],
    "speakerNotes": "Present notes that the speaker will read aloud for this slide."
  }
]

Ground all slide content in the provided context documents. If the user asks for concepts not covered in the context, do not hallucinate; restrict contents to available source facts.`;

      const response = await this.presentationProvider.generate({
        contents: [
          { role: 'user', parts: [{ text: `Create a presentation outline of ${slideCount} slides explaining the topic: "${prompt}" using the following source documents context:\n\n${contextText}` }] }
        ],
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.25,
          responseMimeType: 'application/json'
        }
      });

      let content = response?.text || '[]';
      let slides = [];
      try {
        const jsonMatch = content.trim().match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          slides = JSON.parse(jsonMatch[0]);
        } else {
          slides = JSON.parse(content);
        }
      } catch (parseErr) {
        logger.error('Failed to parse outline JSON from Gemini response', { error: parseErr.message, content });
        throw new AppError('Failed to generate a clean structured outline. Please try again.', 500);
      }

      const duration = Date.now() - startTime;
      await this.generationLogRepository.log({
        workspaceId,
        userId,
        artifactType: 'presentation',
        provider: finalProvider,
        model: resolvedModel,
        generationDuration: duration,
        generationStatus: 'success',
        promptLength: prompt.length,
      });

      return {
        slides,
        sourcesUsed,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      await this.generationLogRepository.log({
        workspaceId,
        userId,
        artifactType: 'presentation',
        provider: finalProvider,
        model: resolvedModel,
        generationDuration: duration,
        generationStatus: 'failed',
        promptLength: prompt.length,
      });
      throw err;
    }
  }

  async compilePresentation(workspaceId, { outline, theme = 'Professional', artifactId, version }) {
    if (!outline || !Array.isArray(outline)) {
      throw new AppError('A valid slides outline array is required for compilation.', 400);
    }

    logger.info('Compiling presentation slide deck', { workspaceId, theme, artifactId, version });

    // 1. Configure visual theme styles
    const THEME_STYLES = {
      Professional: {
        fontFace: 'Arial',
        bgColor: 'FFFFFF',
        textColor: '111111',
        primaryColor: '003366',
        secondaryColor: '708090',
      },
      Modern: {
        fontFace: 'Arial', // Default sans-serif fallback for standard office opening
        bgColor: 'F9FAFB',
        textColor: '1F2937',
        primaryColor: '4F46E5',
        secondaryColor: 'D946EF',
      },
      'Dark Tech': {
        fontFace: 'Courier New',
        bgColor: '0B0C10',
        textColor: 'E2E8F0',
        primaryColor: 'FF6B00',
        secondaryColor: '2A3A40',
      },
      'Startup Pitch': {
        fontFace: 'Arial',
        bgColor: 'FAF9F6',
        textColor: '2D3748',
        primaryColor: 'FF5A5F',
        secondaryColor: '3EB489',
      },
      Academic: {
        fontFace: 'Georgia',
        bgColor: 'FDFDFD',
        textColor: '1A1A1A',
        primaryColor: 'A51C30',
        secondaryColor: '4A5568',
      }
    };

    const style = THEME_STYLES[theme] || THEME_STYLES.Professional;

    // 2. Instantiate pptxgenjs
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_16x9';

    // 3. Render slides
    for (let idx = 0; idx < outline.length; idx++) {
      const slideData = outline[idx];
      const slide = pres.addSlide();

      // Configure slide background color
      slide.background = { fill: style.bgColor };

      // Header block or Title layout
      const isTitleSlide = idx === 0;

      if (isTitleSlide) {
        // Render Title slide layout
        slide.addText(slideData.title || 'Presentation Title', {
          x: 1.0,
          y: 2.0,
          w: '80%',
          h: 1.5,
          fontFace: style.fontFace,
          fontSize: 40,
          color: style.primaryColor,
          bold: true,
          align: 'center',
        });

        if (slideData.bulletPoints && slideData.bulletPoints.length > 0) {
          const subtitleText = slideData.bulletPoints.join('\n');
          slide.addText(subtitleText, {
            x: 1.0,
            y: 3.8,
            w: '80%',
            h: 1.5,
            fontFace: style.fontFace,
            fontSize: 16,
            color: style.textColor,
            align: 'center',
          });
        }
      } else {
        // Standard Content Slide layout
        // Add slide title banner
        slide.addText(slideData.title || `Slide ${idx + 1}`, {
          x: 0.8,
          y: 0.5,
          w: '80%',
          h: 0.8,
          fontFace: style.fontFace,
          fontSize: 28,
          color: style.primaryColor,
          bold: true,
        });

        // Add visual horizontal accent line
        slide.addShape(pres.ShapeType.rect, {
          x: 0.8,
          y: 1.25,
          w: 8.4,
          h: 0.05,
          fill: { color: style.secondaryColor },
        });

        // Add slide bullet points list
        const bullets = slideData.bulletPoints || [];
        if (bullets.length > 0) {
          slide.addText(
            bullets.map((b) => ({ text: b, options: { bullet: true, indentLevel: 0 } })),
            {
              x: 0.8,
              y: 1.6,
              w: 8.4,
              h: 4.5,
              fontFace: style.fontFace,
              fontSize: 15,
              color: style.textColor,
              lineSpacing: 26,
            }
          );
        }
      }

      // Add speaker notes if present
      if (slideData.speakerNotes) {
        slide.addNotes(slideData.speakerNotes);
      }
    }

    // 4. Compile binary PPTX buffer
    const buffer = await pres.write({ outputType: 'nodebuffer' });

    // 5. Save PPTX to storage
    const fileName = `version_${version}.pptx`;
    const storagePath = await this.storageService.saveFile(workspaceId, artifactId, fileName, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    // 6. Get public URL (or fallback to signed/local download path)
    let downloadUrl = await this.storageService.getPublicUrl(workspaceId, artifactId, fileName);
    if (!downloadUrl) {
      downloadUrl = `/api/workspaces/${workspaceId}/artifacts/${artifactId}/versions/${version}/download`;
    }

    return {
      storagePath,
      downloadUrl,
    };
  }
}

export default PptGenerationService;
