require('dotenv').config();

const { app, globalShortcut, session, ipcMain } = require('electron');
const logger = require('./src/core/logger').createServiceLogger('MAIN');
const config = require('./src/core/config');

// Services
const ocrService = require('./src/services/ocr.service');
const speechService = require('./src/services/speech.service');
const llmService = require('./src/services/llm.service');

// Managers
const windowManager = require('./src/managers/window.manager');
const sessionManager = require('./src/managers/session.manager');

class ApplicationController {
  constructor() {
    this.isReady = false;
    this.activeSkill = 'dsa';
    this.setupStealth();
    this.setupEventHandlers();
  }

  setupStealth() {
    if (config.get('stealth.disguiseProcess')) {
      process.title = config.get('app.processTitle');
    }
    
    if (process.platform === 'darwin' && config.get('stealth.noAttachConsole')) {
      process.env.ELECTRON_NO_ATTACH_CONSOLE = '1';
      process.env.ELECTRON_NO_ASAR = '1';
    }
  }

  setupEventHandlers() {
    app.whenReady().then(() => this.onAppReady());
    app.on('window-all-closed', () => this.onWindowAllClosed());
    app.on('activate', () => this.onActivate());
    app.on('will-quit', () => this.onWillQuit());
    
    this.setupIPCHandlers();
    this.setupServiceEventHandlers();
  }

  async onAppReady() {
    logger.info('Application starting', {
      version: config.get('app.version'),
      environment: config.get('app.isDevelopment') ? 'development' : 'production',
      platform: process.platform
    });

    try {
      this.setupPermissions();
      await windowManager.initializeWindows();
      this.setupGlobalShortcuts();
      
      this.isReady = true;
      
      logger.info('Application initialized successfully', {
        windowCount: Object.keys(windowManager.getWindowStats().windows).length
      });
      
      sessionManager.addEvent('Application started');
    } catch (error) {
      logger.error('Application initialization failed', { error: error.message });
      app.quit();
    }
  }

  setupPermissions() {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = ['microphone', 'camera', 'display-capture'];
      const granted = allowedPermissions.includes(permission);
      
      logger.debug('Permission request', { permission, granted });
      callback(granted);
    });
  }

  setupGlobalShortcuts() {
    const shortcuts = {
      'CommandOrControl+Shift+S': () => this.triggerScreenshotOCR(),
      'CommandOrControl+Shift+V': () => windowManager.toggleVisibility(),
      'CommandOrControl+Shift+I': () => windowManager.toggleInteraction(),
      'CommandOrControl+Shift+C': () => windowManager.switchToWindow('chat'),
      'CommandOrControl+Shift+K': () => windowManager.switchToWindow('skills')
    };

    Object.entries(shortcuts).forEach(([accelerator, handler]) => {
      const success = globalShortcut.register(accelerator, handler);
      logger.debug('Global shortcut registered', { accelerator, success });
    });
  }

  setupServiceEventHandlers() {
    speechService.on('transcription', (text) => {
      sessionManager.addEvent('Speech transcription received', { text });
      windowManager.broadcastToAllWindows('transcription-received', { text });
    });

    speechService.on('error', (error) => {
      logger.warn('Speech service error', { error });
      windowManager.broadcastToAllWindows('speech-error', { error });
    });

    speechService.on('status', (status) => {
      windowManager.broadcastToAllWindows('speech-status', { status });
    });
  }

  setupIPCHandlers() {
    ipcMain.handle('take-screenshot', () => this.triggerScreenshotOCR());
    
    ipcMain.handle('start-speech-recognition', () => {
      speechService.startRecording();
      return speechService.getStatus();
    });
    
    ipcMain.handle('stop-speech-recognition', () => {
      speechService.stopRecording();
      return speechService.getStatus();
    });
    
    ipcMain.handle('show-all-windows', () => {
      windowManager.showAllWindows();
      return windowManager.getWindowStats();
    });
    
    ipcMain.handle('hide-all-windows', () => {
      windowManager.hideAllWindows();
      return windowManager.getWindowStats();
    });
    
    ipcMain.handle('enable-window-interaction', () => {
      windowManager.setInteractive(true);
      return windowManager.getWindowStats();
    });
    
    ipcMain.handle('disable-window-interaction', () => {
      windowManager.setInteractive(false);
      return windowManager.getWindowStats();
    });
    
    ipcMain.handle('switch-to-chat', () => {
      windowManager.switchToWindow('chat');
      return windowManager.getWindowStats();
    });
    
    ipcMain.handle('switch-to-skills', () => {
      windowManager.switchToWindow('skills');
      return windowManager.getWindowStats();
    });
    
    ipcMain.handle('get-session-history', () => {
      return sessionManager.getOptimizedHistory();
    });
    
    ipcMain.handle('clear-session-memory', () => {
      sessionManager.clear();
      windowManager.broadcastToAllWindows('session-cleared');
      return { success: true };
    });
    
    ipcMain.handle('set-gemini-api-key', (event, apiKey) => {
      llmService.updateApiKey(apiKey);
      return llmService.getStats();
    });
    
    ipcMain.handle('get-gemini-status', () => {
      return llmService.getStats();
    });
    
    ipcMain.handle('test-gemini-connection', async () => {
      return await llmService.testConnection();
    });
  }

  async triggerScreenshotOCR() {
    if (!this.isReady) {
      logger.warn('Screenshot requested before application ready');
      return;
    }

    const startTime = Date.now();
    
    try {
      sessionManager.addEvent('Screenshot OCR triggered');
      windowManager.showLLMLoading();
      
      const ocrResult = await ocrService.captureAndProcess();
      
      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        windowManager.hideLLMResponse();
        this.broadcastOCRError('No text found in screenshot');
        return;
      }

      this.broadcastOCRSuccess(ocrResult);
      
      const sessionHistory = sessionManager.getOptimizedHistory();
      await this.processWithLLM(ocrResult.text, sessionHistory);
      
    } catch (error) {
      logger.error('Screenshot OCR process failed', { 
        error: error.message,
        duration: Date.now() - startTime
      });
      
      windowManager.hideLLMResponse();
      this.broadcastOCRError(error.message);
      sessionManager.addEvent('Screenshot OCR failed', { error: error.message });
    }
  }

  async processWithLLM(text, sessionHistory) {
    try {
      sessionManager.addEvent('LLM processing started', { 
        skill: this.activeSkill,
        textLength: text.length 
      });

      const llmResult = await llmService.processTextWithSkill(
        text, 
        this.activeSkill, 
        sessionHistory.recent
      );

      windowManager.showLLMResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback
      });

      sessionManager.addEvent('LLM processing completed', {
        skill: this.activeSkill,
        responseLength: llmResult.response.length,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback
      });

      this.broadcastLLMSuccess(llmResult);
      
    } catch (error) {
      logger.error('LLM processing failed', { 
        error: error.message,
        skill: this.activeSkill 
      });
      
      windowManager.hideLLMResponse();
      sessionManager.addEvent('LLM processing failed', { 
        error: error.message,
        skill: this.activeSkill 
      });
      
      this.broadcastLLMError(error.message);
    }
  }

  broadcastOCRSuccess(ocrResult) {
    windowManager.broadcastToAllWindows('ocr-completed', {
      text: ocrResult.text,
      metadata: ocrResult.metadata
    });
  }

  broadcastOCRError(errorMessage) {
    windowManager.broadcastToAllWindows('ocr-error', {
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  broadcastLLMSuccess(llmResult) {
    windowManager.broadcastToAllWindows('llm-response', {
      response: llmResult.response,
      metadata: llmResult.metadata
    });
  }

  broadcastLLMError(errorMessage) {
    windowManager.broadcastToAllWindows('llm-error', {
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  onWindowAllClosed() {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  onActivate() {
    if (!this.isReady) {
      this.onAppReady();
    }
  }

  onWillQuit() {
    globalShortcut.unregisterAll();
    windowManager.destroyAllWindows();
    
    const sessionStats = sessionManager.getMemoryUsage();
    logger.info('Application shutting down', {
      sessionEvents: sessionStats.eventCount,
      sessionSize: sessionStats.approximateSize
    });
  }
}

new ApplicationController(); 