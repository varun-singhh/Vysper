const { BrowserWindow, screen } = require('electron');
const path = require('path');
const logger = require('../core/logger').createServiceLogger('WINDOW');
const config = require('../core/config');

class WindowManager {
  constructor() {
    this.windows = new Map();
    this.activeWindow = 'main';
    this.isInteractive = false;
    this.isVisible = false;
    
    this.windowConfigs = {
      main: {
        width: 800, // Auto-size for command tab content
        height: 70, // Minimal height for command tab
        file: 'index.html',
        title: 'Wysper'
      },
      chat: {
        width: 500,
        height: 700,
        file: 'chat.html',
        title: 'Chat'
      },
      skills: {
        width: 400,
        height: 600,
        file: 'skills.html',
        title: 'Skills'
      },
      llmResponse: {
        width: 600,
        height: 400,
        file: 'llm-response.html',
        title: 'AI Response',
        alwaysOnTop: true
      }
    };
  }

  async initializeWindows() {
    logger.info('Initializing application windows');
    
    try {
      await this.createMainWindow();
      await this.createChatWindow();
      await this.createSkillsWindow();
      await this.createLLMResponseWindow();
      
      this.setupWindowEventHandlers();
      logger.info('All windows initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize windows', { error: error.message });
      throw error;
    }
  }

  async createMainWindow() {
    const window = await this.createWindow('main', true); // Show main window by default
    this.windows.set('main', window);
    this.isVisible = true;
    return window;
  }

  async createChatWindow() {
    const window = await this.createWindow('chat');
    this.windows.set('chat', window);
    window.hide();
    return window;
  }

  async createSkillsWindow() {
    const window = await this.createWindow('skills');
    this.windows.set('skills', window);
    window.hide();
    return window;
  }

  async createLLMResponseWindow() {
    const window = await this.createWindow('llmResponse');
    this.windows.set('llmResponse', window);
    window.hide();
    return window;
  }

  async createWindow(type, showOnCreate = false) {
    const windowConfig = this.windowConfigs[type];
    if (!windowConfig) {
      throw new Error(`Unknown window type: ${type}`);
    }

    const browserWindowOptions = {
      width: windowConfig.width,
      height: windowConfig.height,
      minWidth: config.get('window.minWidth'),
      minHeight: config.get('window.minHeight'),
      maxWidth: config.get('window.maxWidth'),
      maxHeight: config.get('window.maxHeight'),
      webPreferences: config.get('window.webPreferences'),
      show: showOnCreate,
      frame: type === 'main' ? false : true, // Remove frame for main window
      titleBarStyle: type === 'main' ? 'hidden' : 'default',
      title: windowConfig.title,
      skipTaskbar: config.get('stealth.hideFromDock'),
      alwaysOnTop: windowConfig.alwaysOnTop || false,
      transparent: type === 'main' ? true : false, // Enable transparency for main window
      backgroundColor: type === 'main' ? '#00000000' : undefined, // Transparent background for main
      resizable: type === 'main' ? false : true, // Disable resizing for main window
      minimizable: type === 'main' ? false : true, // Disable minimize for main window
      maximizable: type === 'main' ? false : true, // Disable maximize for main window
      closable: type === 'main' ? false : true, // Disable close button for main window
      fullscreenable: type === 'main' ? false : true // Disable fullscreen for main window
    };

    const window = new BrowserWindow(browserWindowOptions);
    
    await window.loadFile(windowConfig.file);
    
    this.positionWindow(window, type);
    
    logger.debug('Window created successfully', {
      type,
      title: windowConfig.title,
      dimensions: `${windowConfig.width}x${windowConfig.height}`
    });

    return window;
  }

  positionWindow(window, type) {
    const display = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workAreaSize;
    
    const positions = {
      main: { x: 50, y: 50 },
      chat: { x: screenWidth - 550, y: 50 },
      skills: { x: 50, y: screenHeight - 650 },
      llmResponse: { x: screenWidth / 2 - 300, y: screenHeight / 2 - 200 }
    };

    const position = positions[type] || { x: 100, y: 100 };
    window.setPosition(position.x, position.y);
  }

  setupWindowEventHandlers() {
    this.windows.forEach((window, type) => {
      window.on('closed', () => {
        logger.debug('Window closed', { type });
        this.windows.delete(type);
      });

      window.on('focus', () => {
        this.activeWindow = type;
        logger.debug('Window focused', { type });
      });

      window.on('show', () => {
        logger.debug('Window shown', { type });
      });

      window.on('hide', () => {
        logger.debug('Window hidden', { type });
      });
    });
  }

  switchToWindow(windowType) {
    if (!this.windowConfigs[windowType]) {
      logger.warn('Attempted to switch to unknown window type', { windowType });
      return;
    }

    this.hideAllWindows();
    
    const targetWindow = this.windows.get(windowType);
    if (targetWindow) {
      targetWindow.show();
      targetWindow.focus();
      this.activeWindow = windowType;
      
      logger.info('Switched to window', { 
        windowType, 
        isVisible: this.isVisible 
      });
    }
  }

  showAllWindows() {
    this.windows.forEach((window, type) => {
      if (type !== 'llmResponse') {
        window.show();
      }
    });
    
    this.isVisible = true;
    const activeWindow = this.windows.get(this.activeWindow);
    if (activeWindow) {
      activeWindow.focus();
    }
    
    logger.info('All windows shown', { 
      activeWindow: this.activeWindow,
      windowCount: this.windows.size 
    });
  }

  hideAllWindows() {
    this.windows.forEach((window, type) => {
      if (type !== 'llmResponse') {
        window.hide();
      }
    });
    
    this.isVisible = false;
    logger.info('All windows hidden');
  }

  toggleVisibility() {
    if (this.isVisible) {
      this.hideAllWindows();
    } else {
      this.showAllWindows();
    }
    
    return this.isVisible;
  }

  setInteractive(interactive) {
    this.isInteractive = interactive;
    
    this.windows.forEach((window, type) => {
      if (type !== 'llmResponse') {
        window.setIgnoreMouseEvents(!interactive);
        window.webContents.send('set-interactive', interactive);
      }
    });
    
    logger.info('Window interaction mode changed', { 
      interactive,
      affectedWindows: Array.from(this.windows.keys()).filter(type => type !== 'llmResponse')
    });
  }

  toggleInteraction() {
    this.setInteractive(!this.isInteractive);
    return this.isInteractive;
  }

  showLLMResponse(content, metadata = {}) {
    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow) {
      logger.error('LLM response window not available');
      return;
    }

    llmWindow.webContents.send('display-llm-response', {
      content,
      metadata,
      timestamp: new Date().toISOString()
    });
    
    llmWindow.show();
    llmWindow.focus();
    
    logger.info('LLM response displayed', {
      contentLength: content.length,
      skill: metadata.skill
    });
  }

  showLLMLoading() {
    const llmWindow = this.windows.get('llmResponse');
    if (llmWindow) {
      llmWindow.webContents.send('show-loading');
      llmWindow.show();
    }
  }

  hideLLMResponse() {
    const llmWindow = this.windows.get('llmResponse');
    if (llmWindow) {
      llmWindow.hide();
    }
  }

  expandLLMWindow(contentMetrics = null) {
    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow) return;

    const optimalSize = this.calculateOptimalWindowSize(contentMetrics);
    
    llmWindow.setSize(optimalSize.width, optimalSize.height);
    this.centerWindow(llmWindow);
    
    logger.debug('LLM window resized', { 
      newSize: `${optimalSize.width}x${optimalSize.height}`,
      basedOnContent: !!contentMetrics
    });
  }

  calculateOptimalWindowSize(contentMetrics) {
    const display = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workAreaSize;
    
    let width = 600;
    let height = 400;
    
    if (contentMetrics) {
      const { lineCount, avgLineLength } = contentMetrics;
      
      width = Math.min(Math.max(avgLineLength * 8, 500), screenWidth * 0.8);
      height = Math.min(Math.max(lineCount * 25 + 100, 300), screenHeight * 0.8);
    }
    
    return { width: Math.round(width), height: Math.round(height) };
  }

  centerWindow(window) {
    const display = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workAreaSize;
    const [windowWidth, windowHeight] = window.getSize();
    
    const x = Math.round((screenWidth - windowWidth) / 2);
    const y = Math.round((screenHeight - windowHeight) / 2);
    
    window.setPosition(x, y);
  }

  broadcastToAllWindows(channel, data) {
    this.windows.forEach((window, type) => {
      window.webContents.send(channel, data);
    });
    
    logger.debug('Broadcast sent to all windows', { 
      channel, 
      windowCount: this.windows.size 
    });
  }

  getWindow(type) {
    return this.windows.get(type);
  }

  getActiveWindow() {
    return this.windows.get(this.activeWindow);
  }

  getWindowStats() {
    const stats = {};
    
    this.windows.forEach((window, type) => {
      stats[type] = {
        isVisible: window.isVisible(),
        isFocused: window.isFocused(),
        position: window.getPosition(),
        size: window.getSize()
      };
    });
    
    return {
      windows: stats,
      activeWindow: this.activeWindow,
      isInteractive: this.isInteractive,
      isVisible: this.isVisible
    };
  }

  destroyAllWindows() {
    this.windows.forEach((window, type) => {
      logger.debug('Destroying window', { type });
      window.destroy();
    });
    
    this.windows.clear();
    logger.info('All windows destroyed');
  }
}

module.exports = new WindowManager(); 