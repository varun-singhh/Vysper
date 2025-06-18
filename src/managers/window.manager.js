const { BrowserWindow, screen, desktopCapturer } = require('electron');
const path = require('path');
const logger = require('../core/logger').createServiceLogger('WINDOW');
const config = require('../core/config');

class WindowManager {
  constructor() {
    this.windows = new Map();
    this.activeWindow = 'main';
    this.isInteractive = false;
    this.isVisible = false;
    this.currentDisplay = null;
    this.screenWatcher = null;
    this.desktopWatcher = null;
    this.lastActiveSpace = null;
    this.screenSharingWatcher = null;
    this.isScreenBeingShared = false;
    this.wasVisibleBeforeSharing = false;
    this.isInitialized = false;
    this.isInitializing = false;
    this.isRecording = false;
    
    // Add debouncing to prevent excessive operations
    this.lastEnforceTime = 0;
    this.enforceDebounceMs = 1000; // Only enforce once per second
    this.focusLocked = false; // Prevent focus loops
    
    // Window binding properties
    this.bindWindows = true; // Enable window binding by default
    this.windowGap = 10; // Small gap between windows
    this.boundWindowsPosition = { x: 0, y: 0 }; // Track position of bound windows
    
    this.windowConfigs = {
      main: {
        width: 400,
        height: 35,
        useContentSize: true,
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
        width: 840,
        height: 480,
        file: 'llm-response.html',
        title: 'AI Response',
        alwaysOnTop: true
      },
      settings: {
        width: 400,
        height: 380,
        file: 'settings.html',
        title: 'Settings',
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
        fullscreenable: false
      }
    };

    this.init();
  }

  init() {
    // ... existing initialization code ...
  }

  async initializeWindows() {
    if (this.isInitialized || this.isInitializing) {
      logger.warn('Windows already initialized or initializing');
      return;
    }

    this.isInitializing = true;
    logger.info('Initializing application windows');
    
    try {
      await this.createMainWindow();
      await this.createChatWindow();
      await this.createSkillsWindow();
      await this.createLLMResponseWindow();
      await this.createSettingsWindow();
      
      this.setupWindowEventHandlers();
      this.setupScreenTracking();
      this.setupScreenSharingDetection();
      
      this.isInitialized = true;
      this.isInitializing = false;
      logger.info('All windows initialized successfully');
    } catch (error) {
      this.isInitializing = false;
      logger.error('Failed to initialize windows', { error: error.message });
      throw error;
    }
  }

  async createMainWindow() {
    if (this.windows.has('main')) {
      return this.windows.get('main');
    }
    const window = await this.createWindow('main', false); // Don't show during creation
    this.windows.set('main', window);
    this.isVisible = true;
    
    // Wait a moment for app to fully initialize and detect current desktop
    setTimeout(() => {
      this.showOnCurrentDesktop(window);
    }, 100);
    
    return window;
  }

  async createChatWindow() {
    if (this.windows.has('chat')) {
      return this.windows.get('chat');
    }
    const window = await this.createWindow('chat');
    this.windows.set('chat', window);
    window.hide();
    return window;
  }

  async createSkillsWindow() {
    if (this.windows.has('skills')) {
      return this.windows.get('skills');
    }
    const window = await this.createWindow('skills');
    this.windows.set('skills', window);
    window.hide();
    return window;
  }

  async createLLMResponseWindow() {
    if (this.windows.has('llmResponse')) {
      return this.windows.get('llmResponse');
    }
    const window = await this.createWindow('llmResponse');
    this.windows.set('llmResponse', window);
    window.hide();
    return window;
  }

  async createSettingsWindow() {
    if (this.windows.has('settings')) {
      return this.windows.get('settings');
    }
    const window = await this.createWindow('settings');
    this.windows.set('settings', window);
    window.hide();
    return window;
  }

  async createWindow(type, showOnCreate = false) {
    const windowConfig = this.windowConfigs[type];
    if (!windowConfig) {
      throw new Error(`Unknown window type: ${type}`);
    }

    // Base options
    const baseOptions = {
      width: windowConfig.width,
      height: windowConfig.height,
      webPreferences: {
        ...config.get('window.webPreferences'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
      show: false, // Never show during creation, use showOnCurrentDesktop instead
      title: windowConfig.title,
      skipTaskbar: true,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      fullscreenable: false,
    };

    // Type-specific window configurations
    let browserWindowOptions;
    
    if (type === 'settings') {
      // Completely minimal settings window - no decorations at all
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else if (type === 'main') {
      // Main window configuration - fit to content, completely frameless
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        useContentSize: windowConfig.useContentSize || false,
        thickFrame: false,
        focusable: true,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true,
          disableAutoHideCursor: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else if (type === 'llmResponse') {
      // LLM Response window - completely frameless, just content
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        backgroundColor: '#00000000',
        resizable: true,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        thickFrame: false,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 }
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else {
      // Other windows (chat, skills)
      browserWindowOptions = {
        ...baseOptions,
        minWidth: config.get('window.minWidth'),
        minHeight: config.get('window.minHeight'),
        maxWidth: config.get('window.maxWidth'),
        maxHeight: config.get('window.maxHeight'),
        frame: true,
        titleBarStyle: 'default',
        transparent: false,
        resizable: true,
        minimizable: false,
        maximizable: true,
        closable: true,
        hasShadow: true,
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    }

    // Windows-specific settings
    if (process.platform === 'win32') {
      browserWindowOptions = {
        ...browserWindowOptions,
        parent: null,
        modal: false,
        thickFrame: false,
      };
    }

    browserWindowOptions.kiosk = false;
    browserWindowOptions.simpleFullscreen = false;

    const window = new BrowserWindow(browserWindowOptions);
    
    // Load the HTML file
    await window.loadFile(windowConfig.file);
    
    // Position the window
    this.positionWindow(window, type);
    
    // Apply simplified stealth measures
    this.applyStealthMeasures(window, type);
    
    // Initialize interaction mode based on current state
    if (type !== 'llmResponse') {
      if (this.isInteractive) {
        window.setIgnoreMouseEvents(false);
      } else {
        window.setIgnoreMouseEvents(true, { forward: true });
      }
    }
    
    // Show window on current desktop if requested
    if (showOnCreate) {
      this.showOnCurrentDesktop(window);
    }

    logger.debug('Window created successfully', {
      type,
      title: windowConfig.title,
      dimensions: `${windowConfig.width}x${windowConfig.height}`,
      showOnCreate: showOnCreate
    });

    return window;
  }

  applyStealthMeasures(window, type) {
    // Simplified always-on-top enforcement - NO LOOPS
    if (process.platform === 'darwin') {
      window.setAlwaysOnTop(true, 'floating', 1); // Changed from 'screen-saver'
    } else if (process.platform === 'win32') {
      window.setAlwaysOnTop(true);
    }

    // Make window undetectable by screen capture
    try {
      window.setContentProtection(true);
    } catch (error) {
      logger.debug('Content protection not supported on this platform');
    }

    window.setVisibleOnAllWorkspaces(true);
    window.setSkipTaskbar(true);
    
    // REMOVED the setTimeout loop that was causing flickering
  }

  positionWindow(window, type) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    
    if (this.bindWindows && (type === 'main' || type === 'llmResponse')) {
      // Position bound windows together
      this.positionBoundWindows();
      return;
    }
    
    // All windows positioned at top of screen with small margin
    const topMargin = 20;
    const [windowWidth] = window.getSize();
    
    const positions = {
      main: { x: displayX + 50, y: displayY + topMargin },
      chat: { x: displayX + screenWidth - windowWidth - 50, y: displayY + topMargin },
      skills: { x: displayX + 50, y: displayY + topMargin + 100 }, // Slightly lower to avoid overlap
      llmResponse: { x: displayX + (screenWidth - windowWidth) / 2, y: displayY + topMargin },
      settings: { x: displayX + (screenWidth - windowWidth) / 2, y: displayY + topMargin }
    };

    const position = positions[type] || { x: displayX + 100, y: displayY + topMargin };
    window.setPosition(position.x, position.y);
    
    logger.debug('Positioned window at top', {
      type,
      position: `${position.x},${position.y}`,
      topMargin,
      display: display.id || 'primary'
    });
  }

  // New method to position bound windows (vertical column layout) - Always at top
  positionBoundWindows() {
    const mainWindow = this.windows.get('main');
    const llmWindow = this.windows.get('llmResponse');
    
    if (!mainWindow || !llmWindow) return;
    
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea;
    
    const [mainWidth, mainHeight] = mainWindow.getSize();
    const [llmWidth, llmHeight] = llmWindow.getSize();
    
    // Always position at the top of the screen with small margin
    const topMargin = 20;
    const startY = displayY + topMargin;
    
    // Use the wider window for horizontal centering
    const maxWidth = Math.max(mainWidth, llmWidth);
    
    // Center horizontally on the display
    const xPosition = displayX + Math.round((screenWidth - maxWidth) / 2);
    
    // Ensure windows don't go outside screen bounds horizontally
    const adjustedMainX = Math.max(displayX, Math.min(displayX + screenWidth - mainWidth, xPosition));
    const adjustedLlmX = Math.max(displayX, Math.min(displayX + screenWidth - llmWidth, xPosition));
    
    // Position main window (top)
    const mainX = adjustedMainX;
    const mainY = startY;
    mainWindow.setPosition(mainX, mainY);
    
    // Position LLM response window below with gap
    const llmX = adjustedLlmX;
    const llmY = startY + mainHeight + this.windowGap;
    llmWindow.setPosition(llmX, llmY);
    
    // Update stored position (use main window position as reference)
    this.boundWindowsPosition = { x: adjustedMainX, y: startY };
    
    logger.debug('Positioned bound windows at top (column layout)', {
      mainPosition: `${mainX},${mainY}`,
      llmPosition: `${llmX},${llmY}`,
      gap: this.windowGap,
      topMargin: topMargin,
      display: display.id
    });
  }

  // New method to move bound windows (column layout) - Maintains top positioning preference
  moveBoundWindows(deltaX, deltaY) {
    if (!this.bindWindows) return;
    
    const mainWindow = this.windows.get('main');
    const llmWindow = this.windows.get('llmResponse');
    
    if (!mainWindow || !llmWindow) return;
    
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea;
    
    // Get current positions and sizes
    const [mainX, mainY] = mainWindow.getPosition();
    const [llmX, llmY] = llmWindow.getPosition();
    const [mainWidth, mainHeight] = mainWindow.getSize();
    const [llmWidth, llmHeight] = llmWindow.getSize();
    
    // Calculate total height for bounds checking
    const totalHeight = mainHeight + this.windowGap + llmHeight;
    const topMargin = 20;
    const minY = displayY + topMargin;
    
    // Calculate new positions with bounds checking
    const newMainX = Math.max(displayX, Math.min(displayX + screenWidth - mainWidth, mainX + deltaX));
    // Ensure we don't go above the top margin or below screen bounds
    const newMainY = Math.max(minY, Math.min(displayY + screenHeight - totalHeight, mainY + deltaY));
    
    // LLM window follows the same horizontal movement but maintains vertical relationship
    const newLlmX = Math.max(displayX, Math.min(displayX + screenWidth - llmWidth, llmX + deltaX));
    const newLlmY = newMainY + mainHeight + this.windowGap;
    
    // Move both windows
    mainWindow.setPosition(newMainX, newMainY);
    llmWindow.setPosition(newLlmX, newLlmY);
    
    // Update stored position (use main window as reference)
    this.boundWindowsPosition.x = newMainX;
    this.boundWindowsPosition.y = newMainY;
    
    logger.debug('Moved bound windows (maintaining top preference)', {
      delta: `${deltaX},${deltaY}`,
      newMainPosition: `${newMainX},${newMainY}`,
      newLlmPosition: `${newLlmX},${newLlmY}`,
      topMargin: topMargin,
      totalHeight: totalHeight
    });
  }

  showOnCurrentDesktop(win) {
    if (!win || win.isDestroyed()) return;
    
    if (process.platform === 'darwin') {
      // More aggressive approach for macOS to prevent space switching
      
      // First, ensure the window is hidden
      win.hide();
      
      // Set up the window to appear on all workspaces temporarily
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      
      // Disable space switching behavior
      win.setAlwaysOnTop(true, 'floating', 1);
      
      // Small delay to ensure settings take effect
      setTimeout(() => {
        if (!win.isDestroyed()) {
          // Show the window (should appear on current space without switching)
          win.show();
          
          // Focus without switching spaces
          win.focus();
          
          // After window is shown, remove from all workspaces to prevent clutter
          setTimeout(() => {
            if (!win.isDestroyed()) {
              win.setVisibleOnAllWorkspaces(false);
            }
          }, 300);
        }
      }, 50);
    } else {
      // For non-macOS platforms, simpler approach
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.show();
      win.focus();
      
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.setVisibleOnAllWorkspaces(false);
        }
      }, 500);
    }
    
    logger.debug('Showing window on current desktop', {
      platform: process.platform,
      windowId: win.id,
      isDestroyed: win.isDestroyed()
    });
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

      // SIMPLIFIED blur handler - no aggressive re-focusing
      window.on('blur', () => {
        // Only log, don't force focus back
        logger.debug('Window blurred', { type });
      });

      window.on('show', () => {
        logger.debug('Window shown', { type });
      });

      window.on('hide', () => {
        logger.debug('Window hidden', { type });
      });

      // Handle window minimize attempts
      window.on('minimize', (event) => {
        event.preventDefault();
        logger.debug('Prevented window minimize', { type });
      });

      window.on('restore', () => {
        // Simplified restore handling
        logger.debug('Window restored', { type });
      });
    });
  }

  setupScreenSharingDetection() {
    // Reduced frequency to prevent performance issues
    this.screenSharingWatcher = setInterval(async () => {
      await this.checkScreenSharingStatus();
    }, 5000); // Check every 5 seconds instead of 1

    logger.info('Screen sharing detection initialized');
  }

  async checkScreenSharingStatus() {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 }
      });

      const wasSharing = this.isScreenBeingShared;
      
      if (wasSharing !== this.isScreenBeingShared) {
        if (this.isScreenBeingShared) {
          this.handleScreenSharingStarted();
        } else {
          this.handleScreenSharingStopped();
        }
      }
    } catch (error) {
      logger.debug('Screen sharing detection error', { error: error.message });
    }
  }

  startScreenSharingMode() {
    if (!this.isScreenBeingShared) {
      this.isScreenBeingShared = true;
      this.wasVisibleBeforeSharing = this.isVisible;
      this.handleScreenSharingStarted();
    }
  }

  stopScreenSharingMode() {
    if (this.isScreenBeingShared) {
      this.isScreenBeingShared = false;
      this.handleScreenSharingStopped();
    }
  }

  handleScreenSharingStarted() {
    logger.info('Screen sharing detected - hiding windows');
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.hide();
        window.setPosition(-10000, -10000);
      }
    });
  }

  handleScreenSharingStopped() {
    logger.info('Screen sharing ended - restoring windows');
    
    if (this.wasVisibleBeforeSharing) {
      this.moveWindowsToActiveScreen();
      this.showAllWindows();
    }
  }

  switchToWindow(windowType) {
    if (!this.windowConfigs[windowType]) {
      logger.warn('Attempted to switch to unknown window type', { windowType });
      return;
    }

    if (this.isScreenBeingShared) {
      return;
    }

    this.hideAllWindows();

    const targetWindow = this.windows.get(windowType);
    if (targetWindow) {
      this.showOnCurrentDesktop(targetWindow);

      this.activeWindow = windowType;
      
      logger.info('Switched to window', {
        windowType,
        isVisible: this.isVisible
      });
    }
  }

  showAllWindows() {
    if (this.isScreenBeingShared) {
      return;
    }

    this.windows.forEach((window, type) => {
      if (type !== 'llmResponse') { // Don't show LLM response unless it has content
        this.showOnCurrentDesktop(window);
      }
    });
    
    this.isVisible = true;
    const activeWindow = this.windows.get(this.activeWindow);
    if (activeWindow) {
      activeWindow.focus();
    }
    
    logger.info('All windows shown on current desktop', { 
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
    if (this.isScreenBeingShared) {
      return this.isVisible;
    }

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
      if (type !== 'llmResponse' && !window.isDestroyed()) {
        if (interactive) {
          // Interactive mode: allow mouse events
          window.setIgnoreMouseEvents(false);
        } else {
          // Non-interactive mode: enable click-through with forwarding
          window.setIgnoreMouseEvents(true, { forward: true });
        }
        window.webContents.send('interaction-mode-changed', interactive);
      }
    });
    
    logger.info('Window interaction mode changed', { 
      interactive,
      clickThrough: !interactive,
      affectedWindows: Array.from(this.windows.keys()).filter(type => type !== 'llmResponse')
    });
  }

  toggleInteraction() {
    this.setInteractive(!this.isInteractive);
    return this.isInteractive;
  }

  showLLMResponse(content, metadata = {}) {
    logger.debug('showLLMResponse called', {
      isScreenBeingShared: this.isScreenBeingShared,
      contentLength: content.length,
      skill: metadata.skill
    });

    if (this.isScreenBeingShared) {
      logger.warn('LLM response blocked due to screen sharing mode');
      return;
    }

    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow) {
      logger.error('LLM response window not available');
      return;
    }

    if (llmWindow.isDestroyed()) {
      logger.error('LLM response window is destroyed');
      return;
    }

    logger.debug('Sending display-llm-response event to window');
    llmWindow.webContents.send('display-llm-response', {
      content,
      metadata,
      timestamp: new Date().toISOString()
    });
    
    logger.debug('Showing and focusing LLM window');
    this.showOnCurrentDesktop(llmWindow);
    
    // Position bound windows when LLM response is shown
    if (this.bindWindows) {
      this.positionBoundWindows();
    }
        
    logger.info('LLM response displayed', {
      contentLength: content.length,
      skill: metadata.skill,
      windowVisible: llmWindow.isVisible(),
      boundWindows: this.bindWindows
    });
  }

  showLLMLoading() {
    if (this.isScreenBeingShared) {
      logger.warn('LLM loading blocked due to screen sharing mode');
      return;
    }

    const llmWindow = this.windows.get('llmResponse');
    if (llmWindow) {
      logger.debug('Showing LLM loading state');
      llmWindow.webContents.send('show-loading');
      this.showOnCurrentDesktop(llmWindow);
      
      // Position bound windows when LLM loading is shown
      if (this.bindWindows) {
        this.positionBoundWindows();
      }
      
      logger.debug('LLM loading window shown');
    } else {
      logger.error('LLM window not available for loading state');
    }
  }

  hideLLMResponse() {
    const llmWindow = this.windows.get('llmResponse');
    if (llmWindow) {
      llmWindow.hide();
    }
  }

  showSettings() {
    if (this.isScreenBeingShared) return;

    const settingsWindow = this.windows.get('settings');
    if (settingsWindow) {
      this.showOnCurrentDesktop(settingsWindow);
      this.centerWindow(settingsWindow); // This now positions at top-center
      
      // Notify that settings window is shown
      setTimeout(() => {
        settingsWindow.webContents.send('settings-window-shown');
      }, 50);
      
      logger.info('Settings window displayed at top');
    }
  }

  hideSettings() {
    const settingsWindow = this.windows.get('settings');
    if (settingsWindow) {
      settingsWindow.hide();
    }
  }

  expandLLMWindow(contentMetrics = null) {
    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow || this.isScreenBeingShared) return;

    const optimalSize = this.calculateOptimalWindowSize(contentMetrics);
    
    // Ensure we have valid numbers for setSize
    const width = Math.round(Number(optimalSize.width)) || 840;
    const height = Math.round(Number(optimalSize.height)) || 480;
    
    llmWindow.setSize(width, height);
    
    // If windows are bound, position them together; otherwise center the LLM window
    if (this.bindWindows) {
      this.positionBoundWindows();
    } else {
      this.centerWindow(llmWindow);
    }
    
    logger.debug('LLM window resized', { 
      newSize: `${width}x${height}`,
      basedOnContent: !!contentMetrics,
      boundWindows: this.bindWindows
    });
  }

  calculateOptimalWindowSize(contentMetrics) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    
    let width = 840; // Default LLM window width
    let height = 480; // Default LLM window height
    
    if (contentMetrics && typeof contentMetrics === 'object') {
      const lineCount = Number(contentMetrics.lineCount) || 20;
      const avgLineLength = Number(contentMetrics.avgLineLength) || 80;
      
      width = Math.min(Math.max(avgLineLength * 8, 500), screenWidth * 0.8);
      height = Math.min(Math.max(lineCount * 25 + 100, 300), screenHeight * 0.8);
    }
    
    return { 
      width: Math.round(Number(width)) || 840, 
      height: Math.round(Number(height)) || 480 
    };
  }

  centerWindow(window) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    const [windowWidth, windowHeight] = window.getSize();
    
    // Center horizontally but position at top
    const topMargin = 20;
    const x = displayX + Math.round((screenWidth - windowWidth) / 2);
    const y = displayY + topMargin;
    
    window.setPosition(x, y);
    
    logger.debug('Positioned window at top-center', {
      position: `${x},${y}`,
      topMargin,
      display: display.id || 'primary'
    });
  }

  broadcastToAllWindows(channel, data) {
    const windowStates = {};
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
        windowStates[type] = {
          isVisible: window.isVisible(),
          isDestroyed: window.isDestroyed(),
          hasWebContents: !!window.webContents
        };
      } else {
        windowStates[type] = { isDestroyed: true };
      }
    });
    
    logger.info('Broadcast sent to all windows', { 
      channel, 
      windowCount: this.windows.size,
      windowStates,
      dataKeys: data ? Object.keys(data) : [],
      // Fixed: Check for 'content' instead of 'response' to match actual data structure
      dataPreview: data && data.content ? data.content.substring(0, 50) + '...' : 
                   data && data.response ? data.response.substring(0, 50) + '...' : 'No response'
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
      isVisible: this.isVisible,
      isScreenBeingShared: this.isScreenBeingShared
    };
  }

  destroyAllWindows() {
    this.windows.forEach((window, type) => {
      logger.debug('Destroying window', { type });
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
    
    this.windows.clear();
    
    // Clean up all watchers
    if (this.screenWatcher) {
      clearInterval(this.screenWatcher);
      this.screenWatcher = null;
    }
    
    if (this.desktopWatcher) {
      clearInterval(this.desktopWatcher);
      this.desktopWatcher = null;
    }

    if (this.screenSharingWatcher) {
      clearInterval(this.screenSharingWatcher);
      this.screenSharingWatcher = null;
    }
    
    logger.info('All windows destroyed');
  }

  setupScreenTracking() {
    // Initialize with current cursor position to get the active display
    const cursorPoint = screen.getCursorScreenPoint();
    this.currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    screen.on('display-added', () => {
      logger.debug('Display added');
      this.handleDisplayChange();
    });

    screen.on('display-removed', () => {
      logger.debug('Display removed');
      this.handleDisplayChange();
    });

    screen.on('display-metrics-changed', () => {
      logger.debug('Display metrics changed');
      this.handleDisplayChange();
    });

    // More frequent tracking during initialization
    this.screenWatcher = setInterval(() => {
      this.trackActiveScreen();
    }, 2000);

    // SIMPLIFIED desktop tracking
    this.setupDesktopTracking();

    logger.info('Screen and desktop tracking initialized', {
      currentDisplay: this.currentDisplay.id,
      cursorPosition: cursorPoint
    });
  }

  handleDisplayChange() {
    setTimeout(() => {
      this.moveWindowsToActiveScreen();
    }, 500);
  }

  trackActiveScreen() {
    if (this.isScreenBeingShared) return;

    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    if (!this.currentDisplay || activeDisplay.id !== this.currentDisplay.id) {
      this.currentDisplay = activeDisplay;
      this.moveWindowsToActiveScreen();
      
      logger.debug('Active screen changed', {
        displayId: activeDisplay.id,
        bounds: activeDisplay.bounds
      });
    }
  }

  moveWindowsToActiveScreen() {
    if (!this.currentDisplay || this.isScreenBeingShared) return;

    const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = this.currentDisplay.workArea;
    
    // Handle bound windows specially
    if (this.bindWindows) {
      const mainWindow = this.windows.get('main');
      const llmWindow = this.windows.get('llmResponse');
      
      if (mainWindow && llmWindow && !mainWindow.isDestroyed() && !llmWindow.isDestroyed()) {
        // Position bound windows on the new screen and ensure they appear on current desktop
        this.positionBoundWindows();
        if (mainWindow.isVisible()) this.showOnCurrentDesktop(mainWindow);
        if (llmWindow.isVisible()) this.showOnCurrentDesktop(llmWindow);
      }
    }
    
    this.windows.forEach((window, type) => {
      if (window && !window.isDestroyed()) {
        // Skip main and llmResponse if they're bound (already handled above)
        if (this.bindWindows && (type === 'main' || type === 'llmResponse')) {
          return;
        }
        
        const [windowWidth, windowHeight] = window.getSize();
        
        let newX, newY;
        
        // All windows positioned at top of screen
        const topMargin = 20;
        
        switch (type) {
          case 'main':
            newX = displayX + 50;
            newY = displayY + topMargin;
            break;
          case 'chat':
            newX = displayX + displayWidth - windowWidth - 50;
            newY = displayY + topMargin;
            break;
          case 'skills':
            newX = displayX + 50;
            newY = displayY + topMargin + 100; // Slightly lower to avoid overlap
            break;
          case 'llmResponse':
            newX = displayX + (displayWidth - windowWidth) / 2;
            newY = displayY + topMargin;
            break;
          case 'settings':
            newX = displayX + (displayWidth - windowWidth) / 2;
            newY = displayY + topMargin;
            break;
          default:
            newX = displayX + 100;
            newY = displayY + topMargin;
        }
        
        window.setPosition(Math.round(newX), Math.round(newY));
        
        // Ensure window appears on current desktop if it's visible
        if (window.isVisible()) {
          this.showOnCurrentDesktop(window);
        }
        
        logger.debug('Window moved to active screen and shown on current desktop', {
          type,
          position: `${newX},${newY}`,
          isVisible: window.isVisible(),
          displayId: this.currentDisplay.id
        });
      }
    });
  }

  setupDesktopTracking() {
    // MUCH less aggressive desktop tracking
    this.desktopWatcher = setInterval(() => {
      this.trackDesktopChanges();
    }, 10000); // Changed from 1500ms to 10000ms (10 seconds)

    logger.info('Desktop tracking initialized');
  }

  trackDesktopChanges() {
    if (this.isScreenBeingShared) return;

    // Simplified tracking - just log changes
    if (process.platform === 'darwin') {
      const cursorPoint = screen.getCursorScreenPoint();
      const currentSpaceSignature = `${cursorPoint.x}_${cursorPoint.y}`;
      
      if (this.lastActiveSpace && this.lastActiveSpace !== currentSpaceSignature) {
        logger.debug('Desktop space might have changed');
      }
      
      this.lastActiveSpace = currentSpaceSignature;
    }
  }

  // REMOVED all the aggressive enforcement methods that were causing flickering:
  // - handlePossibleSpaceChange()
  // - handleSpaceChange() 
  // - ensureWindowVisibility()
  // - enforceWindowProperties()
  // - enforceAllWindowProperties()
  // - enforceAlwaysOnTop()

  // Public methods for manual screen sharing control
  enableScreenSharingMode() {
    this.startScreenSharingMode();
  }

  disableScreenSharingMode() {
    this.stopScreenSharingMode();
  }

  isInScreenSharingMode() {
    return this.isScreenBeingShared;
  }

  // Window binding management methods
  setWindowBinding(enabled) {
    this.bindWindows = enabled;
    
    if (enabled) {
      // Position bound windows when binding is enabled
      const mainWindow = this.windows.get('main');
      const llmWindow = this.windows.get('llmResponse');
      
      if (mainWindow && llmWindow) {
        this.positionBoundWindows();
      }
      
      logger.info('Window binding enabled');
    } else {
      logger.info('Window binding disabled');
    }
    
    return this.bindWindows;
  }

  toggleWindowBinding() {
    return this.setWindowBinding(!this.bindWindows);
  }

  getWindowBindingStatus() {
    return {
      enabled: this.bindWindows,
      gap: this.windowGap,
      position: this.boundWindowsPosition
    };
  }

  setWindowGap(gap) {
    this.windowGap = Math.max(0, gap);
    
    // Re-position if currently bound
    if (this.bindWindows) {
      this.positionBoundWindows();
    }
    
    logger.debug('Window gap updated', { gap: this.windowGap });
    return this.windowGap;
  }

  showChatWindow() {
    const chatWindow = this.windows.get('chat');
    if (chatWindow && !chatWindow.isDestroyed()) {
      this.showOnCurrentDesktop(chatWindow);
      logger.debug('Chat window shown');
    }
  }

  hideChatWindow() {
    const chatWindow = this.windows.get('chat');
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.hide();
      logger.debug('Chat window hidden');
    }
  }

  handleRecordingStarted() {
    this.isRecording = true;
    this.showChatWindow();
    // Notify all windows about recording state
    this.broadcastToAllWindows('recording-started');
    logger.debug('Recording started, chat window shown');
  }

  handleRecordingStopped() {
    this.isRecording = false;
    this.hideChatWindow();
    // Notify all windows about recording state
    this.broadcastToAllWindows('recording-stopped');
    logger.debug('Recording stopped, chat window hidden');
  }

  broadcastSkillChange(skill) {
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.webContents.send('skill-changed', { skill });
      }
    });
    
    logger.info('Skill change broadcasted to all windows', { 
      skill,
      windowCount: this.windows.size 
    });
  }
}

module.exports = new WindowManager();