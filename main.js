// Load environment variables from .env file
require('dotenv').config()

const { app, BrowserWindow, screen, globalShortcut, desktopCapturer, ipcMain, session } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)

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

async function performOCR(imagePath) {
  try {
    console.log('Starting OCR process for image:', imagePath)
    console.log('Checking if image exists:', fs.existsSync(imagePath))
    
    // Check if tesseract is installed
    try {
      const { stdout: version } = await execPromise('tesseract --version')
      console.log('Tesseract version:', version)
    } catch (error) {
      console.error('Tesseract not found. Please install it using: brew install tesseract')
      return null
    }

    // Use tesseract for OCR with more detailed output
    const { stdout, stderr } = await execPromise(`tesseract "${imagePath}" stdout -l eng --psm 3`)
    console.log('OCR stderr:', stderr)
    console.log('OCR stdout:', stdout)
    return stdout.trim()
  } catch (error) {
    console.error('OCR Error details:', {
      message: error.message,
      code: error.code,
      signal: error.signal,
      cmd: error.cmd
    })
    return null
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
  }
}

function toggleWindowInteraction() {
  const newInteractiveState = !isWindowInteractive
  setWindowInteractive(newInteractiveState)
  setChatWindowInteractive(newInteractiveState)
  setSkillsWindowInteractive(newInteractiveState)
  
  if (newInteractiveState) {
    console.log('Window interaction enabled')
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

  globalShortcut.register('CommandOrControl+S', () => {
    if (mainWindow && !isWindowHidden) {
      mainWindow.webContents.send('take-screenshot')
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