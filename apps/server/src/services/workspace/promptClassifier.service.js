import logger from '../../loggers/logger.js';

class PromptClassifierService {
  constructor({ geminiFlash }) {
    this.geminiFlash = geminiFlash;
  }

  /**
   * Classifies a prompt into one of the designated categories.
   * @param {string} prompt 
   * @returns {Promise<'Diagram' | 'Architecture' | 'Flowchart' | 'Infographic' | 'Illustration' | 'Concept Art' | 'Educational Visual'>}
   */
  async classify(prompt) {
    const categories = [
      'Diagram',
      'Architecture',
      'Flowchart',
      'Infographic',
      'Illustration',
      'Concept Art',
      'Educational Visual'
    ];

    const systemPrompt = `You are an AI routing classifier.
Your single goal is to analyze the user prompt and classify it into exactly one of these categories:
${categories.map(c => `- ${c}`).join('\n')}

Guidelines for classification:
- "Diagram": General conceptual diagrams, labeled nodes, boxes, relationship grids.
- "Architecture": Software engineering systems architecture, cloud infrastructure, pipeline design, tech stacks.
- "Flowchart": Sequential branches, decision matrices, processes, execution steps.
- "Infographic": Data-rich graphics, layouts with data values/metrics, structured informational panels.
- "Illustration": Hand-drawn look, detailed drawing, blueprint, digital graphics, product view.
- "Concept Art": Metaphorical creative tech graphics, artistic illustrations.
- "Educational Visual": Diagrams for learning, simple concepts breakdown illustration.

Return ONLY the name of the selected category. Do not add markdown backticks, explanations, punctuation, or any other characters.`;

    try {
      logger.info('Classifying prompt category via Gemini', { promptLength: prompt.length });
      const response = await this.geminiFlash.generateContent({
        contents: [
          { role: 'user', parts: [{ text: `Classify this prompt: "${prompt}"` }] }
        ],
        systemInstruction: systemPrompt,
      });

      const category = response.response?.text()?.trim();
      const matched = categories.find(c => c.toLowerCase() === category?.toLowerCase());
      if (matched) {
        logger.info('Prompt classified successfully', { prompt, category: matched });
        return matched;
      }
      
      // Fallback keyword matching
      const lower = prompt.toLowerCase();
      if (lower.includes('architecture')) return 'Architecture';
      if (lower.includes('flowchart')) return 'Flowchart';
      if (lower.includes('infographic')) return 'Infographic';
      if (lower.includes('diagram')) return 'Diagram';
      if (lower.includes('illustration')) return 'Illustration';
      if (lower.includes('art')) return 'Concept Art';
      
      return 'Educational Visual';
    } catch (err) {
      logger.warn('Failed to classify prompt using LLM, using keyword fallback', { error: err.message });
      const lower = prompt.toLowerCase();
      if (lower.includes('architecture')) return 'Architecture';
      if (lower.includes('flowchart')) return 'Flowchart';
      if (lower.includes('infographic')) return 'Infographic';
      if (lower.includes('diagram')) return 'Diagram';
      if (lower.includes('illustration')) return 'Illustration';
      if (lower.includes('art')) return 'Concept Art';
      return 'Educational Visual';
    }
  }

  /**
   * Resolves the target model registry code based on prompt classification.
   * @param {string} prompt 
   * @returns {Promise<'textHeavy' | 'default'>}
   */
  async resolveModel(prompt) {
    const category = await this.classify(prompt);
    const textHeavyCategories = ['Diagram', 'Architecture', 'Flowchart', 'Infographic'];
    
    if (textHeavyCategories.includes(category)) {
      return 'textHeavy';
    }
    return 'default';
  }
}

export default PromptClassifierService;
