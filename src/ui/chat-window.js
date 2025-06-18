const logger = require('../core/logger').createServiceLogger('CHAT-UI');

class ChatWindowUI {
    constructor() {
        this.isRecording = false;
        this.isInteractive = true; // Start in interactive mode
        this.elements = {};
        
        this.init();
    }

    init() {
        try {
            this.setupElements();
            this.setupEventListeners();
            this.addMessage('Chat window initialized. Click microphone or press ⌘+R to start recording.', 'system');
            
            logger.info('Chat window UI initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize chat window UI', { error: error.message });
            console.error('Chat window initialization failed:', error);
        }
    }

    setupElements() {
        this.elements = {
            chatMessages: document.getElementById('chatMessages'),
            recordingIndicator: document.getElementById('recordingIndicator'),
            messageInput: document.getElementById('messageInput'),
            sendButton: document.getElementById('sendButton'),
            micButton: document.getElementById('micButton'),
            chatContainer: document.getElementById('chatContainer'),
            interactionIndicator: document.getElementById('interactionIndicator'),
            interactionText: document.getElementById('interactionText')
        };
        
        // Validate required elements
        const requiredElements = ['chatMessages', 'micButton', 'sendButton', 'messageInput'];
        for (const elementKey of requiredElements) {
            if (!this.elements[elementKey]) {
                throw new Error(`Required element '${elementKey}' not found`);
            }
        }
    }

    setupEventListeners() {
        // Interaction state handlers
        if (window.electronAPI) {
            window.electronAPI.onInteractionModeChanged((event, interactive) => {
                this.isInteractive = interactive;
                if (interactive) {
                    this.handleInteractionEnabled();
                } else {
                    this.handleInteractionDisabled();
                }
            });
            
            // Speech recognition handlers
            window.electronAPI.onTranscriptionReceived((event, data) => {
                if (data && data.text) {
                    this.handleTranscription(data.text);
                }
            });
            
            window.electronAPI.onSpeechStatus((event, data) => {
                if (data && data.status) {
                    this.addMessage(data.status, 'system');
                    
                    // Update recording state based on status
                    if (data.status.includes('started') || data.status.includes('Recording')) {
                        this.handleRecordingStarted();
                    } else if (data.status.includes('stopped') || data.status.includes('ended')) {
                        this.handleRecordingStopped();
                    }
                }
            });
            
            window.electronAPI.onSpeechError((event, data) => {
                if (data && data.error) {
                    this.addMessage(`Speech Error: ${data.error}`, 'error');
                    this.handleRecordingStopped(); // Stop recording on error
                }
            });
            
            // Skill handlers
            window.electronAPI.onSkillChanged((event, data) => {
                if (data && data.skill) {
                    this.handleSkillActivated(data.skill);
                }
            });
            
            // Session handlers
            window.electronAPI.onSessionCleared(() => {
                this.addMessage('Session memory has been cleared', 'system');
            });
            
            window.electronAPI.onOcrCompleted((event, data) => {
                if (data.text && data.text.trim()) {
                    this.addMessage(`📷 OCR Result: ${data.text}`, 'transcription');
                }
            });
            
            window.electronAPI.onOcrError((event, data) => {
                this.addMessage(`OCR Error: ${data.error}`, 'error');
            });
            
            window.electronAPI.onLlmResponse((event, data) => {
                this.addMessage(`🤖 LLM Response: ${data.response}`, 'system');
            });
            
            window.electronAPI.onLlmError((event, data) => {
                this.addMessage(`LLM Error: ${data.error}`, 'error');
            });
        }
        
        // UI event handlers
        this.setupUIHandlers();
        
        logger.debug('Chat window event listeners set up');
    }

    setupUIHandlers() {
        // Microphone button
        this.elements.micButton.addEventListener('click', async () => {
            if (!this.isInteractive) {
                this.addMessage('Window is in non-interactive mode. Press Alt+A to enable interaction.', 'error');
                return;
            }
            
            try {
                if (this.isRecording) {
                    await window.electronAPI.stopSpeechRecognition();
                } else {
                    await window.electronAPI.startSpeechRecognition();
                }
            } catch (error) {
                this.addMessage(`Speech recognition error: ${error.message}`, 'error');
                logger.error('Speech recognition failed', { error: error.message });
            }
        });
        
        // Send button
        this.elements.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });
        
        // Message input
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'r') {
                e.preventDefault();
                this.elements.micButton.click();
            }
        });
    }

    handleInteractionEnabled() {
        this.isInteractive = true;
        this.elements.chatContainer.classList.remove('non-interactive');
        this.showInteractionIndicator('Interactive', true);
        logger.debug('Interaction mode enabled in chat');
    }

    handleInteractionDisabled() {
        this.isInteractive = false;
        this.elements.chatContainer.classList.add('non-interactive');
        this.showInteractionIndicator('Non-Interactive', false);
        logger.debug('Interaction mode disabled in chat');
    }

    handleRecordingStarted() {
        this.isRecording = true;
        if (this.elements.recordingIndicator) {
            this.elements.recordingIndicator.style.display = 'block';
        }
        if (this.elements.micButton) {
            this.elements.micButton.classList.add('recording');
        }
        logger.debug('Recording started in chat window');
    }

    handleRecordingStopped() {
        this.isRecording = false;
        if (this.elements.recordingIndicator) {
            this.elements.recordingIndicator.style.display = 'none';
        }
        if (this.elements.micButton) {
            this.elements.micButton.classList.remove('recording');
        }
        logger.debug('Recording stopped in chat window');
    }

    handleTranscription(text) {
        if (text && text.trim()) {
            this.addMessage(text, 'transcription');
            logger.debug('Transcription received in chat', { textLength: text.length });
        }
    }

    handleSkillActivated(skillName) {
        const skillPrompts = {
            'dsa': '🧠 DSA Mode: Ready to practice data structures and algorithms!',
            'behavioral': '💼 Behavioral Mode: Ready to practice behavioral interview questions!',
            'sales': '💰 Sales Mode: Ready to practice sales techniques!',
            'presentation': '🎤 Presentation Mode: Ready to practice public speaking!',
            'data-science': '📊 Data Science Mode: Ready to discuss ML and analytics!',
            'programming': '💻 Programming Mode: Ready to discuss coding best practices!',
            'devops': '🚀 DevOps Mode: Ready to discuss CI/CD and infrastructure!',
            'system-design': '🏗️ System Design Mode: Ready to architect large-scale systems!',
            'negotiation': '🤝 Negotiation Mode: Ready to practice negotiation strategies!'
        };
        
        const prompt = skillPrompts[skillName] || `🎯 ${skillName} Mode: Ready to help!`;
        this.addMessage(prompt, 'system');
        
        logger.info('Skill activated in chat', { skill: skillName });
    }

    sendMessage() {
        const text = this.elements.messageInput.value.trim();
        if (text) {
            this.addMessage(text, 'user');
            this.elements.messageInput.value = '';
            logger.debug('User message sent', { textLength: text.length });
        }
    }

    addMessage(text, type = 'user') {
        if (!this.elements.chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = text;
        
        messageDiv.appendChild(timeDiv);
        messageDiv.appendChild(textDiv);
        
        this.elements.chatMessages.appendChild(messageDiv);
        
        // Auto-scroll to bottom
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    showInteractionIndicator(text, interactive) {
        if (!this.elements.interactionIndicator || !this.elements.interactionText) return;
        
        this.elements.interactionText.textContent = text;
        this.elements.interactionIndicator.className = `interaction-indicator show ${interactive ? 'interactive' : 'non-interactive'}`;
        
        setTimeout(() => {
            this.elements.interactionIndicator.classList.remove('show');
        }, 2000);
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new ChatWindowUI();
    });
} else {
    new ChatWindowUI();
} 