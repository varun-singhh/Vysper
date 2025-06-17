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
  
  // Categorize activities
  const activities = {
    screenshots: sessionMemory.filter(e => e.llm_context.action_type === 'SCREENSHOT_OCR'),
    speech_events: sessionMemory.filter(e => e.llm_context.action_type === 'SPEECH_START' || e.llm_context.action_type === 'SPEECH_STOP'),
    transcriptions: sessionMemory.filter(e => e.llm_context.action_type === 'TRANSCRIPTION'),
    text_inputs: sessionMemory.filter(e => e.llm_context.action_type === 'TEXT_INPUT'),
    skill_activities: sessionMemory.filter(e => e.llm_context.action_type === 'SKILL_SELECTION' || e.llm_context.action_type === 'SKILL_ACTIVATION'),
    window_navigation: sessionMemory.filter(e => e.llm_context.action_type === 'WINDOW_NAVIGATION'),
    system_controls: sessionMemory.filter(e => e.llm_context.action_type === 'SYSTEM_CONTROL')
  }
  
  // Extract current context using active skill variable
  const currentSkill = activeSkill // Use the global active skill variable
  const currentWindow = activities.window_navigation.length > 0 ? 
    activities.window_navigation[activities.window_navigation.length - 1].details.window : 'main'
  const isRecording = activities.speech_events.length % 2 === 1 // Odd number means recording is active
  
  // Generate workflow summary
  const workflowSteps = sessionMemory.map((event, index) => ({
    step: index + 1,
    time: event.time,
    action: event.llm_context.action_type,
    summary: event.llm_context.context_summary,
    content: event.llm_context.primary_content
  }))
  
  return {
    session_summary: `Session started at ${firstEvent.time}, duration: ${durationMinutes} minutes`,
    total_events: sessionMemory.length,
    session_duration: `${durationMinutes} minutes`,
    current_context: {
      active_window: currentWindow,
      active_skill: currentSkill,
      recording_status: isRecording ? 'active' : 'inactive',
      last_action: lastEvent.llm_context.context_summary
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
      action: e.llm_context.action_type,
      summary: e.llm_context.context_summary
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
    const skills = [...new Set(activities.skill_activities.map(e => e.details.skill))]
    parts.push(`worked with skills: ${skills.join(', ')}`)
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
  console.log('[SESSION] Memory cleared')
  
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
    
    // Build the prompt based on skill and content
    let prompt = buildLLMPrompt(ocrText, activeSkill, sessionContext)
    
    // For now, we'll use a mock LLM response
    // In production, you would integrate with OpenAI, Claude, or other LLM APIs
    const llmResponse = await mockLLMResponse(prompt, ocrText, activeSkill)
    
    // Add to session memory
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
        
        llmResponseWindow.webContents.send('display-llm-response', { 
          skill: activeSkill,
          response: llmResponse
        })
        
        // Force window to front
        llmResponseWindow.setAlwaysOnTop(true)
        setTimeout(() => llmResponseWindow.setAlwaysOnTop(false), 1000)
      } else {
        console.error('LLM response window is not available or destroyed')
      }
    }, 1000)
    
    console.log('LLM processing completed')
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

function buildLLMPrompt(ocrText, activeSkill, sessionContext) {
  let prompt = `You are an expert AI assistant analyzing OCR text from screenshots. Please provide a comprehensive, well-structured response.

OCR Text: "${ocrText}"

Current Context:
- Active Skill: ${activeSkill || 'None'}
- Session Focus: ${sessionContext.llm_context.session_focus}
- User Workflow: ${sessionContext.llm_context.user_workflow}

Instructions:`

  if (activeSkill) {
    switch (activeSkill.toLowerCase()) {
      case 'dsa':
        prompt += `
This appears to be a DSA (Data Structures and Algorithms) related query. Please provide a comprehensive response:

1. **Content Analysis**: Determine if this is a coding problem, algorithm question, or concept explanation
2. **If it's a coding problem**, format it as a complete programming question with:
   - Clear problem statement
   - Input format and constraints (time limits, memory limits, data ranges)
   - Output format and requirements
   - Multiple sample test cases with inputs and expected outputs
   - Time and space complexity considerations
   - Recommended approach/algorithm with step-by-step explanation
   - Complete solution code in Python/Java/C++
   - Edge cases and optimization tips
3. **If it's a concept question**, provide detailed explanation with:
   - Core concepts and definitions
   - Visual examples or diagrams (describe them)
   - Implementation examples
   - Common applications and use cases
   - Related algorithms or data structures
4. **Always include**: Key insights, common pitfalls to avoid, and best practices

Format your response with clear headings, code blocks, and bullet points for readability.`
        break
        
      case 'behavioral':
        prompt += `
This appears to be a behavioral interview related query. Please provide a comprehensive response:

1. **Question Analysis**: Identify the behavioral competencies being assessed
2. **STAR Method Framework**: Provide structured response with:
   - **Situation**: Context and background
   - **Task**: Your specific responsibility and goals
   - **Action**: Detailed steps you took (use "I" statements)
   - **Result**: Quantifiable outcomes and impact
3. **Key Competencies**: List the skills being evaluated
4. **Sample Talking Points**: 3-5 specific points to emphasize
5. **Follow-up Questions**: Common follow-up questions to prepare for
6. **Communication Tips**: How to effectively deliver this response
7. **Alternative Scenarios**: Variations of this question

Focus on specific examples, quantifiable results, and personal growth.`
        break
        
      case 'sales':
        prompt += `
This appears to be a sales related query. Please provide a comprehensive response:

1. **Query Analysis**: Identify the sales challenge or technique being discussed
2. **Sales Framework**: Provide structured approach with:
   - **Customer Understanding**: Needs analysis and pain points
   - **Value Proposition**: Unique benefits and features
   - **Objection Handling**: Common objections and responses
   - **Closing Strategies**: Effective closing techniques
   - **Follow-up**: Post-sale relationship building
3. **Best Practices**: Specific actionable tips
4. **Common Mistakes**: What to avoid
5. **Tools and Resources**: Recommended approaches
6. **Success Metrics**: How to measure effectiveness

Include specific scripts, techniques, and real-world examples.`
        break
        
      case 'presentation':
        prompt += `
This appears to be a presentation related query. Please provide a comprehensive response:

1. **Query Analysis**: Identify the presentation aspect being discussed
2. **Presentation Structure**: Provide detailed guidance on:
   - **Opening (10%)**: Hook, objective, agenda
   - **Body (80%)**: Main points, evidence, visual aids
   - **Closing (10%)**: Summary, call to action, Q&A
3. **Delivery Techniques**: Voice, body language, engagement
4. **Visual Design**: Slide design principles and tools
5. **Audience Engagement**: Interactive elements and questions
6. **Common Mistakes**: What to avoid
7. **Practice Tips**: How to prepare effectively

Include specific examples, templates, and actionable advice.`
        break
        
      case 'data-science':
        prompt += `
This appears to be a data science related query. Please provide a comprehensive response:

1. **Query Analysis**: Identify the data science aspect being discussed
2. **Methodological Approach**: Provide structured guidance on:
   - **Data Preprocessing**: Cleaning, validation, feature engineering
   - **Analysis/Modeling**: Statistical analysis, ML algorithms, model selection
   - **Evaluation**: Performance metrics, validation, interpretation
3. **Code Examples**: Provide Python/R code snippets
4. **Best Practices**: Data quality, model interpretability, documentation
5. **Tools and Libraries**: Recommended technologies
6. **Common Challenges**: Pitfalls and solutions
7. **Success Metrics**: How to measure project success

Include practical code examples, statistical concepts, and real-world applications.`
        break
        
      default:
        prompt += `
Please provide a comprehensive analysis and response based on the general context of the query. Include:
1. Content type assessment
2. Relevant insights and analysis
3. Practical recommendations
4. Additional resources or references`
    }
  } else {
    prompt += `
Please analyze this text and provide:
1. **Content Assessment**: Whether this is a question, description, or other type of content
2. **Appropriate Response**: Based on the content type and context
3. **Technical Analysis**: If it appears to be technical or coding-related, provide structured problem format
4. **General Guidance**: If it's a general question, provide clear and helpful explanation
5. **Actionable Insights**: Practical recommendations and next steps

Format your response with clear headings, bullet points, and structured information.`
  }
  
  prompt += `

Please provide a comprehensive, well-structured response that is immediately actionable and helpful. Use markdown formatting for better readability.`
  
  return prompt
}

async function mockLLMResponse(prompt, ocrText, activeSkill) {
  try {
    console.log('Calling Gemini Flash 1.5 with prompt:', prompt.substring(0, 200) + '...')
    
    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not found in environment variables. Using fallback response.')
      return generateFallbackResponse(ocrText, activeSkill)
    }
    
    // Generate content with Gemini Flash 1.5
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    
    console.log('Gemini Flash 1.5 response received:', text.substring(0, 200) + '...')
    return text
    
  } catch (error) {
    console.error('Gemini Flash 1.5 API error:', error)
    
    // Fallback to mock response if API fails
    console.log('Falling back to mock response due to API error')
    return generateFallbackResponse(ocrText, activeSkill)
  }
}

function generateFallbackResponse(ocrText, activeSkill) {
  // Analyze the OCR text to determine content type
  const isQuestion = /[?]/.test(ocrText) || /^(what|how|why|when|where|which|who)/i.test(ocrText)
  const isTechnical = /(algorithm|code|program|function|data structure|complexity|sort|search|tree|graph|array|string|number)/i.test(ocrText)
  const isCoding = /(code|program|function|class|method|variable|loop|condition|recursion|dynamic programming|greedy|backtracking)/i.test(ocrText)
  
  let response = ''
  
  if (activeSkill && activeSkill.toLowerCase() === 'dsa' && (isTechnical || isCoding)) {
    response = formatDSAProblem(ocrText)
  } else if (activeSkill && activeSkill.toLowerCase() === 'behavioral') {
    response = formatBehavioralResponse(ocrText)
  } else if (activeSkill && activeSkill.toLowerCase() === 'sales') {
    response = formatSalesResponse(ocrText)
  } else if (activeSkill && activeSkill.toLowerCase() === 'presentation') {
    response = formatPresentationResponse(ocrText)
  } else if (activeSkill && activeSkill.toLowerCase() === 'data-science') {
    response = formatDataScienceResponse(ocrText)
  } else if (isQuestion) {
    response = formatGeneralQuestion(ocrText)
  } else {
    response = formatGeneralResponse(ocrText)
  }
  
  return response
}

function formatDSAProblem(ocrText) {
  return '## DSA Problem Analysis\n\n' +
    '**Problem Statement:**\n' +
    ocrText + '\n\n' +
    '**Input Format:**\n' +
    '- The input consists of [describe input format based on context]\n' +
    '- Constraints: [specify constraints]\n\n' +
    '**Output Format:**\n' +
    '- Return [describe expected output]\n\n' +
    '**Sample Test Cases:**\n\n' +
    '**Test Case 1:**\n' +
    '```\n' +
    'Input: [sample input]\n' +
    'Output: [expected output]\n' +
    'Explanation: [brief explanation]\n' +
    '```\n\n' +
    '**Test Case 2:**\n' +
    '```\n' +
    'Input: [sample input]\n' +
    'Output: [expected output]\n' +
    'Explanation: [brief explanation]\n' +
    '```\n\n' +
    '**Approach:**\n' +
    '1. [Step-by-step approach]\n' +
    '2. [Algorithm explanation]\n' +
    '3. [Time Complexity: O(n)]\n' +
    '4. [Space Complexity: O(1)]\n\n' +
    '**Solution Code:**\n' +
    '```python\n' +
    '# Python solution\n' +
    'def solve_problem(input_data):\n' +
    '    # Implementation\n' +
    '    pass\n' +
    '```\n\n' +
    '**Key Insights:**\n' +
    '- [Important concepts to remember]\n' +
    '- [Common pitfalls to avoid]\n' +
    '- [Optimization tips]'
}

function formatBehavioralResponse(ocrText) {
  return '## Behavioral Interview Response\n\n' +
    '**Question Analysis:**\n' +
    ocrText + '\n\n' +
    '**STAR Method Framework:**\n\n' +
    '**Situation:** [Describe the context]\n' +
    '**Task:** [Explain your responsibility]\n' +
    '**Action:** [Detail your approach]\n' +
    '**Result:** [Share the outcome]\n\n' +
    '**Key Competencies Being Assessed:**\n' +
    '- [Leadership/Teamwork/Problem-solving/etc.]\n\n' +
    '**Sample Talking Points:**\n' +
    '- [Point 1]\n' +
    '- [Point 2]\n' +
    '- [Point 3]\n\n' +
    '**Follow-up Questions to Prepare For:**\n' +
    '- [Question 1]\n' +
    '- [Question 2]\n\n' +
    '**Tips for Effective Communication:**\n' +
    '- Be specific and use concrete examples\n' +
    '- Focus on your role and contributions\n' +
    '- Quantify results when possible\n' +
    '- Show learning and growth'
}

function formatSalesResponse(ocrText) {
  return '## Sales Strategy Response\n\n' +
    '**Query Analysis:**\n' +
    ocrText + '\n\n' +
    '**Sales Framework:**\n\n' +
    '**1. Understanding the Customer:**\n' +
    '- [Customer needs analysis]\n' +
    '- [Pain points identification]\n\n' +
    '**2. Value Proposition:**\n' +
    '- [Unique value offered]\n' +
    '- [Benefits and features]\n\n' +
    '**3. Objection Handling:**\n' +
    '- [Common objections and responses]\n' +
    '- [Techniques for overcoming resistance]\n\n' +
    '**4. Closing Strategies:**\n' +
    '- [Effective closing techniques]\n' +
    '- [Next steps and follow-up]\n\n' +
    '**Best Practices:**\n' +
    '- Listen actively and ask probing questions\n' +
    '- Focus on benefits, not just features\n' +
    '- Build rapport and trust\n' +
    '- Follow up consistently'
}

function formatPresentationResponse(ocrText) {
  return '## Presentation Guidance\n\n' +
    '**Query Analysis:**\n' +
    ocrText + '\n\n' +
    '**Presentation Structure:**\n\n' +
    '**1. Opening (10%):**\n' +
    '- [Hook and attention grabber]\n' +
    '- [Clear objective statement]\n\n' +
    '**2. Body (80%):**\n' +
    '- [Main points with supporting evidence]\n' +
    '- [Visual aids and examples]\n\n' +
    '**3. Closing (10%):**\n' +
    '- [Summary and key takeaways]\n' +
    '- [Call to action]\n\n' +
    '**Delivery Tips:**\n' +
    '- Maintain eye contact and confident posture\n' +
    '- Use vocal variety and clear articulation\n' +
    '- Engage audience with questions\n' +
    '- Practice timing and pacing\n\n' +
    '**Visual Design Principles:**\n' +
    '- Keep slides simple and uncluttered\n' +
    '- Use consistent fonts and colors\n' +
    '- Include relevant visuals and charts\n' +
    '- Limit text per slide'
}

function formatDataScienceResponse(ocrText) {
  return '## Data Science Analysis\n\n' +
    '**Query Analysis:**\n' +
    ocrText + '\n\n' +
    '**Methodological Approach:**\n\n' +
    '**1. Data Preprocessing:**\n' +
    '- [Data cleaning and validation]\n' +
    '- [Feature engineering]\n' +
    '- [Data transformation]\n\n' +
    '**2. Analysis/Modeling:**\n' +
    '- [Statistical analysis or ML approach]\n' +
    '- [Algorithm selection]\n' +
    '- [Model training and validation]\n\n' +
    '**3. Evaluation:**\n' +
    '- [Performance metrics]\n' +
    '- [Model interpretation]\n' +
    '- [Validation results]\n\n' +
    '**Code Example:**\n' +
    '```python\n' +
    'import pandas as pd\n' +
    'import numpy as np\n' +
    'from sklearn.model_selection import train_test_split\n\n' +
    '# Data preprocessing\n' +
    '# [Implementation based on context]\n\n' +
    '# Model training\n' +
    '# [Implementation based on context]\n\n' +
    '# Evaluation\n' +
    '# [Implementation based on context]\n' +
    '```\n\n' +
    '**Best Practices:**\n' +
    '- Ensure data quality and integrity\n' +
    '- Use appropriate evaluation metrics\n' +
    '- Consider model interpretability\n' +
    '- Document assumptions and limitations'
}

function formatGeneralQuestion(ocrText) {
  return '## General Question Response\n\n' +
    '**Question:** ' + ocrText + '\n\n' +
    '**Analysis:**\n' +
    'This appears to be a general question seeking information or clarification.\n\n' +
    '**Response:**\n' +
    '[Provide a comprehensive, helpful response based on the question content]\n\n' +
    '**Key Points:**\n' +
    '- [Point 1]\n' +
    '- [Point 2]\n' +
    '- [Point 3]\n\n' +
    '**Additional Resources:**\n' +
    '- [Relevant resources or references]'
}

function formatGeneralResponse(ocrText) {
  return '## Content Analysis\n\n' +
    '**Content:** ' + ocrText + '\n\n' +
    '**Assessment:**\n' +
    'This appears to be [description/question/statement] content.\n\n' +
    '**Analysis:**\n' +
    '[Provide relevant analysis and insights based on the content]\n\n' +
    '**Recommendations:**\n' +
    '- [Recommendation 1]\n' +
    '- [Recommendation 2]\n' +
    '- [Recommendation 3]'
}

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
  
  // Position below main window with larger size
  const windowWidth = Math.max(mainBounds.width, 800)
  const windowHeight = Math.floor(screenSize.height * 0.6)
  const windowX = mainBounds.x
  const windowY = mainBounds.y + mainBounds.height + 5
  
  llmResponseWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
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
    title: 'WindowServer',
    icon: path.join(__dirname, 'icon.png')
  })

  // Set window to be visible on all workspaces and follow desktop changes
  llmResponseWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  llmResponseWindow.setAlwaysOnTop(true, 'screen-saver', 1)

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

  console.log('LLM Response window created')
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
  addToSessionMemory('Skill changed', { 
    oldSkill: oldSkill, 
    newSkill: skill 
  })
  
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
  
  console.log(`Active skill changed from ${oldSkill} to ${skill}`)
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
    llmResponseWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    llmResponseWindow.setVisibleOnAllWorkspaces(true)
    
    // Send current interaction state
    if (isWindowInteractive) {
      llmResponseWindow.webContents.send('interaction-enabled')
    } else {
      llmResponseWindow.webContents.send('interaction-disabled')
    }
    
    // Ensure proper positioning
    const mainBounds = mainWindow.getBounds()
    const screenSize = screen.getPrimaryDisplay().workAreaSize
    const windowWidth = Math.max(mainBounds.width, 800)
    const windowHeight = Math.floor(screenSize.height * 0.6)
    const windowX = mainBounds.x
    const windowY = mainBounds.y + mainBounds.height + 5
    
    llmResponseWindow.setBounds(windowX, windowY, windowWidth, windowHeight)
    
    // Send loading state to window
    llmResponseWindow.webContents.send('show-loading')
  }
}