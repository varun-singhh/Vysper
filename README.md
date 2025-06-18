# Wysper

A professional, modular screenshot, OCR, and speech recognition tool with AI-powered analysis built on Electron. Features enterprise-grade logging, stealth capabilities, and intelligent content processing.

## 🚀 Features

### Core Capabilities
- **Screenshot & OCR**: Intelligent text extraction with automatic cleanup
- **Speech Recognition**: Real-time speech-to-text using Microsoft Azure Speech Services
- **AI-Powered Analysis**: Google Gemini 1.5 Flash integration for contextual responses
- **Session Memory**: LLM-optimized session tracking and analytics
- **Stealth Mode**: Hidden from screen sharing tools and system monitoring
- **Professional Architecture**: Modular, service-oriented design with enterprise logging

### Advanced Features
- **Multiple Window Management**: Main, Chat, Skills, and AI Response windows
- **Global Shortcuts**: Complete keyboard control for all functionality
- **Skill-Based Analysis**: Specialized responses for DSA, Sales, Behavioral, etc.
- **Session Analytics**: Workflow tracking and optimization suggestions
- **Resource Management**: Automatic cleanup and memory optimization
- **Enterprise Logging**: Winston-based structured logging with rotation

## 📋 Table of Contents

1. [Installation](#installation)
2. [Azure Speech Setup](#azure-speech-setup)
3. [Gemini AI Integration](#gemini-ai-integration)
4. [Session Memory System](#session-memory-system)
5. [Usage Guide](#usage-guide)
6. [Keyboard Shortcuts](#keyboard-shortcuts)
7. [Architecture](#architecture)
8. [Configuration](#configuration)
9. [Troubleshooting](#troubleshooting)
10. [Development](#development)

## 🛠 Installation

### Prerequisites
- Node.js (v16+ recommended)
- npm or yarn
- Tesseract OCR
- Azure Speech Services account
- Google AI Studio account (for Gemini)

### Step 1: Clone and Install
```bash
git clone <repository-url>
cd Wysper
npm install
```

### Step 2: Install Tesseract OCR
```bash
# macOS
brew install tesseract

# Ubuntu/Debian
sudo apt-get install tesseract-ocr

# Windows
# Download from https://github.com/UB-Mannheim/tesseract/wiki
```

### Step 3: Environment Configuration
Create a `.env` file in the project root:
```bash
# Azure Speech Services
AZURE_SPEECH_KEY=your_azure_speech_key_here
AZURE_SPEECH_REGION=your_azure_region_here

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Logging level
LOG_LEVEL=info
```

### Step 4: Start Application
```bash
npm start
```

## 🎤 Azure Speech Setup

### Create Azure Speech Resource

1. **Azure Portal Setup**
   - Visit [portal.azure.com](https://portal.azure.com)
   - Sign in with your Microsoft account
   - Click "Create a resource" → Search "Speech service"
   - Select "Speech service" → Click "Create"

2. **Configure Resource**
   - **Subscription**: Choose your subscription
   - **Resource group**: Create new or use existing
   - **Region**: Choose closest region (e.g., "East US", "West Europe")
   - **Name**: Unique name (e.g., "wysper-speech")
   - **Pricing tier**: "Free (F0)" for testing, "Standard (S0)" for production

3. **Get Credentials**
   - Navigate to your Speech resource
   - Go to "Keys and Endpoint" under Resource Management
   - Copy **Key 1** and **Region**

### Environment Variables
Add to your `.env` file:
```bash
AZURE_SPEECH_KEY=your_copied_key_here
AZURE_SPEECH_REGION=your_region_here
```

### Pricing Tiers
- **Free Tier (F0)**:
  - 5 hours audio/month
  - 20 concurrent requests
  - 10 minutes per request limit
  
- **Standard Tier (S0)**:
  - 250 hours audio/month
  - 100 concurrent requests
  - No time limits

### Language Support
Modify language in speech service configuration:
```javascript
// Supported languages
'en-US' // English (US)
'en-GB' // English (UK)
'es-ES' // Spanish
'fr-FR' // French
'de-DE' // German
'ja-JP' // Japanese
// And 100+ more languages
```

## 🤖 Gemini AI Integration

### Setup Google Gemini

1. **Get API Key**
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Sign in with Google account
   - Create new API key
   - Copy key (starts with "AIza...")

2. **Configure in Wysper**
   - Press `Alt+G` to open Gemini configuration
   - Enter API key in secure input field
   - Click "Configure" to save
   - Click "Test Connection" to verify

### AI-Powered Features

#### Skill-Based Analysis
- **DSA Problems**: Complete solutions with test cases and complexity analysis
- **Behavioral Questions**: STAR method framework with sample answers
- **Sales Queries**: Frameworks, objection handling, best practices
- **Presentation Guidance**: Structure, delivery tips, visual design
- **Data Science**: Methodological approach with code examples
- **General**: Appropriate analysis for any content type

#### Response Structure
- Problem analysis and solution approach
- Step-by-step implementation guidance
- Code examples with explanations
- Best practices and optimization tips
- Common pitfalls and how to avoid them

### Model Configuration
- **Model**: gemini-1.5-flash (latest and fastest)
- **Context Window**: Large context for comprehensive responses
- **Temperature**: 0.7 (balanced creativity/accuracy)
- **Max Tokens**: 2048 (comprehensive responses)

## 🧠 Session Memory System

### LLM-Optimized Memory

The session memory system captures and structures user interactions for optimal AI consumption:

#### Data Structure
```json
{
  "session_summary": "Session duration and overview",
  "current_context": {
    "active_window": "chat",
    "active_skill": "Sales", 
    "recording_status": "inactive",
    "last_action": "User interaction description"
  },
  "activity_breakdown": {
    "screenshots_taken": 5,
    "speech_sessions": 3,
    "text_inputs": 8,
    "skills_used": ["Sales", "DSA"],
    "window_switches": 7
  },
  "workflow_timeline": [
    {
      "step": 1,
      "time": "12:00:00 PM", 
      "action": "SKILL_SELECTION",
      "summary": "User selected skill: Sales"
    }
  ],
  "llm_context": {
    "user_workflow": "Comprehensive workflow description",
    "session_focus": "PRIMARY_ACTIVITY_TYPE",
    "current_context": "Current state for AI context"
  }
}
```

### Action Categories

- **SCREENSHOT_OCR**: Document analysis, text extraction
- **SPEECH_RECOGNITION**: Voice commands, transcription
- **TEXT_INPUT**: Manual entries, chat messages
- **SKILL_WORK**: Skill-specific workflow tracking
- **WINDOW_NAVIGATION**: UI state and workflow tracking
- **SYSTEM_CONTROL**: System operations and automation

### Memory Optimization

#### Automatic Compression
- Events older than 2 hours are compressed
- Similar events are consolidated
- System events are cleaned after 24 hours
- Memory usage is optimized for performance

#### Session Analytics
- Workflow efficiency analysis
- Activity pattern recognition
- Focus area determination
- Performance recommendations

### API Access
```javascript
// Get LLM-optimized history
const history = await window.electronAPI.getLLMSessionHistory()

// Get raw session data  
const raw = await window.electronAPI.getSessionHistory()

// Clear session memory
await window.electronAPI.clearSessionMemory()
```

## 📖 Usage Guide

### Basic Workflow

1. **Start Application**: Launch Wysper
2. **Select Skill**: Choose appropriate skill from Skills window (`Cmd+Shift+K`)
3. **Capture Content**: Take screenshot (`Cmd+Shift+S`) or use speech (`Cmd+R`)
4. **Get AI Analysis**: Automatic processing with contextual responses
5. **Review Results**: AI response displayed in dedicated window

### Window Management

#### Main Window
- Primary control interface
- Status indicators and controls
- Session information display

#### Chat Window (`Cmd+Shift+C`)
- Speech recognition interface
- Real-time transcription display
- Voice interaction controls

#### Skills Window (`Cmd+Shift+K`)
- Skill selection and configuration
- Active skill indicator
- Context-specific settings

#### AI Response Window
- Intelligent analysis results
- Formatted responses with syntax highlighting
- Auto-sizing based on content

### Stealth Features

#### Stealth Mode (`Cmd+\`)
- Hidden from screen sharing tools
- Invisible to activity monitors
- Process disguised as "WindowServer"
- All functionality via keyboard shortcuts

#### Non-Interactive Mode (`Option+A`)
- Window passes through mouse events
- Click-through overlay functionality
- Perfect for screen recording
- Keyboard shortcuts remain active

## ⌨️ Keyboard Shortcuts

### Global Controls
- `Cmd+H` - Take screenshot and AI analysis
- `Cmd+\` - Show/hide all windows
- `Option+A` - Toggle interaction mode

### Speech Recognition
- `Cmd+R` - Start/stop speech recording
- `Cmd+R` - Force stop speech recording if already in progress

### Window Navigation
- `Option+1` - Switch to Chat window
- `Cmd+Arrow Keys` - Move active window

### Session Management
- `Option+;` - Clear session memory


## 🏗 Architecture

### Modular Design

```
Wysper/
├── src/
│   ├── core/
│   │   ├── logger.js          # Winston-based enterprise logging
│   │   └── config.js          # Centralized configuration
│   ├── services/
│   │   ├── ocr.service.js     # Screenshot capture & OCR
│   │   ├── speech.service.js  # Azure Speech integration
│   │   └── llm.service.js     # Gemini AI processing
│   └── managers/
│       ├── session.manager.js # Memory & analytics
│       └── window.manager.js  # Window lifecycle
├── main.js                    # Application controller
└── package.json              # Dependencies
```

### Service Architecture

#### Core Services
- **OCR Service**: Handles screenshot capture, text extraction, temp file management
- **Speech Service**: Manages Azure Speech SDK, continuous recognition, event handling
- **LLM Service**: Processes AI requests, handles retries, manages fallbacks

#### Managers
- **Window Manager**: Controls all window operations, positioning, lifecycle
- **Session Manager**: Optimizes memory usage, provides analytics, manages compression

### Enterprise Features

#### Professional Logging
- **Winston Framework**: Industry-standard logging
- **Multiple Transports**: Console, daily rotate files, error logs
- **Structured Metadata**: JSON format with contextual information
- **Performance Tracking**: Built-in timing and metrics
- **Automatic Rotation**: Size and time-based log rotation

#### Error Handling
- **Service-Level Recovery**: Graceful degradation
- **Retry Logic**: Exponential backoff for API calls
- **Fallback Systems**: Mock responses when services unavailable
- **Resource Cleanup**: Automatic temp file and memory management

## ⚙️ Configuration

### Environment Variables

```bash
# Required - Azure Speech Services
AZURE_SPEECH_KEY=your_azure_key
AZURE_SPEECH_REGION=your_region

# Required - Google Gemini AI  
GEMINI_API_KEY=your_gemini_key

# Optional - Application Settings
LOG_LEVEL=info                 # debug, info, warn, error
NODE_ENV=production           # development, production

# Optional - Feature Flags
STEALTH_MODE=true             # Enable stealth features
FALLBACK_ENABLED=true         # Enable AI fallbacks
```

### Configuration Options

#### Window Settings
```javascript
// Configurable in src/core/config.js
window: {
  defaultWidth: 400,
  defaultHeight: 600,
  minWidth: 300,
  minHeight: 400
}
```

#### OCR Settings
```javascript
ocr: {
  language: 'eng',              // Tesseract language
  tempDir: os.tmpdir(),         // Temporary file location
  cleanupDelay: 5000           // Cleanup delay in ms
}
```

#### LLM Settings
```javascript
llm: {
  gemini: {
    model: 'gemini-1.5-flash',
    maxRetries: 3,
    timeout: 30000,
    fallbackEnabled: true
  }
}
```

#### Session Settings
```javascript
session: {
  maxMemorySize: 1000,          // Maximum events
  compressionThreshold: 500,    // Compression trigger
  clearOnRestart: false        // Preserve between sessions
}
```

## 🔧 Troubleshooting

### Common Issues

#### Azure Speech Problems
1. **"Credentials not found"**
   ```bash
   # Check environment variables
   echo $AZURE_SPEECH_KEY
   echo $AZURE_SPEECH_REGION
   
   # Restart terminal after setting variables
   source ~/.zshrc  # or ~/.bash_profile
   ```

2. **"Recognition failed"** 
   - Verify Azure resource is active
   - Check internet connection
   - Ensure microphone permissions granted
   - Verify subscription quota

#### Gemini AI Issues
1. **"API key not configured"**
   - Press `Alt+G` to configure
   - Get key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Test connection after configuration

2. **"Connection test failed"**
   - Check internet connectivity
   - Verify API key permissions
   - Ensure quotas not exceeded

#### OCR Problems
1. **Poor text extraction**
   - Improve screenshot quality
   - Use high contrast images
   - Ensure adequate resolution
   - Check Tesseract installation

2. **Tesseract not found**
   ```bash
   # Verify installation
   tesseract --version
   
   # Add to PATH if needed
   export PATH="/usr/local/bin:$PATH"
   ```

#### Window Management
1. **Windows not responding**
   - Check console for errors
   - Restart application
   - Reset window positions via config

2. **Stealth mode issues**
   - Some screen recording tools may still detect
   - Process appears as "WindowServer"
   - Ensure system permissions granted

### Debug Information

#### Console Logging
```javascript
// Enable debug logging
LOG_LEVEL=debug npm start

// View specific service logs
[OCR] 2024-01-01 12:00:00 Screenshot captured successfully
[SPEECH] 2024-01-01 12:00:01 Recognition started
[LLM] 2024-01-01 12:00:02 Processing with Gemini
```

#### Log Files
```bash
# Log directory
~/.wysper/logs/

# Files created
application-2024-01-01.log  # General application logs
error-2024-01-01.log        # Error-specific logs
exceptions.log              # Unhandled exceptions
rejections.log              # Promise rejections
```

#### Session Analytics
```javascript
// View memory usage
const usage = sessionManager.getMemoryUsage()
// Returns: { eventCount, approximateSize, utilizationPercent }

// View session statistics  
const stats = sessionManager.generateSessionSummary()
// Returns: { duration, activities, focus, eventCount }
```

### Performance Optimization

#### Memory Management
- Session memory auto-compresses after 500 events
- Old events cleaned after 24 hours
- Temporary files auto-deleted
- Resource pools managed automatically

#### API Optimization
- Request retry with exponential backoff
- Connection pooling for HTTP requests
- Timeout handling with graceful degradation
- Caching for repeated requests

## 🚧 Development

### Project Structure

```
Wysper/
├── src/                       # Source code
│   ├── core/                  # Core utilities
│   ├── services/              # Business logic services  
│   └── managers/              # Resource managers
├── prompts/                   # AI prompt templates
├── *.html                     # UI files
├── main.js                    # Application entry point
├── preload.js                 # Electron preload script
└── package.json              # Dependencies
```

### Adding Features

#### New Service
1. Create service in `src/services/`
2. Implement standard interface methods
3. Add to application controller
4. Update IPC handlers if needed

#### New Window
1. Add configuration to window manager
2. Create HTML/CSS files
3. Update preload script for IPC
4. Add keyboard shortcuts

#### New AI Skill
1. Add prompt file in `prompts/`
2. Update prompt loader
3. Configure LLM service mappings
4. Test with various content types

### Testing

#### Unit Testing
```bash
# Run service tests
npm test

# Test specific service
npm test -- --grep "OCR Service"
```

#### Integration Testing
```bash
# Test Azure Speech
npm run test-speech

# Test AI connection
npm run test-gemini

# Test full workflow
npm run test-integration
```

#### Performance Testing
```bash
# Memory usage monitoring
npm run profile

# Load testing
npm run stress-test
```

### Contributing

1. Fork the repository
2. Create feature branch
3. Follow coding standards
4. Add comprehensive tests
5. Update documentation
6. Submit pull request

#### Coding Standards
- ES6+ JavaScript
- JSDoc comments for public methods
- Professional error handling
- Structured logging
- Resource cleanup
- Security best practices

## 🔒 Security & Privacy

### Data Handling
- **Local Processing**: Screenshots processed locally only
- **API Transmission**: Only extracted text sent to external APIs
- **No Persistence**: Temporary files deleted immediately
- **Memory-Only**: Session data stored in memory only
- **Automatic Cleanup**: Resources cleaned on application exit

### API Security
- **Environment Variables**: Secure credential storage
- **HTTPS Only**: All external API calls encrypted
- **Token Rotation**: Support for regular key rotation
- **Error Logging**: Sensitive data excluded from logs
- **Timeout Handling**: Prevents hanging connections

### System Security
- **Process Disguise**: Stealth process naming
- **Permission Management**: Minimal required permissions
- **Resource Isolation**: Sandboxed execution environment
- **Memory Protection**: Secure memory allocation
- **Clean Shutdown**: Proper resource deallocation

## 📄 License

ISC License

Copyright (c) 2024

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

## 🤝 Support

### Documentation
- [Azure Speech Services](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/)
- [Google Gemini AI](https://ai.google.dev/)
- [Tesseract OCR](https://tesseract-ocr.github.io/)
- [Electron Framework](https://www.electronjs.org/docs)

### Community
- GitHub Issues for bug reports
- Feature requests via GitHub Discussions
- Security issues via private disclosure

### Enterprise Support
- Professional deployment assistance
- Custom integration development
- Performance optimization consulting
- Training and documentation
