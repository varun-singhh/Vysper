// Load environment variables from .env file
require('dotenv').config()

const { app, BrowserWindow, screen, globalShortcut, desktopCapturer, ipcMain, session } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)
const Tesseract = require('tesseract.js')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { promptLoader } = require('./prompt-loader')

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'your-api-key-here')
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

// Stealth measures
process.title = 'WindowServer' // Disguise as a system process
if (process.platform === 'darwin') {
  // On macOS, we can use additional stealth measures
  process.env.ELECTRON_NO_ATTACH_CONSOLE = '1'
  process.env.ELECTRON_NO_ASAR = '1'
}

let mainWindow = null
let chatWindow = null
let skillsWindow = null
let llmResponseWindow = null
let isRecording = false
let isWindowHidden = false
let isWindowInteractive = false
let controlsInChat = false
let activeWindow = 'main' // 'main', 'chat', 'skills', or 'llm-response'
let activeSkill = 'dsa' // Default skill is DSA
let sessionMemory = [] // Array to store session events

async function takeScreenshotAndOCR() {
  try {
    console.log('Taking screenshot...')
    addToSessionMemory('Screenshot initiated')
    
    // Show LLM response window with loading state immediately
    showLLMResponseWindowWithLoading()
    
    // Get screen sources
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    })
    
    if (sources.length === 0) {
      throw new Error('No screen sources found')
    }
    
    const source = sources[0]
    console.log('Screen source found:', source.name)
    
    // Get the thumbnail image
    const image = source.thumbnail
    if (!image) {
      throw new Error('No thumbnail available')
    }
    
    console.log('Screenshot captured, processing OCR...')
    addToSessionMemory('Screenshot captured', { 
      source: source.name,
      size: image.getSize()
    })
    
    // Process OCR
    const text = await performOCR(image)
    
    if (text && text.trim()) {
      console.log('OCR completed, processing with LLM...')
      addToSessionMemory('OCR completed', { 
        textLength: text.length,
        preview: text.substring(0, 100) + '...'
      })
      
      // Get current active skill from session memory
      const sessionContext = getLLMOptimizedSessionHistory()
      const currentActiveSkill = activeSkill // Use the global active skill variable
      
      // Process OCR text with LLM
      await processOCRWithLLM(text.trim(), currentActiveSkill)
      
      // Send to all windows
      if (mainWindow) {
        mainWindow.webContents.send('ocr-completed', { text: text })
      }
      if (chatWindow) {
        chatWindow.webContents.send('ocr-completed', { text: text })
      }
      if (skillsWindow) {
        skillsWindow.webContents.send('ocr-completed', { text: text })
      }
      
    } else {
      console.log('No text found in screenshot')
      addToSessionMemory('OCR failed - no text found')
      
      // Hide LLM response window if no text found
      if (llmResponseWindow) {
        llmResponseWindow.hide()
      }
      
      // Send error to windows
      const errorData = { error: 'No text found in screenshot' }
      if (mainWindow) {
        mainWindow.webContents.send('ocr-error', errorData)
      }
      if (chatWindow) {
        chatWindow.webContents.send('ocr-error', errorData)
      }
      if (skillsWindow) {
        skillsWindow.webContents.send('ocr-error', errorData)
      }
    }
    
  } catch (error) {
    console.error('Screenshot/OCR error:', error)
    addToSessionMemory('Screenshot/OCR failed', { error: error.message })
    
    // Hide LLM response window on error
    if (llmResponseWindow) {
      llmResponseWindow.hide()
    }
    
    // Send error to windows
    const errorData = { error: error.message }
    if (mainWindow) {
      mainWindow.webContents.send('ocr-error', errorData)
    }
    if (chatWindow) {
      chatWindow.webContents.send('ocr-error', errorData)
    }
    if (skillsWindow) {
      skillsWindow.webContents.send('ocr-error', errorData)
    }
  }
}

async function performOCR(image) {
  try {
    // Create a temporary file path
    const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.png`)
    console.log('Temporary file path:', tempPath)
    
    // Convert NativeImage to buffer and save
    const buffer = image.toPNG()
    fs.writeFileSync(tempPath, buffer)
    console.log('Screenshot saved to:', tempPath)
    
    try {
      // Perform OCR
      console.log('Starting OCR...')
      const { data: { text } } = await Tesseract.recognize(tempPath, 'eng', {
        logger: m => console.log('OCR Progress:', m)
      })
      
      console.log('OCR completed successfully')
      console.log('Extracted text:', text.trim())
      
      // Delete the temporary file immediately after OCR
      try {
        fs.unlinkSync(tempPath)
        console.log('Screenshot file deleted successfully')
      } catch (deleteError) {
        console.error('Error deleting screenshot file:', deleteError)
      }
      
      return text.trim()
      
    } catch (ocrError) {
      // Delete the temporary file even if OCR fails
      try {
        fs.unlinkSync(tempPath)
        console.log('Screenshot file deleted after OCR error')
      } catch (deleteError) {
        console.error('Error deleting screenshot file after OCR error:', deleteError)
      }
      
      throw ocrError
    }
    
  } catch (error) {
    console.error('OCR processing error:', error)
    throw error
  }
}

// Set up permissions before creating windows
function setupPermissions() {
  // Handle permission requests
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('Permission requested:', permission)
    
    // Grant microphone and camera permissions
    if (permission === 'microphone' || permission === 'camera' || permission === 'media') {
      console.log('Granting permission:', permission)
      callback(true)
    } else {
      console.log('Denying permission:', permission)
      callback(false)
    }
  })

  // Set permission check handler
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    console.log('Permission check:', permission, 'from:', requestingOrigin)
    
    // Allow microphone and media permissions
    if (permission === 'microphone' || permission === 'media') {
      return true
    }
    
    return false
  })

  // Handle device permission requests
  session.defaultSession.setDevicePermissionHandler((details) => {
    console.log('Device permission requested:', details)
    
    // Allow microphone devices
    if (details.deviceType === 'microphone') {
      return true
    }
    
    return false
  })
}

function createChatWindow() {
  chatWindow = new BrowserWindow({
    width: 400,
    height: 600,
    x: 100,
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Disable web security for local development
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
      // Enable media permissions
      enableRemoteModule: true,
      // Additional security settings for media access
      additionalArguments: ['--enable-media-stream', '--allow-running-insecure-content']
    },
    show: false
  })

  // Load the chat HTML file
  chatWindow.loadFile('chat.html')
  
  // Set window to be visible on all workspaces
  chatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  
  // Handle window ready
  chatWindow.webContents.once('dom-ready', () => {
    console.log('Chat window DOM ready')
    
    // Pass environment variables to renderer process
    chatWindow.webContents.executeJavaScript(`
      // Make environment variables available to renderer process
      process.env.AZURE_SPEECH_KEY = '${process.env.AZURE_SPEECH_KEY || ''}';
      process.env.AZURE_SPEECH_REGION = '${process.env.AZURE_SPEECH_REGION || ''}';
      console.log('Environment variables set in renderer process');
    `).catch(err => {
      console.error('Failed to set environment variables:', err)
    })
  })

  chatWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[CHAT CONSOLE] ${message}`)
  })
  
  chatWindow.once('ready-to-show', () => {
    console.log('Chat window ready to show')
    setChatWindowInteractive(false) // Start as non-interactive
  })
  
  // Handle window close
  chatWindow.on('closed', () => {
    chatWindow = null
  })

  // Handle media access requests
  chatWindow.webContents.on('media-started-playing', () => {
    console.log('Media started playing in chat window')
  })

  chatWindow.webContents.on('media-paused', () => {
    console.log('Media paused in chat window')
  })
}

function createSkillsWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  
  skillsWindow = new BrowserWindow({
    width: 400,
    height: 500,
    x: Math.floor((width - 400) / 2),
    y: Math.floor((height - 500) / 2),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: true
    },
    show: false
  })

  // Load the skills HTML file
  skillsWindow.loadFile('skills.html')
  
  // Set window to be visible on all workspaces
  skillsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  
  // Handle window ready
  skillsWindow.webContents.once('dom-ready', () => {
    console.log('Skills window DOM ready')
  })

  skillsWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[SKILLS CONSOLE] ${message}`)
  })
  
  skillsWindow.once('ready-to-show', () => {
    console.log('Skills window ready to show')
    setSkillsWindowInteractive(false) // Start as non-interactive
  })
  
  // Handle window close
  skillsWindow.on('closed', () => {
    skillsWindow = null
  })
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  
  // Calculate dynamic width based on content
  const minWidth = 600
  const maxWidth = Math.floor(width * 0.8)
  const dynamicWidth = Math.max(minWidth, Math.min(maxWidth, 800))
  
  mainWindow = new BrowserWindow({
    width: dynamicWidth,
    height: 60,
    x: Math.floor((width - dynamicWidth) / 2),
    y: 60,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
      webSecurity: false
    }
  })

  // Stealth measures
  mainWindow.setSkipTaskbar(true)
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  mainWindow.setVisibleOnAllWorkspaces(true)
  mainWindow.setBackgroundColor('#00000000')
  mainWindow.setWindowButtonVisibility(false)
  mainWindow.setAutoHideMenuBar(true)
  mainWindow.setMenuBarVisibility(false)
  mainWindow.setFullScreenable(false)
  mainWindow.setResizable(false)
  mainWindow.setMovable(true)
  mainWindow.setOpacity(1)

  mainWindow.loadFile('index.html')
  
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[MAIN CONSOLE] ${message}`)
  })
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    setWindowInteractive(false)
  })
  
  mainWindow.on('blur', () => {
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    mainWindow.setVisibleOnAllWorkspaces(true)
  })

  mainWindow.on('hide', () => {
    mainWindow.show()
  })

  // Handle display changes
  screen.on('display-added', () => {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      mainWindow.setVisibleOnAllWorkspaces(true)
    }
  })

  screen.on('display-removed', () => {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      mainWindow.setVisibleOnAllWorkspaces(true)
    }
  })

  // Handle workspace changes
  if (process.platform === 'darwin') {
    app.on('activate', () => {
      if (mainWindow) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
        mainWindow.setVisibleOnAllWorkspaces(true)
        mainWindow.show()
      }
      if (llmResponseWindow && llmResponseWindow.isVisible()) {
        llmResponseWindow.setAlwaysOnTop(true, 'screen-saver', 1)
        llmResponseWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      }
    })
  }
}

function setWindowInteractive(interactive) {
  isWindowInteractive = interactive
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(!interactive, { forward: true })
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    mainWindow.setVisibleOnAllWorkspaces(true)
  }
  
  // Also apply to LLM response window
  if (llmResponseWindow && llmResponseWindow.isVisible()) {
    llmResponseWindow.setIgnoreMouseEvents(!interactive, { forward: true })
    llmResponseWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    llmResponseWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
}

function setChatWindowInteractive(interactive) {
  if (chatWindow) {
    chatWindow.setIgnoreMouseEvents(!interactive, { forward: true })
    chatWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    chatWindow.setVisibleOnAllWorkspaces(true)
  }
}

function setSkillsWindowInteractive(interactive) {
  if (skillsWindow) {
    skillsWindow.setIgnoreMouseEvents(!interactive, { forward: true })
    skillsWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    skillsWindow.setVisibleOnAllWorkspaces(true)
  }
}

function toggleWindowVisibility() {
  if (isWindowHidden) {
    // Show all windows
    if (mainWindow) {
      mainWindow.show()
    }
    if (chatWindow) {
      chatWindow.show()
    }
    if (skillsWindow) {
      skillsWindow.show()
    }
    if (llmResponseWindow) {
      llmResponseWindow.show()
    }
    isWindowHidden = false
    addToSessionMemory('All windows shown')
  } else {
    // Hide all windows
    if (mainWindow) {
      mainWindow.hide()
    }
    if (chatWindow) {
      chatWindow.hide()
    }
    if (skillsWindow) {
      skillsWindow.hide()
    }
    if (llmResponseWindow) {
      llmResponseWindow.hide()
    }
    isWindowHidden = true
    addToSessionMemory('All windows hidden')
  }
}

function toggleWindowInteraction() {
  const newInteractiveState = !isWindowInteractive
  setWindowInteractive(newInteractiveState)
  setChatWindowInteractive(newInteractiveState)
  setSkillsWindowInteractive(newInteractiveState)
  
  if (newInteractiveState) {
    console.log('Window interaction enabled')
    addToSessionMemory('Window interaction enabled')
    if (mainWindow) {
      mainWindow.webContents.send('interaction-enabled')
    }
    if (chatWindow) {
      chatWindow.webContents.send('interaction-enabled')
    }
    if (skillsWindow) {
      skillsWindow.webContents.send('interaction-enabled')
    }
    if (llmResponseWindow) {
      llmResponseWindow.webContents.send('interaction-enabled')
    }
  } else {
    console.log('Window interaction disabled')
    addToSessionMemory('Window interaction disabled')
    if (mainWindow) {
      mainWindow.webContents.send('interaction-disabled')
    }
    if (chatWindow) {
      chatWindow.webContents.send('interaction-disabled')
    }
    if (skillsWindow) {
      skillsWindow.webContents.send('interaction-disabled')
    }
    if (llmResponseWindow) {
      llmResponseWindow.webContents.send('interaction-disabled')
    }
  }
}

function switchToWindow(windowType) {
  activeWindow = windowType
  console.log(`Switched to ${windowType} window`)
  addToSessionMemory('Window switched', { window: windowType })
  
  // Update window activation indicators
  if (chatWindow) {
    if (windowType === 'chat') {
      chatWindow.webContents.send('window-activated')
    } else {
      chatWindow.webContents.send('window-deactivated')
    }
  }
  
  if (skillsWindow) {
    if (windowType === 'skills') {
      skillsWindow.webContents.send('window-activated')
    } else {
      skillsWindow.webContents.send('window-deactivated')
    }
  }
  
  // Focus the active window
  if (windowType === 'chat' && chatWindow) {
    chatWindow.focus()
  } else if (windowType === 'skills' && skillsWindow) {
    skillsWindow.focus()
  } else if (windowType === 'main' && mainWindow) {
    mainWindow.focus()
  }
}

// Prevent app from showing in dock and activity monitor
app.dock?.hide()

// Enable media access command line switches
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch('enable-media-stream')
app.commandLine.appendSwitch('allow-running-insecure-content')
app.commandLine.appendSwitch('disable-web-security')
app.commandLine.appendSwitch('ignore-certificate-errors')
app.commandLine.appendSwitch('allow-insecure-localhost')

// Additional switches for media access
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('enable-features', 'MediaStreamTrack')
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
}

app.whenReady().then(() => {
  console.log('App ready, setting up permissions...')
  
  // Initialize skill prompt system
  try {
    console.log('🔄 Initializing skill prompt system...')
    promptLoader.loadPrompts()
    
    const stats = promptLoader.getSessionStats()
    console.log(`✅ ${stats.totalPrompts} skill prompts loaded successfully`)
    console.log('📚 Available skills:', stats.availableSkills.join(', '))
  } catch (error) {
    console.error('❌ Failed to initialize prompt system:', error)
    console.error('⚠️ System prompts will not be available - falling back to basic prompts')
  }
  
  // Setup permissions first
  setupPermissions()
  
  // Hide from Activity Monitor
  if (process.platform === 'darwin') {
    exec('defaults write com.apple.ActivityMonitor ShowCategory -int 0')
  }
  
  // Create windows
  createWindow()
  createChatWindow()
  createSkillsWindow()

  // Register global shortcuts
  globalShortcut.register('CommandOrControl+\\', () => {
    toggleWindowVisibility()
  })

  globalShortcut.register('Alt+A', () => {
    toggleWindowInteraction()
  })

  globalShortcut.register('Alt+2', () => {
    if (!isWindowHidden) {
      if (activeWindow === 'chat') {
        // If chat is active, hide it and switch to main
        if (chatWindow) {
          chatWindow.hide()
        }
        switchToWindow('main')
      } else {
        // Switch to chat and show it
        switchToWindow('chat')
        if (chatWindow) {
          chatWindow.show()
          chatWindow.focus()
        }
        // Hide skills window if it's open
        if (skillsWindow && skillsWindow.isVisible()) {
          skillsWindow.hide()
        }
      }
    }
  })

  globalShortcut.register('Alt+3', () => {
    if (!isWindowHidden) {
      if (activeWindow === 'skills') {
        // If skills is active, hide it and switch to main
        if (skillsWindow) {
          skillsWindow.hide()
        }
        switchToWindow('main')
        addToSessionMemory('Skills window hidden', { window: 'skills' })
      } else {
        // Switch to skills and show it
        switchToWindow('skills')
        if (skillsWindow) {
          skillsWindow.show()
          skillsWindow.focus()
        }
        // Hide chat window if it's open
        if (chatWindow && chatWindow.isVisible()) {
          chatWindow.hide()
        }
        addToSessionMemory('Skills window opened', { window: 'skills' })
      }
    }
  })

  globalShortcut.register('Alt+Space', () => {
    if (isRecording) {
      controlsInChat = !controlsInChat
      console.log(`Controls moved to ${controlsInChat ? 'chat window' : 'main window'}`)
      
      // Send notification to both windows
      if (mainWindow) {
        mainWindow.webContents.send('controls-changed', controlsInChat)
      }
      if (chatWindow) {
        chatWindow.webContents.send('controls-changed', controlsInChat)
      }
    }
  })

  globalShortcut.register('CommandOrControl+Left', () => {
    if (!isWindowHidden) {
      let targetWindow = mainWindow
      if (activeWindow === 'chat' && chatWindow) {
        targetWindow = chatWindow
      } else if (activeWindow === 'skills' && skillsWindow) {
        targetWindow = skillsWindow
      } else if (activeWindow === 'llm-response' && llmResponseWindow) {
        targetWindow = llmResponseWindow
      }
      
      if (targetWindow && !isWindowHidden) {
        const [x, y] = targetWindow.getPosition()
        targetWindow.setPosition(Math.max(0, x - 50), y)
        
        // Move LLM response window with main window
        if (targetWindow === mainWindow && llmResponseWindow) {
          const mainBounds = mainWindow.getBounds()
          const screenSize = screen.getPrimaryDisplay().workAreaSize
          const windowWidth = Math.max(mainBounds.width, 800)
          const windowHeight = Math.floor(screenSize.height * 0.6)
          llmResponseWindow.setPosition(mainBounds.x, mainBounds.y + mainBounds.height + 5)
        }
      }
    }
  })

  globalShortcut.register('CommandOrControl+Right', () => {
    if (!isWindowHidden) {
      let targetWindow = mainWindow
      if (activeWindow === 'chat' && chatWindow) {
        targetWindow = chatWindow
      } else if (activeWindow === 'skills' && skillsWindow) {
        targetWindow = skillsWindow
      } else if (activeWindow === 'llm-response' && llmResponseWindow) {
        targetWindow = llmResponseWindow
      }
      
      if (targetWindow && !isWindowHidden) {
        const [x, y] = targetWindow.getPosition()
        const { width } = screen.getPrimaryDisplay().workAreaSize
        const windowWidth = targetWindow.getBounds().width
        targetWindow.setPosition(Math.min(width - windowWidth, x + 50), y)
        
        // Move LLM response window with main window
        if (targetWindow === mainWindow && llmResponseWindow) {
          const mainBounds = mainWindow.getBounds()
          const screenSize = screen.getPrimaryDisplay().workAreaSize
          const windowWidth = Math.max(mainBounds.width, 800)
          const windowHeight = Math.floor(screenSize.height * 0.6)
          llmResponseWindow.setPosition(mainBounds.x, mainBounds.y + mainBounds.height + 5)
        }
      }
    }
  })

  globalShortcut.register('CommandOrControl+Up', () => {
    if (!isWindowHidden) {
      if (isWindowInteractive) {
        // Interactive mode: Navigate skills
        const prevSkill = getPreviousSkill()
        setActiveSkill(prevSkill)
        console.log('Switched to previous skill:', prevSkill)
      } else {
        // Non-interactive mode: Move windows up
        moveActiveWindow('up')
      }
    }
  })

  globalShortcut.register('CommandOrControl+Down', () => {
    if (!isWindowHidden) {
      if (isWindowInteractive) {
        // Interactive mode: Navigate skills
        const nextSkill = getNextSkill()
        setActiveSkill(nextSkill)
        console.log('Switched to next skill:', nextSkill)
      } else {
        // Non-interactive mode: Move windows down
        moveActiveWindow('down')
      }
    }
  })

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow && !isWindowHidden) {
      console.log('Screenshot shortcut triggered')
      takeScreenshotAndOCR()
    }
  })

  globalShortcut.register('CommandOrControl+T', () => {
    if (chatWindow && !isWindowHidden && isRecording) {
      if (chatWindow.isVisible()) {
        chatWindow.hide()
      } else {
        chatWindow.show()
        chatWindow.focus()
      }
    }
  })

  globalShortcut.register('CommandOrControl+R', () => {
    if (!isWindowHidden) {
      if (!isRecording) {
        isRecording = true
        console.log('Starting speech recognition...')
        addToSessionMemory('Speech recognition started')
        
        // Show chat window
        if (chatWindow) {
          chatWindow.show()
          chatWindow.focus()
          // Send message to start recording in renderer process
          chatWindow.webContents.send('recording-started')
        }
      } else {
        isRecording = false
        console.log('Stopping speech recognition...')
        addToSessionMemory('Speech recognition stopped')
        
        // Send message to stop recording in renderer process
        if (chatWindow) {
          chatWindow.webContents.send('recording-stopped')
          chatWindow.hide()
        }
        
        // Reset controls to main window when recording stops
        controlsInChat = false
        if (mainWindow) {
          mainWindow.webContents.send('controls-changed', false)
        }
        if (chatWindow) {
          chatWindow.webContents.send('controls-changed', false)
        }
      }
    }
  })

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (!isWindowHidden) {
      isRecording = false
      console.log('Force stopping speech recognition...')
      addToSessionMemory('Speech recognition force stopped')
      
      // Send message to stop recording in renderer process
      if (chatWindow) {
        chatWindow.webContents.send('recording-stopped')
        chatWindow.hide()
      }
      
      // Reset controls to main window when recording stops
      controlsInChat = false
      if (mainWindow) {
        mainWindow.webContents.send('controls-changed', false)
      }
      if (chatWindow) {
        chatWindow.webContents.send('controls-changed', false)
      }
    }
  })

  globalShortcut.register('Alt+;', () => {
    clearSessionMemory()
    addToSessionMemory('Session memory cleared by user')
  })

  globalShortcut.register('Alt+H', () => {
    if (chatWindow && !isWindowHidden) {
      chatWindow.webContents.send('request-session-history')
      chatWindow.show()
      chatWindow.focus()
      addToSessionMemory('Session history requested')
    }
  })

  globalShortcut.register('Alt+G', () => {
    if (mainWindow && !isWindowHidden) {
      mainWindow.webContents.send('open-gemini-config')
    }
  })

  globalShortcut.register('Alt+L', () => {
    if (llmResponseWindow && !isWindowHidden) {
      llmResponseWindow.show()
      llmResponseWindow.focus()
      addToSessionMemory('LLM response window focused')
    }
  })

  // Add keyboard shortcuts to move windows left/right
  globalShortcut.register('CommandOrControl+Left', () => {
    if (!isWindowHidden && !isWindowInteractive) {
      // Non-interactive mode: Move windows left
      moveActiveWindow('left')
    }
  })

  globalShortcut.register('CommandOrControl+Right', () => {
    if (!isWindowHidden && !isWindowInteractive) {
      // Non-interactive mode: Move windows right
      moveActiveWindow('right')
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Unregister all shortcuts when app is quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// IPC handlers
ipcMain.on('screenshot-taken', (event, imagePath) => {
  console.log('Screenshot saved:', imagePath)
})

ipcMain.on('ocr-complete', (event, text) => {
  console.log('OCR Text:', text)
})

ipcMain.on('toggle-recording', (event) => {
  if (!isWindowHidden) {
    if (!isRecording) {
      isRecording = true
      console.log('Starting speech recognition from chat window...')
      
      // Show chat window
      if (chatWindow) {
        chatWindow.show()
        chatWindow.focus()
        // Send message to start recording in renderer process
        chatWindow.webContents.send('recording-started')
      }
    } else {
      isRecording = false
      console.log('Stopping speech recognition from chat window...')
      
      // Send message to stop recording in renderer process
      if (chatWindow) {
        chatWindow.webContents.send('recording-stopped')
        chatWindow.hide()
      }
      
      // Reset controls to main window when recording stops
      controlsInChat = false
      if (mainWindow) {
        mainWindow.webContents.send('controls-changed', false)
      }
      if (chatWindow) {
        chatWindow.webContents.send('controls-changed', false)
      }
    }
  }
})

// Add debugging for media permissions
ipcMain.on('debug-media-permissions', (event) => {
  console.log('Debugging media permissions...')
  
  // Check system permissions on macOS
  if (process.platform === 'darwin') {
    exec('tccutil reset Microphone', (error, stdout, stderr) => {
      if (error) {
        console.log('TCC reset failed (this is normal):', error.message)
      }
    })
  }
})

// Handle skill selection from skills window
ipcMain.on('skill-selected', (event, skillName) => {
  console.log('Skill selected:', skillName)
  addToSessionMemory('Skill selected', { skill: skillName })
  
  // Update the global active skill and broadcast to all windows
  setActiveSkill(skillName)
  
  // You can add specific logic for each skill here
  switch (skillName) {
    case 'dsa':
      console.log('DSA Interview mode activated')
      break
    case 'behavioral':
      console.log('Behavioral Interview mode activated')
      break
    case 'sales':
      console.log('Sales mode activated')
      break
    case 'presentation':
      console.log('Presentation mode activated')
      break
    case 'data-science':
      console.log('Data Science mode activated')
      break
    default:
      console.log(`${skillName} mode activated`)
  }
})

// Handle skill activation from skills window
ipcMain.on('activate-skill', (event, skillName) => {
  console.log('Activating skill:', skillName)
  addToSessionMemory('Skill activated', { skill: skillName })
  // You can add specific activation logic here
  // For example, switch to chat window and start recording with specific prompts
  if (chatWindow) {
    switchToWindow('chat')
    chatWindow.show()
    chatWindow.focus()
    // You could send specific prompts or configurations based on the skill
    chatWindow.webContents.send('skill-activated', skillName)
  }
})

// Handle transcription from chat window
ipcMain.on('transcription-received', (event, text) => {
  console.log('Transcription received:', text)
  addToSessionMemory('Transcription received', { text: text })
})

// Handle manual text input from chat window
ipcMain.on('text-input', (event, text) => {
  console.log('Text input received:', text)
  addToSessionMemory('Text input', { text: text })
})

// Handle session history requests
ipcMain.on('request-session-history', (event) => {
  const history = getSessionHistory()
  event.reply('session-history', history)
})

// Handle current skill state requests
ipcMain.on('request-current-skill', (event) => {
  console.log('Current skill requested, sending:', activeSkill)
  event.reply('current-skill', { skill: activeSkill })
})



// Handle prompt system statistics request
ipcMain.handle('get-prompt-stats', () => {
  return promptLoader.getSessionStats()
})

// Handle available skills request
ipcMain.handle('get-available-skills', () => {
  return promptLoader.getAvailableSkills()
})

// Session memory management functions
function addToSessionMemory(action, details = {}) {
  const event = {
    timestamp: new Date().toISOString(),
    time: new Date().toLocaleTimeString(),
    action: action,
    details: details,
    // LLM-friendly structured format
    llm_context: {
      action_type: categorizeAction(action),
      primary_content: extractPrimaryContent(action, details),
      metadata: extractMetadata(action, details),
      context_summary: generateContextSummary(action, details)
    }
  }
  
  sessionMemory.push(event)
  console.log(`[SESSION] ${event.time} - ${action}:`, details)
  
  // Send to all windows
  if (mainWindow) {
    mainWindow.webContents.send('session-event', event)
  }
  if (chatWindow) {
    chatWindow.webContents.send('session-event', event)
  }
  if (skillsWindow) {
    skillsWindow.webContents.send('session-event', event)
  }
  if (llmResponseWindow) {
    llmResponseWindow.webContents.send('session-event', event)
  }
}

function categorizeAction(action) {
  const actionMap = {
    'Screenshot taken and OCR completed': 'SCREENSHOT_OCR',
    'Speech recognition started': 'SPEECH_START',
    'Speech recognition stopped': 'SPEECH_STOP',
    'Transcription received': 'TRANSCRIPTION',
    'Text input': 'TEXT_INPUT',
    'Skill selected': 'SKILL_SELECTION',
    'Skill activated': 'SKILL_ACTIVATION',
    'Window switched': 'WINDOW_NAVIGATION',
    'Window interaction enabled': 'SYSTEM_CONTROL',
    'Window interaction disabled': 'SYSTEM_CONTROL',
    'All windows shown': 'SYSTEM_CONTROL',
    'All windows hidden': 'SYSTEM_CONTROL',
    'Session memory cleared by user': 'SYSTEM_CONTROL',
    'Session history requested': 'SYSTEM_CONTROL'
  }
  return actionMap[action] || 'USER_ACTION'
}

function extractPrimaryContent(action, details) {
  if (details.text) return details.text
  if (details.ocrText) return details.ocrText
  if (details.skill) return details.skill
  if (details.window) return details.window
  return action
}

function extractMetadata(action, details) {
  const metadata = {
    timestamp: new Date().toISOString(),
    action: action
  }
  
  if (details.skill) metadata.skill = details.skill
  if (details.window) metadata.window = details.window
  if (details.error) metadata.error = details.error
  
  return metadata
}

function generateContextSummary(action, details) {
  const summaries = {
    'Screenshot taken and OCR completed': `User captured a screenshot and extracted text: "${details.ocrText?.substring(0, 100)}${details.ocrText?.length > 100 ? '...' : ''}"`,
    'Speech recognition started': 'User began voice recording for speech-to-text conversion',
    'Speech recognition stopped': 'User stopped voice recording session',
    'Transcription received': `User spoke: "${details.text}"`,
    'Text input': `User typed: "${details.text}"`,
    'Skill selected': `User selected skill: ${details.skill}`,
    'Skill activated': `User activated skill: ${details.skill} - switching to chat mode`,
    'Window switched': `User navigated to ${details.window} window`,
    'Window interaction enabled': 'User enabled window interactivity (can click on window)',
    'Window interaction disabled': 'User disabled window interactivity (click-through mode)',
    'All windows shown': 'User made all windows visible',
    'All windows hidden': 'User hid all windows (stealth mode)',
    'Session memory cleared by user': 'User cleared all session history',
    'Session history requested': 'User requested to view session history'
  }
  
  return summaries[action] || `User performed action: ${action}`
}

function getSessionHistory() {
  return sessionMemory
}

function getLLMOptimizedSessionHistory() {
  if (sessionMemory.length === 0) {
    return {
      session_summary: "No session history available.",
      total_events: 0,
      session_duration: "0 minutes",
      llm_context: {
        user_workflow: "No activity recorded",
        primary_activities: [],
        current_context: "Fresh session"
      }
    }
  }
  
  const firstEvent = sessionMemory[0]
  const lastEvent = sessionMemory[sessionMemory.length - 1]
  const sessionStart = new Date(firstEvent.timestamp)
  const sessionEnd = new Date(lastEvent.timestamp)
  const durationMs = sessionEnd - sessionStart
  const durationMinutes = Math.round(durationMs / 60000)
  
  // Categorize activities with safety checks
  const activities = {
    screenshots: sessionMemory.filter(e => e.llm_context && e.llm_context.action_type === 'SCREENSHOT_OCR'),
    speech_events: sessionMemory.filter(e => e.llm_context && (e.llm_context.action_type === 'SPEECH_START' || e.llm_context.action_type === 'SPEECH_STOP')),
    transcriptions: sessionMemory.filter(e => e.llm_context && e.llm_context.action_type === 'TRANSCRIPTION'),
    text_inputs: sessionMemory.filter(e => e.llm_context && e.llm_context.action_type === 'TEXT_INPUT'),
    skill_activities: sessionMemory.filter(e => e.llm_context && (e.llm_context.action_type === 'SKILL_SELECTION' || e.llm_context.action_type === 'SKILL_ACTIVATION')),
    window_navigation: sessionMemory.filter(e => e.llm_context && e.llm_context.action_type === 'WINDOW_NAVIGATION'),
    system_controls: sessionMemory.filter(e => e.llm_context && e.llm_context.action_type === 'SYSTEM_CONTROL')
  }
  
  // Extract current context using active skill variable
  const currentSkill = activeSkill // Use the global active skill variable
  const currentWindow = activities.window_navigation.length > 0 ? 
    activities.window_navigation[activities.window_navigation.length - 1].details.window : 'main'
  const isRecording = activities.speech_events.length % 2 === 1 // Odd number means recording is active
  
  // Generate workflow summary with safety checks
  const workflowSteps = sessionMemory.map((event, index) => ({
    step: index + 1,
    time: event.time,
    action: event.llm_context ? event.llm_context.action_type : event.action,
    summary: event.llm_context ? event.llm_context.context_summary : `${event.action} performed`,
    content: event.llm_context ? event.llm_context.primary_content : (event.details ? JSON.stringify(event.details).substring(0, 50) + '...' : 'No content')
  }))
  
  return {
    session_summary: `Session started at ${firstEvent.time}, duration: ${durationMinutes} minutes`,
    total_events: sessionMemory.length,
    session_duration: `${durationMinutes} minutes`,
    current_context: {
      active_window: currentWindow,
      active_skill: currentSkill,
      recording_status: isRecording ? 'active' : 'inactive',
      last_action: lastEvent.llm_context ? lastEvent.llm_context.context_summary : `${lastEvent.action} performed`
    },
    activity_breakdown: {
      screenshots_taken: activities.screenshots.length,
      speech_sessions: Math.floor(activities.speech_events.length / 2),
      text_inputs: activities.text_inputs.length,
      skills_used: [...new Set(activities.skill_activities.map(e => e.details.skill))],
      window_switches: activities.window_navigation.length
    },
    workflow_timeline: workflowSteps,
    recent_activities: sessionMemory.slice(-5).map(e => ({
      time: e.time,
      action: e.llm_context ? e.llm_context.action_type : e.action,
      summary: e.llm_context ? e.llm_context.context_summary : `${e.action} performed`
    })),
    llm_context: {
      user_workflow: generateWorkflowDescription(activities),
      primary_activities: getPrimaryActivities(activities),
      current_context: `User is in ${currentWindow} window${currentSkill ? ` with ${currentSkill} skill active` : ''}${isRecording ? ' and currently recording speech' : ''}`,
      session_focus: determineSessionFocus(activities)
    }
  }
}

function generateWorkflowDescription(activities) {
  const parts = []
  
  if (activities.screenshots.length > 0) {
    parts.push(`captured ${activities.screenshots.length} screenshots with OCR`)
  }
  
  if (activities.speech_events.length > 0) {
    parts.push(`conducted ${Math.floor(activities.speech_events.length / 2)} speech recognition sessions`)
  }
  
  if (activities.text_inputs.length > 0) {
    parts.push(`entered ${activities.text_inputs.length} text inputs`)
  }
  
  if (activities.skill_activities.length > 0) {
    const skills = [...new Set(activities.skill_activities.map(e => e.details && e.details.skill ? e.details.skill : 'unknown').filter(skill => skill !== 'unknown'))]
    if (skills.length > 0) {
      parts.push(`worked with skills: ${skills.join(', ')}`)
    }
  }
  
  return parts.length > 0 ? `User ${parts.join(', ')}` : "User has not performed any major activities"
}

function getPrimaryActivities(activities) {
  const primary = []
  
  if (activities.screenshots.length > 0) primary.push('SCREENSHOT_OCR')
  if (activities.speech_events.length > 0) primary.push('SPEECH_RECOGNITION')
  if (activities.text_inputs.length > 0) primary.push('TEXT_INPUT')
  if (activities.skill_activities.length > 0) primary.push('SKILL_WORK')
  if (activities.window_navigation.length > 0) primary.push('WINDOW_NAVIGATION')
  
  return primary
}

function determineSessionFocus(activities) {
  const counts = {
    screenshots: activities.screenshots.length,
    speech: activities.speech_events.length,
    text: activities.text_inputs.length,
    skills: activities.skill_activities.length,
    navigation: activities.window_navigation.length
  }
  
  const maxCount = Math.max(...Object.values(counts))
  
  if (counts.screenshots === maxCount) return 'SCREENSHOT_AND_OCR_WORK'
  if (counts.speech === maxCount) return 'SPEECH_RECOGNITION_WORK'
  if (counts.text === maxCount) return 'TEXT_INPUT_WORK'
  if (counts.skills === maxCount) return 'SKILL_PRACTICE_WORK'
  if (counts.navigation === maxCount) return 'WINDOW_NAVIGATION_WORK'
  
  return 'MIXED_ACTIVITIES'
}

function clearSessionMemory() {
  sessionMemory = []
  
  // Reset prompt tracking when session is cleared
  promptLoader.resetSession()
  
  console.log('[SESSION] Memory cleared and prompt tracking reset')
  
  // Notify all windows
  if (mainWindow) {
    mainWindow.webContents.send('session-cleared')
  }
  if (chatWindow) {
    chatWindow.webContents.send('session-cleared')
  }
  if (skillsWindow) {
    skillsWindow.webContents.send('session-cleared')
  }
  if (llmResponseWindow) {
    llmResponseWindow.webContents.send('session-cleared')
  }
}

function formatSessionHistory() {
  if (sessionMemory.length === 0) {
    return "No session history available."
  }
  
  let history = "📋 Session History:\n\n"
  
  sessionMemory.forEach((event, index) => {
    const time = event.time
    const action = event.action
    const details = event.details
    
    history += `${index + 1}. [${time}] ${action}\n`
    
    if (details.text) {
      history += `   Text: "${details.text}"\n`
    }
    if (details.skill) {
      history += `   Skill: ${details.skill}\n`
    }
    if (details.window) {
      history += `   Window: ${details.window}\n`
    }
    if (details.ocrText) {
      history += `   OCR: "${details.ocrText.substring(0, 100)}${details.ocrText.length > 100 ? '...' : ''}"\n`
    }
    
    history += "\n"
  })
  
  return history
}

// IPC handlers for session memory
ipcMain.handle('get-session-history', () => {
  return getSessionHistory()
})

ipcMain.handle('get-llm-session-history', () => {
  return getLLMOptimizedSessionHistory()
})

ipcMain.handle('clear-session-memory', () => {
  clearSessionMemory()
  return { success: true, message: 'Session memory cleared' }
})

ipcMain.handle('format-session-history', () => {
  return formatSessionHistory()
})

// IPC handlers
ipcMain.handle('take-screenshot', async () => {
  try {
    await takeScreenshotAndOCR()
    return { success: true }
  } catch (error) {
    console.error('Screenshot IPC error:', error)
    return { success: false, error: error.message }
  }
})

// LLM processing function
async function processOCRWithLLM(ocrText, activeSkill = null) {
  try {
    console.log('Processing OCR text with LLM...')
    console.log('OCR Text:', ocrText)
    console.log('Active Skill:', activeSkill)
    
    // Get current session context for better LLM understanding
    const sessionContext = getLLMOptimizedSessionHistory()
    
    // Load prompts from files
    promptLoader.loadPrompts()
    
    // Use PromptLoader to prepare Gemini request with proper system prompts
    const geminiRequest = promptLoader.prepareGeminiRequest(
      activeSkill || 'general', 
      `Analyze this content: ${ocrText}`, 
      sessionMemory
    )
    
    console.log(`Using ${geminiRequest.isUsingModelMemory ? 'model memory' : 'regular message'} for skill: ${geminiRequest.skillUsed}`)
    
    // Call Gemini with the prepared request
    const llmResponse = await callGeminiWithRequest(geminiRequest, ocrText, activeSkill)
    console.log('LLM Response:', llmResponse)
    
    // Update session memory with PromptLoader
    sessionMemory = promptLoader.updateStoredMemory(
      sessionMemory, 
      geminiRequest.skillUsed, 
      geminiRequest.isUsingModelMemory, 
      ocrText, 
      llmResponse
    )
    
    // Also add to legacy session memory for compatibility
    addToSessionMemory('OCR processed with LLM', {
      ocrText: ocrText,
      skill: activeSkill,
      llmResponse: llmResponse
    })
    
    // Send response to all windows
    if (mainWindow) {
      mainWindow.webContents.send('llm-response', { 
        ocrText: ocrText,
        skill: activeSkill,
        response: llmResponse
      })
    }
    if (chatWindow) {
      chatWindow.webContents.send('llm-response', { 
        ocrText: ocrText,
        skill: activeSkill,
        response: llmResponse
      })
    }
    if (skillsWindow) {
      skillsWindow.webContents.send('llm-response', { 
        ocrText: ocrText,
        skill: activeSkill,
        response: llmResponse
      })
    }
    
    // Send data to LLM response window (window is already created with loading state)
    setTimeout(() => {
      if (llmResponseWindow && !llmResponseWindow.isDestroyed()) {
        console.log('Sending LLM response data to window:', { 
          skill: activeSkill,
          responseLength: llmResponse.length
        })
        
        // First expand the window to full size
        console.log('About to expand LLM response window...')
        expandLLMResponseWindow()
        
        // Then send the response data after a longer delay to ensure expansion completes
        setTimeout(() => {
          console.log('Sending response data to expanded window...')
          llmResponseWindow.webContents.send('display-llm-response', { 
            skill: activeSkill,
            response: llmResponse
          })
        }, 500)
        
        // Force window to front
        llmResponseWindow.setAlwaysOnTop(true)
        setTimeout(() => llmResponseWindow.setAlwaysOnTop(false), 1000)
      } else {
        console.error('LLM response window is not available or destroyed')
      }
    }, 1000)
    
    console.log('LLM processing completed' ,llmResponse)
    return llmResponse
    
  } catch (error) {
    console.error('LLM processing error:', error)
    addToSessionMemory('OCR LLM processing failed', {
      ocrText: ocrText,
      skill: activeSkill,
      error: error.message
    })
    
    // Send error to windows
    const errorResponse = {
      ocrText: ocrText,
      skill: activeSkill,
      error: error.message,
      response: 'LLM processing failed. Please try again.'
    }
    
    if (mainWindow) {
      mainWindow.webContents.send('llm-error', errorResponse)
    }
    if (chatWindow) {
      chatWindow.webContents.send('llm-error', errorResponse)
    }
    if (skillsWindow) {
      skillsWindow.webContents.send('llm-error', errorResponse)
    }
    
    return null
  }
}



async function callGeminiWithRequest(geminiRequest, ocrText, activeSkill) {
  try {
    console.log('Calling Gemini Flash 1.5 with structured request...')
    console.log('Request type:', geminiRequest.isUsingModelMemory ? 'Model Memory' : 'Regular Message')
    console.log('Skill:', geminiRequest.skillUsed)
    
    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not found in environment variables. Using fallback response.')
      return generateFallbackResponseFromPrompts(ocrText, activeSkill)
    }
    
    // Prepare the model with system instruction if using model memory
    let modelToUse = model
    if (geminiRequest.systemInstruction) {
      modelToUse = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        systemInstruction: geminiRequest.systemInstruction
      })
      console.log('Using model with system instruction')
    }
    
    // Generate content with Gemini Flash 1.5
    // Debug: Log the request structure
    console.log('Gemini request contents structure:', JSON.stringify(geminiRequest.contents, null, 2))
    
    // Fix the contents structure for the Gemini API
    // The API expects either a string or an array of Content objects
    let contentToSend;
    
    if (Array.isArray(geminiRequest.contents) && geminiRequest.contents.length > 0) {
      // Extract the text from the structured content
      const userContent = geminiRequest.contents.find(content => content.role === 'user');
      if (userContent && userContent.parts && userContent.parts[0] && userContent.parts[0].text) {
        contentToSend = userContent.parts[0].text;
      } else {
        contentToSend = 'Analyze the provided content.';
      }
    } else {
      contentToSend = 'Analyze the provided content.';
    }
    
    console.log('Sending to Gemini:', contentToSend.substring(0, 100) + '...')
    
    const result = await modelToUse.generateContent(contentToSend)
    const response = await result.response
    const text = response.text()
    
    console.log('Gemini Flash 1.5 response received:', text.substring(0, 200) + '...')
    return text
    
  } catch (error) {
    console.error('Gemini Flash 1.5 API error:', error)
    
    // Fallback to prompt-based response if API fails
    console.log('Falling back to prompt-based response due to API error')
    return generateFallbackResponseFromPrompts(ocrText, activeSkill)
  }
}

function generateFallbackResponseFromPrompts(ocrText, activeSkill) {
  try {
    // Load prompts and get the system prompt for the active skill
    promptLoader.loadPrompts()
    const skillPrompt = promptLoader.getSkillPrompt(activeSkill || 'general')
    
    if (skillPrompt) {
      console.log(`Using ${activeSkill} system prompt for offline fallback response`)
      
      // Extract key guidance from the actual prompt content
      let response = `# ${activeSkill ? activeSkill.toUpperCase() : 'GENERAL'} Expert Analysis\n\n`
      response += `**Content:** ${ocrText}\n\n`
      
      // Use the actual prompt content to generate a contextual response
      // The system prompts are designed as helper agents, so we can extract their structure
      if (skillPrompt.includes('IMMEDIATE') || skillPrompt.includes('Quick')) {
        response += `**Immediate Action Required:**\n`
        response += `This content requires expert ${activeSkill} analysis. `
        
        // Extract specific methodologies from the prompt
        if (skillPrompt.includes('naive') && skillPrompt.includes('optimal')) {
          response += `Apply the naive→optimal approach: start simple, then optimize.\n\n`
        } else if (skillPrompt.includes('STAR') || skillPrompt.includes('Situation')) {
          response += `Structure using STAR format for clear impact.\n\n`
        } else if (skillPrompt.includes('statistics') || skillPrompt.includes('numbers')) {
          response += `Support with compelling statistics and data points.\n\n`
        } else if (skillPrompt.includes('clarifying questions')) {
          response += `Begin by asking clarifying questions to understand requirements.\n\n`
        }
      }
      
      // Extract actionable framework from the prompt
      if (skillPrompt.includes('1.') || skillPrompt.includes('- ')) {
        response += `**Expert Framework Applied:**\n`
        response += `Following the structured ${activeSkill} methodology for optimal results.\n\n`
      }
      
      // If the prompt mentions specific techniques, highlight them
      if (skillPrompt.includes('dry run')) {
        response += `**Analysis Approach:** Dry run with concrete examples\n`
      }
      if (skillPrompt.includes('capacity estimation') || skillPrompt.includes('QPS')) {
        response += `**Scale Considerations:** Calculate capacity with real numbers\n`
      }
      if (skillPrompt.includes('objection handling')) {
        response += `**Strategy:** Address concerns with data-driven responses\n`
      }
      
      response += `\n**Status:** Offline mode using ${activeSkill} expert framework. `
      response += `Connect API for full interactive analysis.\n\n`
      response += `**Next Step:** Apply the loaded ${activeSkill} prompt methodology to this specific content.`
      
      return response
    } else {
      console.log(`No prompt found for skill: ${activeSkill}`)
      return generateLegacyFallbackResponse(ocrText, activeSkill)
    }
  } catch (error) {
    console.error('Error generating prompt-based fallback:', error)
    return generateLegacyFallbackResponse(ocrText, activeSkill)
  }
}

function generateLegacyFallbackResponse(ocrText, activeSkill) {
  // Final fallback when even prompt loading fails
  return `# ${activeSkill ? activeSkill.toUpperCase() : 'GENERAL'} Analysis\n\n` +
    `**Content:** ${ocrText}\n\n` +
    `**Status:** System prompts failed to load. Please check your prompts folder and restart the application.\n\n` +
    `**Manual Action Required:** This content needs to be analyzed using the ${activeSkill || 'appropriate'} expertise framework.`
}

// IPC handlers for dynamic window sizing
ipcMain.handle('expand-llm-window', (event, contentMetrics) => {
  console.log('Received expand-llm-window request with metrics:', contentMetrics)
  expandLLMResponseWindow(contentMetrics)
  return { success: true }
})

ipcMain.handle('resize-llm-window-for-content', (event, contentMetrics) => {
  console.log('Received resize request with content metrics:', contentMetrics)
  
  try {
    if (llmResponseWindow && !llmResponseWindow.isDestroyed()) {
      const { width, height } = calculateOptimalWindowSize(contentMetrics)
      const currentBounds = llmResponseWindow.getBounds()
      
      // Validate the calculated dimensions
      const validWidth = Math.max(300, Math.min(width || 800, 2000))
      const validHeight = Math.max(200, Math.min(height || 400, 1500))
      
      console.log(`Calculated size: ${width}x${height}, Using validated size: ${validWidth}x${validHeight}`)
      
      llmResponseWindow.setBounds({
        x: Math.round(currentBounds.x),
        y: Math.round(currentBounds.y),
        width: Math.round(validWidth),
        height: Math.round(validHeight)
      })
      
      console.log(`Successfully resized window to ${validWidth}x${validHeight} based on content`)
      return { success: true, newSize: { width: validWidth, height: validHeight } }
    }
    return { success: false, error: 'Window not available' }
  } catch (error) {
    console.error('Error resizing window for content:', error)
    return { success: false, error: error.message }
  }
})

// IPC handlers for LLM configuration
ipcMain.handle('set-gemini-api-key', async (event, apiKey) => {
  try {
    // Update the environment variable
    process.env.GEMINI_API_KEY = apiKey
    
    // Test the API key with a simple request
    const testModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await testModel.generateContent('Hello')
    await result.response
    
    console.log('Gemini API key configured successfully')
    addToSessionMemory('Gemini API key configured', { status: 'success' })
    
    return { success: true, message: 'API key configured successfully' }
  } catch (error) {
    console.error('Failed to configure Gemini API key:', error)
    addToSessionMemory('Gemini API key configuration failed', { error: error.message })
    
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-gemini-status', async () => {
  const hasApiKey = !!process.env.GEMINI_API_KEY
  return {
    hasApiKey: hasApiKey,
    isConfigured: hasApiKey,
    model: 'gemini-1.5-flash'
  }
})

ipcMain.handle('test-gemini-connection', async () => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return { success: false, error: 'No API key configured' }
    }
    
    const testModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await testModel.generateContent('Test connection')
    await result.response
    
    return { success: true, message: 'Connection successful' }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

function createLLMResponseWindow() {
  // Get main window position and size
  const mainBounds = mainWindow.getBounds()
  const screenSize = screen.getPrimaryDisplay().workAreaSize
  
  // Start with small compact size for loading
  const compactWidth = 220
  const compactHeight = 80
  
  // Center the compact window on screen initially
  const windowX = Math.max(50, Math.min(
    mainBounds.x + (mainBounds.width - compactWidth) / 2,
    screenSize.width - compactWidth - 50
  ))
  const windowY = Math.max(50, Math.min(
    mainBounds.y + mainBounds.height + 10,
    screenSize.height - compactHeight - 50
  ))
  
  llmResponseWindow = new BrowserWindow({
    width: compactWidth,
    height: compactHeight,
    x: windowX,
    y: windowY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      enableRemoteModule: true,
      additionalArguments: ['--enable-media-stream']
    },
    show: false,
    title: 'WindowServer'
  })

  // Critical: Set window properties for desktop following
  if (process.platform === 'darwin') {
    llmResponseWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    llmResponseWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    
    // Force the window to follow desktop changes
    app.on('browser-window-focus', () => {
      if (llmResponseWindow && llmResponseWindow.isVisible()) {
        llmResponseWindow.setAlwaysOnTop(true, 'screen-saver', 1)
        llmResponseWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      }
    })
  }

  // Load the LLM response HTML file
  llmResponseWindow.loadFile('llm-response.html')
  
  // Show window when ready
  llmResponseWindow.once('ready-to-show', () => {
    llmResponseWindow.show()
    llmResponseWindow.focus()
  })

  // Handle window close
  llmResponseWindow.on('closed', () => {
    llmResponseWindow = null
    activeWindow = 'main'
  })

  // Handle window focus
  llmResponseWindow.on('focus', () => {
    activeWindow = 'llm-response'
  })

  console.log('LLM Response window created (compact mode)')
}

// Skill management functions
function getNextSkill() {
  const skills = ['dsa', 'behavioral', 'system-design', 'sales', 'presentation', 'negotiation', 'data-science', 'programming', 'devops']
  const currentIndex = skills.indexOf(activeSkill)
  const nextIndex = (currentIndex + 1) % skills.length
  return skills[nextIndex]
}

function getPreviousSkill() {
  const skills = ['dsa', 'behavioral', 'system-design', 'sales', 'presentation', 'negotiation', 'data-science', 'programming', 'devops']
  const currentIndex = skills.indexOf(activeSkill)
  const prevIndex = (currentIndex - 1 + skills.length) % skills.length
  return skills[prevIndex]
}

function setActiveSkill(skill) {
  const oldSkill = activeSkill
  activeSkill = skill
  
  // Clear session memory when changing skills for a fresh start
  if (oldSkill !== skill) {
    console.log(`Clearing session memory due to skill change: ${oldSkill} → ${skill}`)
    clearSessionMemory()
    
    // Add initial event to the fresh memory
    addToSessionMemory('Skill changed', { 
      oldSkill: oldSkill, 
      newSkill: skill,
      memoryCleared: true
    })
  }
  
  // Update all windows with new skill
  if (mainWindow) {
    mainWindow.webContents.send('skill-changed', { skill: skill })
  }
  if (chatWindow) {
    chatWindow.webContents.send('skill-changed', { skill: skill })
  }
  if (skillsWindow) {
    skillsWindow.webContents.send('skill-changed', { skill: skill })
  }
  if (llmResponseWindow) {
    llmResponseWindow.webContents.send('skill-changed', { skill: skill })
  }
  
  console.log(`Active skill changed from ${oldSkill} to ${skill} (memory cleared)`)
}

function moveActiveWindow(direction) {
  const moveDistance = 20;
  let windowsToMove = [];
  
  // Always move main window and LLM response window together
  if (mainWindow) {
    windowsToMove.push(mainWindow);
  }
  if (llmResponseWindow && llmResponseWindow.isVisible()) {
    windowsToMove.push(llmResponseWindow);
  }
  
  windowsToMove.forEach(window => {
    const bounds = window.getBounds();
    let newX = bounds.x;
    let newY = bounds.y;
    
    switch (direction) {
      case 'up':
        newY = bounds.y - moveDistance;
        break;
      case 'down':
        newY = bounds.y + moveDistance;
        break;
      case 'left':
        newX = bounds.x - moveDistance;
        break;
      case 'right':
        newX = bounds.x + moveDistance;
        break;
    }
    
    window.setPosition(newX, newY);
  });
  
  console.log(`Moved windows ${direction} by ${moveDistance}px`);
  addToSessionMemory('Windows moved', { direction: direction, distance: moveDistance });
}

function calculateOptimalWindowSize(contentMetrics) {
  try {
    const mainBounds = mainWindow ? mainWindow.getBounds() : { width: 1000 }
    const screenSize = screen.getPrimaryDisplay().workAreaSize
    
    // Base dimensions with safety checks
    const minWidth = 800
    const maxWidth = Math.min(screenSize.width * 0.9, 1400)
    const minHeight = 300
    const maxHeight = Math.min(screenSize.height * 0.85, 1200)
    
    // Calculate width based on content
    let optimalWidth = Math.max(minWidth, mainBounds.width || minWidth)
    if (contentMetrics && contentMetrics.hasCode) {
      // Code content needs more width for split layout
      optimalWidth = Math.max(1000, optimalWidth)
    }
    optimalWidth = Math.min(optimalWidth, maxWidth)
    
    // Calculate height based on content
    let optimalHeight = minHeight
    
    if (contentMetrics && typeof contentMetrics === 'object') {
      const lineCount = Math.max(0, parseInt(contentMetrics.lineCount) || 0)
      const codeBlocks = Math.max(0, parseInt(contentMetrics.codeBlocks) || 0)
      const hasLongLines = contentMetrics.hasLongLines || false
      
      // Base calculation: ~20px per line of content
      const contentHeight = Math.max(lineCount * 20, 200)
      
      // Add extra height for code blocks
      const codeHeight = codeBlocks * 100
      
      // Add extra height for long lines (need more wrapping space)
      const longLineBonus = hasLongLines ? 100 : 0
      
      // Total content height with padding
      const totalContentHeight = contentHeight + codeHeight + longLineBonus + 100 // +100 for padding
      
      optimalHeight = Math.min(totalContentHeight, maxHeight)
      optimalHeight = Math.max(optimalHeight, minHeight)
    }
    
    // Ensure values are finite numbers
    const finalWidth = isFinite(optimalWidth) ? optimalWidth : minWidth
    const finalHeight = isFinite(optimalHeight) ? optimalHeight : minHeight
    
    console.log('Calculated optimal size:', { 
      width: finalWidth, 
      height: finalHeight, 
      contentMetrics,
      screenSize,
      bounds: { minWidth, maxWidth, minHeight, maxHeight }
    })
    
    return { width: finalWidth, height: finalHeight }
  } catch (error) {
    console.error('Error calculating optimal window size:', error)
    // Return safe defaults
    return { width: 800, height: 400 }
  }
}

function expandLLMResponseWindow(contentMetrics = null) {
  if (!llmResponseWindow) {
    console.error('Cannot expand LLM response window - window does not exist')
    return
  }
  
  if (llmResponseWindow.isDestroyed()) {
    console.error('Cannot expand LLM response window - window is destroyed')
    return
  }
  
  // Get current window bounds for comparison
  const currentBounds = llmResponseWindow.getBounds()
  console.log('Current window bounds:', currentBounds)
  
  // Calculate optimal size based on content
  const { width: windowWidth, height: windowHeight } = calculateOptimalWindowSize(contentMetrics)
  
  // Calculate position
  const mainBounds = mainWindow.getBounds()
  const screenSize = screen.getPrimaryDisplay().workAreaSize
  
  const windowX = mainBounds.x
  const windowY = Math.max(50, mainBounds.y + mainBounds.height + 10)
  
  // Ensure window doesn't go off screen
  const maxY = screenSize.height - windowHeight - 50
  const finalY = Math.min(windowY, maxY)
  
  console.log(`Expanding LLM Response window from ${currentBounds.width}x${currentBounds.height} to ${windowWidth}x${windowHeight}`)
  console.log(`New position: (${windowX}, ${finalY})`)
  
  // Set bounds immediately with validation
  try {
    // Validate all values before setting bounds
    const validX = Math.round(isFinite(windowX) ? windowX : 100)
    const validY = Math.round(isFinite(finalY) ? finalY : 100)
    const validWidth = Math.round(isFinite(windowWidth) ? windowWidth : 800)
    const validHeight = Math.round(isFinite(windowHeight) ? windowHeight : 400)
    
    console.log(`Setting bounds: x=${validX}, y=${validY}, width=${validWidth}, height=${validHeight}`)
    
    llmResponseWindow.setBounds({
      x: validX,
      y: validY,
      width: validWidth,
      height: validHeight
    })
    
    // Verify the expansion worked
    const newBounds = llmResponseWindow.getBounds()
    console.log('Verified new bounds:', newBounds)
    
    // Make sure window is visible and on top
    if (!llmResponseWindow.isVisible()) {
      llmResponseWindow.show()
    }
    llmResponseWindow.focus()
    
  } catch (error) {
    console.error('Error expanding LLM response window:', error)
    // Fallback to safe size
    try {
      llmResponseWindow.setBounds({ x: 100, y: 100, width: 800, height: 400 })
    } catch (fallbackError) {
      console.error('Even fallback resize failed:', fallbackError)
    }
  }
}

function showLLMResponseWindowWithLoading() {
  // Create and show LLM response window if it doesn't exist
  if (!llmResponseWindow) {
    createLLMResponseWindow()
  }
  
  // Ensure window is shown and focused
  if (llmResponseWindow) {
    if (!llmResponseWindow.isVisible()) {
      llmResponseWindow.show()
    }
    llmResponseWindow.focus()
    activeWindow = 'llm-response'
    
    // Set initial interaction state to match global state
    llmResponseWindow.setIgnoreMouseEvents(!isWindowInteractive, { forward: true })
    
    // Ensure desktop following properties are set
    if (process.platform === 'darwin') {
      llmResponseWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      llmResponseWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    
    // Send current interaction state
    if (isWindowInteractive) {
      llmResponseWindow.webContents.send('interaction-enabled')
    } else {
      llmResponseWindow.webContents.send('interaction-disabled')
    }
    
    // Send loading state to window (stays compact during loading)
    llmResponseWindow.webContents.send('show-loading')
  }
}