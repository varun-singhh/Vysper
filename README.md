# Vysper

**Professional Interview Assistant with Invisible Screen Overlay**

An AI-powered desktop tool that helps you excel in technical and professional interviews by providing intelligent, real-time assistance while remaining completely invisible to screen sharing and recording software.

## 🎯 Perfect for Interviews

**Completely Stealth** - Invisible to Zoom, Teams, Meet, and all screen sharing tools
**Real-time AI Assistance** - Instant help with coding problems, system design, and interview questions
**Professional Skills** - Specialized modes for different interview types

### Supported Interview Skills
- **DSA (Data Structures & Algorithms)** - Complete solutions with complexity analysis
- **System Design** - Architecture patterns and scalability approaches  
- **Programming** - Multi-language coding assistance and best practices
- **Behavioral** - STAR method responses and professional scenarios
- **Sales** - Frameworks, objection handling, and closing techniques
- **Negotiation** - Strategic approaches and persuasion tactics
- **Presentation** - Structure, delivery tips, and visual design
- **DevOps** - Infrastructure, CI/CD, and deployment strategies
- **Data Science** - Analytics, ML approaches, and statistical methods

## 🚀 Quick Start

### Installation
```bash
git clone <repository-url>
cd Vysper
npm install
npm start
```

### Build Distributable App

#### Step-by-Step Build Process
1. **Clone and Setup** (first time only):
   ```bash
   git clone <repository-url>
   cd Vysper
   npm install
   ```

2. **Create Your Build**:
   ```bash
   # For your current platform (recommended)
   npm run build
   
   # Or specific platforms
   npm run build:mac      # macOS (.dmg + .zip)
   npm run build:win      # Windows (.exe installer + portable)
   npm run build:linux    # Linux (.AppImage + .deb)
   npm run build:all      # All platforms
   ```

3. **Find Your App**: Built files appear in `dist/` folder

#### Build Commands Reference
```bash
# Basic builds
npm run build          # Current platform
npm run build:mac      # macOS (.dmg + .zip)
npm run build:win      # Windows (.exe installer + portable)
npm run build:linux    # Linux (.AppImage + .deb)
npm run build:all      # All platforms

# Development & testing
npm run pack           # Quick build for testing (no compression)
npm run clean          # Clean dist/ folder
npm run rebuild        # Clean + build current platform
npm run release        # Clean + build all platforms
```

#### Build Time Expectations
- **First build**: 2-5 minutes (downloads Electron binaries)
- **Subsequent builds**: 30-60 seconds
- **All platforms**: 3-8 minutes depending on internet speed

**Built apps will be in the `dist/` folder:**
- **macOS**: `Vysper-1.0.0.dmg` (installer) or `Vysper-1.0.0-mac.zip` (portable)
- **Windows**: `Vysper Setup 1.0.0.exe` (installer) or `Vysper 1.0.0.exe` (portable)
- **Linux**: `Vysper-1.0.0.AppImage` (portable) or `Vysper_1.0.0_amd64.deb` (installer)

### Installing Built Apps
- **macOS**: Double-click `.dmg` file → Drag to Applications folder
- **Windows**: Run `.exe` installer or double-click portable version
- **Linux**: Make `.AppImage` executable (`chmod +x`) and run, or install `.deb` with `dpkg`

### Sharing with Others
The built apps are **standalone** - no need for Node.js, npm, or any dependencies!
- Share the `.dmg`/`.exe`/`.AppImage` files directly
- Recipients can run immediately after installation
- Apps work offline (except for AI features requiring internet)

### Build Troubleshooting
**Common Issues:**
- **"electron-builder not found"**: Run `npm install` first
- **"Package electron is only allowed in devDependencies"**: Already fixed in package.json
- **Build fails on Windows**: Install Visual Studio Build Tools
- **Build fails on Linux**: Install `rpm` package (`sudo apt install rpm` on Ubuntu)
- **Large build size**: Normal for Electron apps (90-100MB)
- **Code signing warnings**: Safe to ignore for personal use

**Clean Build Process:**
```bash
rm -rf node_modules dist
npm install
npm run build
```

### Essential Setup
1. **Azure Speech** (for voice commands)
   - Get free key from [Azure Portal](https://portal.azure.com)
   - Add to `.env`: `AZURE_SPEECH_KEY=your_key`

2. **Google Gemini AI** (for intelligent responses)
   - Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Configure in app: Press `Alt+G`

### Environment File
Create `.env`:
```bash
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_region
GEMINI_API_KEY=your_gemini_api_key
```

## ⌨️ Essential Shortcuts

### Core Functions
| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+S` | Screenshot + AI Analysis |
| `Cmd+R` | Voice Recording Toggle |
| `Cmd+\` | Show/Hide All Windows |
| `Alt+A` | Toggle Stealth Mode |

### Navigation
| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+C` | Chat Window |
| `Cmd+Shift+K` | Skills Selection |
| `Cmd+,` | Settings |

### Session Management
| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+\` | Clear Session Memory |
| `Alt+G` | Gemini AI Configuration |

### Important Interaction Usage Tip 
* Enable **Interaction Mode** to scroll, click, or select inside windows.
* Use `Cmd+Up/Down` (in Interaction Mode) to switch skills quickly.
* Click thorugh screen works only when interaction mode is disabled
* In **Stealth Mode**, windows are invisible to screen share & mouse.

## 🔧 Key Features

### Stealth Technology
- **Invisible to Screen Sharing** - Completely hidden from Zoom, Teams, Meet
- **Process Disguise** - Appears as "Vysper" in system monitors
- **Click-through Mode** - Windows become transparent to mouse clicks
- **No Screen Recording Detection** - Undetectable by recording software

### AI-Powered Analysis
- **Screenshot OCR** - Extract and analyze text from any screen content
- **Voice Commands** - Speak questions and get instant AI responses
- **Context-Aware** - Remembers conversation history for better responses
- **Multi-Format Output** - Clean text and code blocks with syntax highlighting

### Interview-Specific Intelligence
- **Problem Recognition** - Automatically detects interview question types
- **Step-by-Step Solutions** - Detailed explanations with best practices
- **Code Examples** - Multi-language implementations with optimizations
- **Time Complexity Analysis** - Big O notation and performance insights

## 💡 Pro Tips

### During Technical Interviews
1. **Position Windows**: Place Vysper windows in screen corners before sharing
2. **Use Voice Mode**: Whisper questions during "thinking time"
3. **Screenshot Problems**: Capture coding challenges for instant solutions
4. **Check Solutions**: Verify your approach with AI before implementing

### For System Design
1. **Capture Requirements**: Screenshot or voice record the problem statement
2. **Get Frameworks**: Ask for architectural patterns and trade-offs
3. **Verify Scalability**: Double-check your design decisions

### Behavioral Questions
1. **STAR Method**: Get structured response frameworks
2. **Industry Examples**: Request relevant scenarios for your field
3. **Follow-up Prep**: Prepare for common follow-up questions

## 🛠 Technical Requirements

- **Node.js** 16+
- **Tesseract OCR** (`brew install tesseract`)
- **Azure Speech Services** (Free tier available)
- **Google Gemini API** (Free quota included)

## 🔒 Privacy & Security

- **Local Processing** - Screenshots analyzed locally only
- **No Data Storage** - Session data cleared automatically
- **Encrypted APIs** - All external communications secured
- **Temporary Files** - Auto-deleted after processing

## 🚀 Advanced Usage

### Session Memory
The app remembers your interview context across multiple questions:

### Custom Skills
Extend with your own interview categories by adding prompt files to `/prompts/` directory.

## 🤝 Contributing

**Help make Vysper the ultimate interview companion!**

We're looking for contributors to help expand this open-source project:

### Priority Areas
- **New Interview Skills** - Add specialized domains (Finance, Marketing, etc.)
- **Language Support** - Expand beyond English for global users
- **Platform Extensions** - Windows and Linux compatibility
- **Mobile Integration** - Companion mobile app for practice sessions
- **UI/UX Improvements** - Enhanced interface and user experience

### How to Contribute
1. 🍴 **Fork the repository**
2. 🌟 **Star the project** if you find it useful
3. 🐛 **Report issues** for bugs or feature requests
4. 💡 **Submit pull requests** for improvements
5. 📚 **Improve documentation** and add examples
6. 🎯 **Share your interview success stories**

### Getting Started
```bash
git clone https://github.com/your-username/Vysper
cd Vysper
npm install
npm run dev
```

### Community
- 💬 **GitHub Discussions** - Feature requests and general chat
- 🐛 **GitHub Issues** - Bug reports and technical issues
- 📧 **Email** - Security vulnerabilities (private disclosure)

**Join us in democratizing interview preparation!** 

Every contribution helps job seekers worldwide perform better in interviews and land their dream jobs.

---

⭐ **Star this repo** if Vysper helped you ace your interviews!
