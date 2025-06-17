# Wysper

A stealthy Electron-based desktop application for screen capture, speech recognition, and transcription with advanced window management features.

## Features

- **Stealth Mode**: Transparent, frameless windows that stay on top
- **Screen Capture**: Take screenshots with OCR text extraction
- **Speech Recognition**: Real-time audio recording and transcription
- **Dynamic Controls**: Move window controls between main and chat windows
- **Keyboard Navigation**: Full keyboard control for all features
- **Cross-Workspace**: Windows visible across all desktops and workspaces

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘+Arrow` | Move window (main or chat based on control state) |
| `⌘+S` | Take screenshot with OCR |
| `⌘+R` | Start/Stop recording |
| `⌘+T` | Toggle chat window |
| `⌥+Space` | Move controls between windows (when recording) |
| `⌘+\` | Hide/Show window |
| `⌥+A` | Toggle window interaction mode |

## Development Setup

1. Install dependencies:
```bash
npm install
```

2. Run the application in development mode:
```bash
npm run dev
```

3. Run the application in production mode:
```bash
npm start
```

4. Build the application:
```bash
npm run build
```

## Project Structure

- `main.js` - Main Electron process file with window management and shortcuts
- `index.html` - Main application window with command tab
- `chat.html` - Chat window for speech recognition and transcription
- `package.json` - Project configuration and dependencies

## Usage Notes

- The main window starts in non-interactive mode (click-through)
- Press `⌥+A` to enable interaction with the window
- When recording, use `⌥+Space` to move controls to the chat window
- Windows are designed to be invisible to screen sharing tools
- Speech recognition requires internet connection for best results
=======
- `main.js` - Main Electron process file
- `index.html` - Main application window
- `package.json` - Project configuration and dependencies
