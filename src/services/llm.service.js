const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class LLMService {
  constructor() {
    this.client = null;
    this.model = null;
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    
    this.initializeClient();
  }

  initializeClient() {
    const apiKey = config.getApiKey('GEMINI');
    
    if (!apiKey || apiKey === 'your-api-key-here') {
      logger.warn('Gemini API key not configured', { 
        keyExists: !!apiKey,
        isPlaceholder: apiKey === 'your-api-key-here'
      });
      return;
    }

    try {
      this.client = new GoogleGenerativeAI(apiKey);
      this.model = this.client.getGenerativeModel({ 
        model: config.get('llm.gemini.model') 
      });
      this.isInitialized = true;
      
      logger.info('Gemini AI client initialized successfully', {
        model: config.get('llm.gemini.model')
      });
    } catch (error) {
      logger.error('Failed to initialize Gemini client', { 
        error: error.message 
      });
    }
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = []) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing text with LLM', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        requestId: this.requestCount
      });

      const geminiRequest = this.buildGeminiRequest(text, activeSkill, sessionMemory);
      const response = await this.executeRequest(geminiRequest);
      
      logger.logPerformance('LLM text processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: response.length,
        requestId: this.requestCount
      });

      return {
        response,
        metadata: {
          skill: activeSkill,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateFallbackResponse(text, activeSkill);
      }
      
      throw error;
    }
  }

  buildGeminiRequest(text, activeSkill, sessionMemory) {
    const requestComponents = promptLoader.getRequestComponents(
      activeSkill, 
      text, 
      sessionMemory
    );

    const request = {
      contents: [],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topK: 40,
        topP: 0.95
      }
    };

    if (requestComponents.shouldUseModelMemory && requestComponents.skillPrompt) {
      request.systemInstruction = {
        parts: [{ text: requestComponents.skillPrompt }]
      };
      
      logger.debug('Using system instruction for skill', {
        skill: activeSkill,
        promptLength: requestComponents.skillPrompt.length
      });
    }

    request.contents.push({
      role: 'user',
      parts: [{ text: this.formatUserMessage(text, activeSkill) }]
    });

    return request;
  }

  formatUserMessage(text, activeSkill) {
    return `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`;
  }

  async executeRequest(geminiRequest) {
    const maxRetries = config.get('llm.gemini.maxRetries');
    const timeout = config.get('llm.gemini.timeout');
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        );
        
        const requestPromise = this.model.generateContent(geminiRequest);
        const result = await Promise.race([requestPromise, timeoutPromise]);
        
        if (!result.response) {
          throw new Error('Empty response from Gemini API');
        }

        const responseText = result.response.text();
        
        if (!responseText || responseText.trim().length === 0) {
          throw new Error('Empty text content in Gemini response');
        }

        logger.debug('Gemini API request successful', {
          attempt,
          responseLength: responseText.length
        });

        return responseText.trim();
      } catch (error) {
        logger.warn(`Gemini API attempt ${attempt} failed`, {
          error: error.message,
          remainingAttempts: maxRetries - attempt
        });

        if (attempt === maxRetries) {
          throw new Error(`Gemini API failed after ${maxRetries} attempts: ${error.message}`);
        }

        await this.delay(1000 * attempt);
      }
    }
  }

  generateFallbackResponse(text, activeSkill) {
    logger.info('Generating fallback response', { activeSkill });

    const fallbackResponses = {
      'dsa': 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      'system-design': 'For this system design question, consider scalability, reliability, and the trade-offs between different architectural approaches.',
      'programming': 'This looks like a programming challenge. Focus on understanding the requirements, edge cases, and optimal time/space complexity.',
      'default': 'I can help analyze this content. Please ensure your Gemini API key is properly configured for detailed analysis.'
    };

    const response = fallbackResponses[activeSkill] || fallbackResponses.default;
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true
      }
    };
  }

  async testConnection() {
    if (!this.isInitialized) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      const testRequest = {
        contents: [{
          role: 'user',
          parts: [{ text: 'Test connection. Please respond with "OK".' }]
        }]
      };

      const result = await this.model.generateContent(testRequest);
      const response = result.response.text();
      
      logger.info('Connection test successful', { response });
      
      return { 
        success: true, 
        response: response.trim(),
        latency: Date.now()
      };
    } catch (error) {
      logger.error('Connection test failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  updateApiKey(newApiKey) {
    process.env.GEMINI_API_KEY = newApiKey;
    this.isInitialized = false;
    this.initializeClient();
    
    logger.info('API key updated and client reinitialized');
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      config: config.get('llm.gemini')
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new LLMService(); 