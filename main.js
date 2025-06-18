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
    
    // Window configurations for reference
    this.windowConfigs = {
      main: { title: 'Wysper' },
      chat: { title: 'Chat' },
      skills: { title: 'Skills' },
      llmResponse: { title: 'AI Response' },
      settings: { title: 'Settings' }
    };
    
    this.setupStealth();
    this.setupEventHandlers();
  }

  setupStealth() {
    if (config.get('stealth.disguiseProcess')) {
      process.title = config.get('app.processTitle');
    }
    
    // Set default stealth app name early
    app.setName('Terminal '); // Default to Terminal stealth mode
    process.title = 'Terminal ';
    
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
    // Force stealth mode IMMEDIATELY when app is ready
    app.setName('Terminal ');
    process.title = 'Terminal ';
    
    logger.info('Application starting', {
      version: config.get('app.version'),
      environment: config.get('app.isDevelopment') ? 'development' : 'production',
      platform: process.platform
    });

    try {
      this.setupPermissions();
      await windowManager.initializeWindows();
      this.setupGlobalShortcuts();
      
      // Initialize default stealth mode with terminal icon
      this.updateAppIcon('terminal');
      
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
      'CommandOrControl+Shift+K': () => windowManager.switchToWindow('skills'),
      'Alt+A': () => windowManager.toggleInteraction()
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
    
    ipcMain.handle('resize-window', (event, { width, height }) => {
      const mainWindow = windowManager.getWindow('main');
      if (mainWindow) {
        mainWindow.setSize(width, height);
        logger.debug('Main window resized', { width, height });
      }
      return { success: true };
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

    // Settings handlers
    ipcMain.handle('show-settings', () => {
      windowManager.showSettings();
      return { success: true };
    });

    ipcMain.handle('get-settings', () => {
      return this.getSettings();
    });

    ipcMain.handle('save-settings', (event, settings) => {
      return this.saveSettings(settings);
    });

    ipcMain.handle('update-app-icon', (event, iconKey) => {
      return this.updateAppIcon(iconKey);
    });

    ipcMain.handle('update-active-skill', (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows('skill-changed', { skill });
      return { success: true };
    });

    ipcMain.handle('restart-app-for-stealth', () => {
      // Force restart the app to ensure stealth name changes take effect
      const { app } = require('electron');
      app.relaunch();
      app.exit();
    });

    ipcMain.handle('close-window', (event) => {
      const webContents = event.sender;
      const window = windowManager.windows.forEach((win, type) => {
        if (win.webContents === webContents) {
          win.hide();
          return true;
        }
      });
      return { success: true };
    });

    // LLM window specific handlers
    ipcMain.handle('expand-llm-window', (event, contentMetrics) => {
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    ipcMain.handle('resize-llm-window-for-content', (event, contentMetrics) => {
      // Use the same expansion logic for now, can be enhanced later
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
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

      logger.info('LLM processing completed, showing response', {
        responseLength: llmResult.response.length,
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        responsePreview: llmResult.response.substring(0, 200) + '...'
      });

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
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill // Add the current active skill to the top level
    };
    
    logger.info('Broadcasting LLM success to all windows', {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      dataKeys: Object.keys(broadcastData),
      responsePreview: llmResult.response.substring(0, 100) + '...'
    });
    
    windowManager.broadcastToAllWindows('llm-response', broadcastData);
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

  getSettings() {
    return {
      codingLanguage: this.codingLanguage || 'javascript',
      activeSkill: this.activeSkill || 'dsa',
      appIcon: this.appIcon || 'terminal'
    };
  }

  saveSettings(settings) {
    try {
      // Update application settings
      if (settings.codingLanguage) {
        this.codingLanguage = settings.codingLanguage;
      }
      if (settings.activeSkill) {
        this.activeSkill = settings.activeSkill;
      }
      if (settings.appIcon) {
        this.appIcon = settings.appIcon;
      }

      // Persist settings to file or config
      this.persistSettings(settings);

      logger.info('Settings saved successfully', settings);
      return { success: true };
    } catch (error) {
      logger.error('Failed to save settings', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  persistSettings(settings) {
    // You can extend this to save to a file or database
    // For now, we'll just keep them in memory
    logger.debug('Settings persisted', settings);
  }

  updateAppIcon(iconKey) {
    try {
      const { app } = require('electron');
      const path = require('path');
      
      // Icon mapping for available icons in assests/icons folder
      const iconPaths = {
        'terminal': 'assests/icons/terminal.png',
        'activity': 'assests/icons/activity.png',
        'settings': 'assests/icons/settings.png'
      };

      // App name mapping for stealth mode
      const appNames = {
        'terminal': 'Terminal ',
        'activity': 'Activity Monitor ',
        'settings': 'System Settings '
      };

      const iconPath = iconPaths[iconKey];
      const appName = appNames[iconKey];
      
      if (iconPath && require('fs').existsSync(iconPath)) {
        const fullIconPath = path.resolve(iconPath);
        
        // Set app icon for dock/taskbar
        if (process.platform === 'darwin') {
          // macOS - update dock icon
          app.dock.setIcon(fullIconPath);
        } else {
          // Windows/Linux - update window icons
          const windows = windowManager.windows;
          windows.forEach(window => {
            if (window && !window.isDestroyed()) {
              window.setIcon(fullIconPath);
            }
          });
        }
        
        // Update app name for stealth mode
        this.updateAppName(appName, iconKey);
        
        logger.info('App icon and name updated successfully', { 
          iconKey, 
          appName,
          iconPath: fullIconPath, 
          platform: process.platform 
        });
      } else {
        logger.warn('Icon file not found', { iconKey, iconPath });
        return { success: false, error: 'Icon file not found' };
      }

      this.appIcon = iconKey;
      return { success: true };
    } catch (error) {
      logger.error('Failed to update app icon', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  updateAppName(appName, iconKey) {
    try {
      const { app } = require('electron');
      
      // Force update process title for Activity Monitor stealth - CRITICAL
      process.title = appName;
      
      // Set app name in dock (macOS) - this affects the dock and Activity Monitor
      if (process.platform === 'darwin') {
        // Multiple attempts to ensure the name sticks
        app.setName(appName);
        
        // Force update the bundle name for macOS stealth
        const { execSync } = require('child_process');
        try {
          // Update the app's Info.plist CFBundleName in memory
          if (process.mainModule && process.mainModule.filename) {
            const appPath = process.mainModule.filename;
            // Force set the bundle name directly
            process.env.CFBundleName = appName.trim();
          }
        } catch (e) {
          // Silently fail if we can't modify bundle info
        }
        
        // Clear dock badge and reset
        if (app.dock) {
          app.dock.setBadge('');
          // Force dock refresh
          setTimeout(() => {
            app.dock.setIcon(require('path').resolve(`assests/icons/${iconKey}.png`));
          }, 50);
        }
      }
      
      // Set app user model ID for Windows taskbar grouping
      app.setAppUserModelId(`${appName.trim()}-${iconKey}`);
      
      // Update all window titles to match the new app name
      const windows = windowManager.windows;
      windows.forEach((window, type) => {
        if (window && !window.isDestroyed()) {
          // Use stealth name for all windows
          const stealthTitle = appName.trim();
          window.setTitle(stealthTitle);
        }
      });
      
      // Multiple force refreshes with increasing delays
      const refreshTimes = [50, 100, 200, 500];
      refreshTimes.forEach(delay => {
        setTimeout(() => {
          process.title = appName;
          if (process.platform === 'darwin') {
            app.setName(appName);
            // Force update bundle display name
            if (app.getName() !== appName) {
              app.setName(appName);
            }
          }
        }, delay);
      });
      
      logger.info('App name updated for stealth mode', { 
        appName, 
        processTitle: process.title,
        appGetName: app.getName(),
        iconKey,
        platform: process.platform
      });
      
    } catch (error) {
      logger.error('Failed to update app name', { error: error.message });
    }
  }
}

new ApplicationController(); 