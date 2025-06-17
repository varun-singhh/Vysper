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
let isRecording = false
let isWindowHidden = false
let isWindowInteractive = false
let controlsInChat = false
let activeWindow = 'main' // 'main', 'chat', or 'skills'
let sessionMemory = [] // Array to store session events

async function takeScreenshotAndOCR() {
  try {
    console.log('Taking screenshot...')
    
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
    
    // Create a temporary file path
    const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.png`)
    console.log('Temporary file path:', tempPath)
    
    // Save the thumbnail directly
    const image = source.thumbnail
    if (!image) {
      throw new Error('No thumbnail available')
    }
    
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
      
      // Add to session memory without file path
      addToSessionMemory('Screenshot taken and OCR completed', {
        ocrText: text.trim()
      })
      
      // Send to all windows
      if (mainWindow) {
        mainWindow.webContents.send('ocr-completed', { text: text.trim() })
      }
      if (chatWindow) {
        chatWindow.webContents.send('ocr-completed', { text: text.trim() })
      }
      if (skillsWindow) {
        skillsWindow.webContents.send('ocr-completed', { text: text.trim() })
      }
      
    } catch (ocrError) {
      // Delete the temporary file even if OCR fails
      try {
        fs.unlinkSync(tempPath)
        console.log('Screenshot file deleted after OCR error')
      } catch (deleteError) {
        console.error('Error deleting screenshot file after OCR error:', deleteError)
      }
      
      console.error('OCR error:', ocrError)
      addToSessionMemory('Screenshot taken and OCR completed', {
        error: ocrError.message,
        ocrText: 'OCR processing failed'
      })
      
      // Send error to windows
      if (mainWindow) {
        mainWindow.webContents.send('ocr-error', { error: ocrError.message })
      }
      if (chatWindow) {
        chatWindow.webContents.send('ocr-error', { error: ocrError.message })
      }
      if (skillsWindow) {
        skillsWindow.webContents.send('ocr-error', { error: ocrError.message })
      }
    }
    
  } catch (error) {
    console.error('Screenshot error:', error)
    addToSessionMemory('Screenshot taken and OCR completed', {
      error: error.message,
      ocrText: 'Screenshot capture failed'
    })
    
    // Send error to windows
    if (mainWindow) {
      mainWindow.webContents.send('ocr-error', { error: error.message })
    }
    if (chatWindow) {
      chatWindow.webContents.send('ocr-error', { error: error.message })
    }
    if (skillsWindow) {
      skillsWindow.webContents.send('ocr-error', { error: error.message })
    }
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
    // Show window
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
    if (chatWindow) {
      chatWindow.show()
    }
    if (skillsWindow) {
      skillsWindow.show()
    }
    isWindowHidden = false
    console.log('Window shown')
    addToSessionMemory('All windows shown')
  } else {
    // Hide window
    if (mainWindow) {
      mainWindow.hide()
    }
    if (chatWindow) {
      chatWindow.hide()
    }
    if (skillsWindow) {
      skillsWindow.hide()
    }
    isWindowHidden = true
    console.log('Window hidden')
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
    if (activeWindow === 'skills' && skillsWindow) {
      // For skills window, move left only
      const [x, y] = skillsWindow.getPosition()
      skillsWindow.setPosition(Math.max(0, x - 50), y)
    } else {
      // For other windows, move left
      let targetWindow = mainWindow
      if (activeWindow === 'chat' && chatWindow) {
        targetWindow = chatWindow
      }
      
      if (targetWindow && !isWindowHidden) {
        const [x, y] = targetWindow.getPosition()
        targetWindow.setPosition(Math.max(0, x - 50), y)
      }
    }
  })

  globalShortcut.register('CommandOrControl+Right', () => {
    if (activeWindow === 'skills' && skillsWindow) {
      // For skills window, move right only
      const [x, y] = skillsWindow.getPosition()
      const { width } = screen.getPrimaryDisplay().workAreaSize
      const windowWidth = skillsWindow.getBounds().width
      skillsWindow.setPosition(Math.min(width - windowWidth, x + 50), y)
    } else {
      // For other windows, move right
      let targetWindow = mainWindow
      if (activeWindow === 'chat' && chatWindow) {
        targetWindow = chatWindow
      }
      
      if (targetWindow && !isWindowHidden) {
        const [x, y] = targetWindow.getPosition()
        const { width } = screen.getPrimaryDisplay().workAreaSize
        const windowWidth = targetWindow.getBounds().width
        targetWindow.setPosition(Math.min(width - windowWidth, x + 100), y)
      }
    }
  })

  globalShortcut.register('CommandOrControl+Up', () => {
    if (activeWindow === 'skills' && skillsWindow) {
      // For skills window, navigate to previous skill
      skillsWindow.webContents.send('navigate-skill', 'prev')
    } else {
      // For other windows, move up
      let targetWindow = mainWindow
      if (activeWindow === 'chat' && chatWindow) {
        targetWindow = chatWindow
      }
      
      if (targetWindow && !isWindowHidden) {
        const [x, y] = targetWindow.getPosition()
        targetWindow.setPosition(x, Math.max(0, y - 50))
      }
    }
  })

  globalShortcut.register('CommandOrControl+Down', () => {
    if (activeWindow === 'skills' && skillsWindow) {
      // For skills window, navigate to next skill
      skillsWindow.webContents.send('navigate-skill', 'next')
    } else {
      // For other windows, move down
      let targetWindow = mainWindow
      if (activeWindow === 'chat' && chatWindow) {
        targetWindow = chatWindow
      }
      
      if (targetWindow && !isWindowHidden) {
        const [x, y] = targetWindow.getPosition()
        const { height } = screen.getPrimaryDisplay().workAreaSize
        const windowHeight = targetWindow.getBounds().height
        targetWindow.setPosition(x, Math.min(height - windowHeight, y + 50))
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
  
  // Send to all windows for display
  if (mainWindow) {
    mainWindow.webContents.send('session-event', event)
  }
  if (chatWindow) {
    chatWindow.webContents.send('session-event', event)
  }
  if (skillsWindow) {
    skillsWindow.webContents.send('session-event', event)
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
  
  // Extract current context
  const currentSkill = activities.skill_activities.length > 0 ? 
    activities.skill_activities[activities.skill_activities.length - 1].details.skill : null
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