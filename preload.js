// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Screenshot and OCR
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  
  // Speech recognition
  startSpeechRecognition: () => ipcRenderer.invoke('start-speech-recognition'),
  stopSpeechRecognition: () => ipcRenderer.invoke('stop-speech-recognition'),
  
  // Window management
  showAllWindows: () => ipcRenderer.invoke('show-all-windows'),
  hideAllWindows: () => ipcRenderer.invoke('hide-all-windows'),
  enableWindowInteraction: () => ipcRenderer.invoke('enable-window-interaction'),
  disableWindowInteraction: () => ipcRenderer.invoke('disable-window-interaction'),
  switchToChat: () => ipcRenderer.invoke('switch-to-chat'),
  switchToSkills: () => ipcRenderer.invoke('switch-to-skills'),
  
  // Session memory
  getSessionHistory: () => ipcRenderer.invoke('get-session-history'),
  getLLMSessionHistory: () => ipcRenderer.invoke('get-llm-session-history'),
  clearSessionMemory: () => ipcRenderer.invoke('clear-session-memory'),
  formatSessionHistory: () => ipcRenderer.invoke('format-session-history'),
  
  // Event listeners
  onTranscriptionReceived: (callback) => ipcRenderer.on('transcription-received', callback),
  onSessionEvent: (callback) => ipcRenderer.on('session-event', callback),
  onSessionCleared: (callback) => ipcRenderer.on('session-cleared', callback),
  onOcrCompleted: (callback) => ipcRenderer.on('ocr-completed', callback),
  onOcrError: (callback) => ipcRenderer.on('ocr-error', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
}) 