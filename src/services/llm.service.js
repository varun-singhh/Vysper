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
      
      // Try standard method first
      let response;
      try {
        response = await this.executeRequest(geminiRequest);
      } catch (error) {
        // If fetch failed, try alternative method
        if (error.message.includes('fetch failed') && config.get('llm.gemini.enableFallbackMethod')) {
          logger.warn('Standard request failed, trying alternative method', {
            error: error.message,
            requestId: this.requestCount
          });
          response = await this.executeAlternativeRequest(geminiRequest);
        } else {
          throw error;
        }
      }
      
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
    
    // Add request debugging
    logger.debug('Executing Gemini request', {
      hasModel: !!this.model,
      hasClient: !!this.client,
      requestKeys: Object.keys(geminiRequest),
      timeout,
      maxRetries,
      nodeVersion: process.version,
      platform: process.platform
    });
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Pre-flight check
        await this.performPreflightCheck();
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        );
        
        logger.debug(`Gemini API attempt ${attempt} starting`, {
          timestamp: new Date().toISOString(),
          timeout
        });
        
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
        const errorInfo = this.analyzeError(error);
        
        // Enhanced error logging for fetch failures
        if (errorInfo.type === 'NETWORK_ERROR') {
          logger.error('Network error details', {
            attempt,
            errorMessage: error.message,
            errorStack: error.stack,
            errorName: error.name,
            nodeEnv: process.env.NODE_ENV,
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome,
            nodeVersion: process.versions.node,
            userAgent: this.getUserAgent()
          });
        }
        
        logger.warn(`Gemini API attempt ${attempt} failed`, {
          error: error.message,
          errorType: errorInfo.type,
          isNetworkError: errorInfo.isNetworkError,
          suggestedAction: errorInfo.suggestedAction,
          remainingAttempts: maxRetries - attempt
        });

        if (attempt === maxRetries) {
          const finalError = new Error(`Gemini API failed after ${maxRetries} attempts: ${error.message}`);
          finalError.errorAnalysis = errorInfo;
          finalError.originalError = error;
          throw finalError;
        }

        // Use exponential backoff with jitter for network errors
        const baseDelay = errorInfo.isNetworkError ? 2000 : 1000;
        const delay = baseDelay * attempt + Math.random() * 1000;
        
        logger.debug(`Waiting ${delay}ms before retry ${attempt + 1}`, {
          baseDelay,
          isNetworkError: errorInfo.isNetworkError
        });
        
        await this.delay(delay);
      }
    }
  }

  async performPreflightCheck() {
    // Quick connectivity check
    try {
      const startTime = Date.now();
      await this.testNetworkConnection({ 
        host: 'generativelanguage.googleapis.com', 
        port: 443, 
        name: 'Gemini API Endpoint' 
      });
      const latency = Date.now() - startTime;
      
      logger.debug('Preflight check passed', { latency });
    } catch (error) {
      logger.warn('Preflight check failed', { 
        error: error.message,
        suggestion: 'Network connectivity issue detected before API call'
      });
      // Don't throw here - let the actual API call fail with more detail
    }
  }

  getUserAgent() {
    try {
      // Try to get user agent from Electron if available
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        return navigator.userAgent;
      }
      return `Node.js/${process.version} (${process.platform}; ${process.arch})`;
    } catch {
      return 'Unknown';
    }
  }

  analyzeError(error) {
    const errorMessage = error.message.toLowerCase();
    
    // Network connectivity errors
    if (errorMessage.includes('fetch failed') || 
        errorMessage.includes('network error') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('timeout')) {
      return {
        type: 'NETWORK_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check internet connection and firewall settings'
      };
    }
    
    // API key errors
    if (errorMessage.includes('unauthorized') || 
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('forbidden')) {
      return {
        type: 'AUTH_ERROR',
        isNetworkError: false,
        suggestedAction: 'Verify Gemini API key configuration'
      };
    }
    
    // Rate limiting
    if (errorMessage.includes('quota') || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests')) {
      return {
        type: 'RATE_LIMIT_ERROR',
        isNetworkError: false,
        suggestedAction: 'Wait before retrying or check API quota'
      };
    }
    
    // Timeout errors
    if (errorMessage.includes('request timeout')) {
      return {
        type: 'TIMEOUT_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check network latency or increase timeout'
      };
    }
    
    return {
      type: 'UNKNOWN_ERROR',
      isNetworkError: false,
      suggestedAction: 'Check logs for more details'
    };
  }

  async checkNetworkConnectivity() {
    const connectivityTests = [
      { host: 'google.com', port: 443, name: 'Google (HTTPS)' },
      { host: 'generativelanguage.googleapis.com', port: 443, name: 'Gemini API Endpoint' }
    ];

    const results = await Promise.allSettled(
      connectivityTests.map(test => this.testNetworkConnection(test))
    );

    const connectivity = {
      timestamp: new Date().toISOString(),
      tests: results.map((result, index) => ({
        ...connectivityTests[index],
        success: result.status === 'fulfilled' && result.value,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    };

    logger.info('Network connectivity check completed', connectivity);
    return connectivity;
  }

  async testNetworkConnection({ host, port, name }) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${host}:${port}`));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection failed to ${host}:${port}: ${error.message}`));
      });

      socket.connect(port, host);
    });
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
      // First check network connectivity
      const networkCheck = await this.checkNetworkConnectivity();
      const hasNetworkIssues = networkCheck.tests.some(test => !test.success);
      
      if (hasNetworkIssues) {
        logger.warn('Network connectivity issues detected', networkCheck);
      }

      const testRequest = {
        contents: [{
          role: 'user',
          parts: [{ text: 'Test connection. Please respond with "OK".' }]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 10
        }
      };

      const startTime = Date.now();
      const result = await this.model.generateContent(testRequest);
      const latency = Date.now() - startTime;
      const response = result.response.text();
      
      logger.info('Connection test successful', { 
        response, 
        latency,
        networkCheck: hasNetworkIssues ? 'issues_detected' : 'healthy'
      });
      
      return { 
        success: true, 
        response: response.trim(),
        latency,
        networkConnectivity: networkCheck
      };
    } catch (error) {
      const errorAnalysis = this.analyzeError(error);
      logger.error('Connection test failed', { 
        error: error.message,
        errorAnalysis
      });
      
      return { 
        success: false, 
        error: error.message,
        errorAnalysis,
        networkConnectivity: await this.checkNetworkConnectivity().catch(() => null)
      };
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

  async executeAlternativeRequest(geminiRequest) {
    const https = require('https');
    const apiKey = config.getApiKey('GEMINI');
    const model = config.get('llm.gemini.model');
    
    logger.info('Using alternative HTTPS request method');
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const postData = JSON.stringify(geminiRequest);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': this.getUserAgent()
      },
      timeout: config.get('llm.gemini.timeout')
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            
            const response = JSON.parse(data);
            
            if (!response.candidates || !response.candidates[0] || !response.candidates[0].content) {
              reject(new Error('Invalid response structure from Gemini API'));
              return;
            }
            
            const text = response.candidates[0].content.parts[0].text;
            
            if (!text || text.trim().length === 0) {
              reject(new Error('Empty text content in Gemini response'));
              return;
            }
            
            logger.info('Alternative request successful', {
              responseLength: text.length,
              statusCode: res.statusCode
            });
            
            resolve(text.trim());
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Alternative request failed: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Alternative request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }
}

module.exports = new LLMService(); 