# Wysper

A stealthy screenshot, OCR, and speech recognition tool built with Electron.

## Features

- **Screenshot & OCR**: Take screenshots and extract text using Tesseract OCR
- **Speech Recognition**: Real-time speech-to-text using Microsoft Azure Speech Services
- **Stealth Mode**: Window hidden from screen sharing tools and Activity Monitor
- **Global Shortcuts**: Keyboard controls for all functionality
- **Always on Top**: Window stays visible across all applications and screens
- **Non-interactive Mode**: Window can be set to pass through mouse events

## Keyboard Shortcuts

- `Cmd+\` - Toggle window visibility (hide/show)
- `Option+A` - Toggle window interactivity
- `Cmd+S` - Take screenshot with OCR
- `Cmd+R` - Start/stop speech recording
- `Cmd+Shift+R` - Force stop speech recording
- `Cmd+T` - Toggle chat window visibility (when recording)
- `Option+Space` - Move controls between main and chat windows (when recording)
- `Cmd+Arrow Keys` - Move window position

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd Wysper
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install Tesseract OCR** (for screenshot text extraction):
   ```bash
   # macOS
   brew install tesseract
   
   # Ubuntu/Debian
   sudo apt-get install tesseract-ocr
   
   # Windows
   # Download from https://github.com/UB-Mannheim/tesseract/wiki
   ```

4. **Set up Azure Speech Services**:
   - Follow the [Azure Speech Setup Guide](AZURE_SPEECH_SETUP.md)
   - Create an Azure Speech resource and get your credentials
   - Set environment variables: `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`

5. **Start the application**:
   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Azure Speech Services
AZURE_SPEECH_KEY=your_azure_speech_key_here
AZURE_SPEECH_REGION=your_azure_region_here
```

### Speech Recognition

The app uses Microsoft Azure Speech Services for real-time speech-to-text. Features include:

- Continuous speech recognition
- Real-time transcription
- Support for multiple languages
- High accuracy with Azure's advanced models

### OCR (Optical Character Recognition)

Screenshots are processed using Tesseract OCR to extract text. The extracted text is logged to the console and can be used for further processing.

## Usage

1. **Start the app**: The main window appears as a small transparent tab
2. **Take screenshots**: Press `Cmd+S` to capture and extract text
3. **Speech recognition**: Press `Cmd+R` to start recording, speak, then press again to stop
4. **Hide window**: Press `Cmd+\` to hide the window from screen sharing tools
5. **Toggle interactivity**: Press `Option+A` to allow/block mouse interactions

## Window Modes

### Normal Mode
- Window is visible and interactive
- Can be moved and clicked
- Standard functionality

### Stealth Mode (`Cmd+\`)
- Window is hidden from screen sharing tools
- Still functional with keyboard shortcuts
- Invisible to other applications

### Non-interactive Mode (`Option+A`)
- Window passes through mouse events
- Underlying applications can be clicked through
- Keyboard shortcuts still work
- Perfect for overlay functionality

## Speech Recognition Features

- **Real-time transcription**: See text as you speak
- **Continuous recognition**: No need to restart for each phrase
- **High accuracy**: Powered by Azure's advanced speech models
- **Multiple languages**: Support for 100+ languages
- **Custom models**: Can be trained for specific domains

## Troubleshooting

### Speech Recognition Issues

1. **Check Azure credentials**: Verify `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set
2. **Microphone permissions**: Ensure the app has microphone access
3. **Internet connection**: Azure Speech Services requires internet access
4. **Azure quota**: Check your Azure subscription limits

### OCR Issues

1. **Tesseract installation**: Verify Tesseract is installed and in PATH
2. **Image quality**: Better quality screenshots improve OCR accuracy
3. **Language support**: Tesseract supports 100+ languages

### Window Visibility Issues

1. **Screen sharing**: Some tools may still detect the window
2. **Activity Monitor**: The app disguises itself as "WindowServer"
3. **Permissions**: Ensure the app has necessary system permissions

## Development

### Project Structure

```
Wysper/
├── main.js                 # Main Electron process
├── speech-recognition.js   # Azure Speech Services integration
├── index.html             # Main window UI
├── chat.html              # Speech recognition chat window
├── styles.css             # Main window styles
├── chat.css               # Chat window styles
└── package.json           # Dependencies and scripts
```

### Adding Features

1. **New shortcuts**: Add to `main.js` in the `globalShortcut.register` section
2. **UI changes**: Modify HTML files and corresponding CSS
3. **Speech features**: Extend `speech-recognition.js` with Azure Speech SDK
4. **OCR improvements**: Enhance Tesseract configuration in `main.js`

## Security & Privacy

- **Local processing**: Screenshots and OCR processed locally
- **Azure security**: Speech data sent to Azure with enterprise-grade security
- **No data storage**: No audio or text data is stored locally
- **Stealth features**: Window hidden from screen sharing for privacy

## License

ISC License - see LICENSE file for details.

## Support

- [Azure Speech Services Documentation](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/)
- [Tesseract OCR Documentation](https://tesseract-ocr.github.io/)
- [Electron Documentation](https://www.electronjs.org/docs)
