const { app, BrowserWindow, screen, globalShortcut, desktopCapturer, ipcMain } = require('electron')
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
let isRecording = false

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
      webSecurity: false,
      allowRunningInsecureContent: true,
      permissions: ['microphone']
    },
    show: false
  })

  chatWindow.loadFile('chat.html')
  
  // Set window to be visible on all workspaces
  chatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  
  chatWindow.once('ready-to-show', () => {
    chatWindow.show()
  })
  
  // Handle window close
  chatWindow.on('closed', () => {
    chatWindow = null
  })
}

function createWindow () {
  // Get the primary display
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width } = primaryDisplay.workAreaSize
  
  // Set window dimensions - increased width to fit all components
  const windowWidth = Math.floor(width / 2)  // Increased from 1/3 to 1/2 of screen width
  const windowHeight = 60  // 20px preview + 20px tab + 20px gap

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    fullscreenable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  })

  // Additional stealth measures
  mainWindow.setSkipTaskbar(true)
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  mainWindow.setVisibleOnAllWorkspaces(true)
  mainWindow.setBackgroundColor('#00000000')
  
  // Prevent window from being captured
  mainWindow.setWindowButtonVisibility(false)
  mainWindow.setAutoHideMenuBar(true)
  mainWindow.setMenuBarVisibility(false)
  
  // Make window undetectable by screen sharing
  mainWindow.setFullScreenable(false)
  mainWindow.setResizable(false)
  mainWindow.setMovable(true)
  
  // Set window to be completely transparent to screen capture
  mainWindow.setOpacity(1)
  
  mainWindow.loadFile('index.html')
  
  // Show window after it's ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Keep window on top and visible
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

  // Register keyboard shortcuts for window movement
  globalShortcut.register('CommandOrControl+Left', () => {
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x - 50, y)
  })

  globalShortcut.register('CommandOrControl+Right', () => {
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x + 50, y)
  })

  globalShortcut.register('CommandOrControl+Up', () => {
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x, y - 50)
  })

  globalShortcut.register('CommandOrControl+Down', () => {
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x, y + 50)
  })

  // Register screenshot shortcut
  globalShortcut.register('CommandOrControl+H', async () => {
    try {
      console.log('Screenshot shortcut triggered')
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 } // Full resolution for better OCR
      })
      
      if (sources.length > 0) {
        console.log('Screenshot captured')
        
        // Save screenshot to temp file
        const base64Data = sources[0].thumbnail.toDataURL().replace(/^data:image\/png;base64,/, '')
        const tempPath = path.join(os.tmpdir(), 'screenshot.png')
        fs.writeFileSync(tempPath, base64Data, 'base64')
        console.log('Screenshot saved to:', tempPath)

        // Process OCR using tesseract
        const text = await performOCR(tempPath)
        if (text) {
          console.log('Extracted Text:', text)
        } else {
          console.log('No text was extracted')
        }

        // Clean up temp file
        try {
          fs.unlinkSync(tempPath)
          console.log('Temporary file cleaned up')
        } catch (error) {
          console.error('Cleanup error:', error)
        }
      }
    } catch (error) {
      console.error('Screenshot/OCR failed:', error)
    }
  })

  // Register recording shortcut
  globalShortcut.register('CommandOrControl+R', () => {
    if (!chatWindow) {
      createChatWindow()
    }
    
    isRecording = !isRecording
    if (isRecording) {
      console.log('Recording started')
      mainWindow.webContents.send('recording-started')
      chatWindow.webContents.send('recording-started')
    } else {
      console.log('Recording stopped')
      mainWindow.webContents.send('recording-stopped')
      chatWindow.webContents.send('recording-stopped')
    }
  })
}

// Prevent app from showing in dock and activity monitor
app.dock?.hide()

// Additional stealth measures for app startup
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.commandLine.appendSwitch('disable-site-isolation-trials')

app.whenReady().then(() => {
  // Hide from Activity Monitor
  if (process.platform === 'darwin') {
    const { exec } = require('child_process')
    exec('defaults write com.apple.ActivityMonitor ShowCategory -int 0')
  }
  
  createWindow()

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