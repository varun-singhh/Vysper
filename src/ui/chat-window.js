try {
    console.log('🚀 CHAT-WINDOW.JS: Script loading...');

    // Check if we're in Node.js context or browser context
    let logger;
    try {
        logger = require('../core/logger').createServiceLogger('CHAT-UI');
        console.log('✅ CHAT-WINDOW: Logger initialized via require');
    } catch (error) {
        console.log('⚠️ CHAT-WINDOW: Could not require logger, using console fallback');
        logger = {
            info: (...args) => console.log('[CHAT-UI INFO]', ...args),
            debug: (...args) => console.log('[CHAT-UI DEBUG]', ...args),
            error: (...args) => console.error('[CHAT-UI ERROR]', ...args),
            warn: (...args) => console.warn('[CHAT-UI WARN]', ...args)
        };
    }

class ChatWindowUI {
    constructor() {
        console.log('🏗️ CHAT-WINDOW: ChatWindowUI constructor called');
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
            interactionText: document.getElementById('interactionText'),
            listeningContainer: document.getElementById('listeningContainer'),
            listeningDuration: document.getElementById('listeningDuration')
        };
        
        // Validate required elements
        const requiredElements = ['chatMessages', 'micButton', 'sendButton', 'messageInput'];
        for (const elementKey of requiredElements) {
            if (!this.elements[elementKey]) {
                throw new Error(`Required element '${elementKey}' not found`);
            }
        }
        
        // Initialize listening timer
        this.listeningStartTime = null;
        this.listeningTimer = null;
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
                console.log('🎤 Transcription received:', data);
                if (data && data.text) {
                    this.handleTranscription(data.text);
                } else {
                    console.warn('Transcription event received but no text data:', data);
                }
            });
            
            // Listen for interim transcription (real-time)
            if (window.electronAPI.onInterimTranscription) {
                window.electronAPI.onInterimTranscription((event, data) => {
                    console.log('🔄 Interim transcription:', data);
                    if (data && data.text) {
                        this.showInterimText(data.text);
                    }
                });
            }
            
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
            
            window.electronAPI.onTranscriptionLlmResponse((event, data) => {
                if (data && data.response) {
                    // Hide thinking indicator
                    this.hideThinkingIndicator();
                    
                    // Add assistant response with formatting
                    this.addMessage(data.response, 'assistant');
                }
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
        
        // Show listening animation
        this.showListeningAnimation();
        
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
        
        // Hide listening animation
        this.hideListeningAnimation();
        
        logger.debug('Recording stopped in chat window');
    }

    handleTranscription(text) {
        console.log('📝 Handling transcription:', text);
        if (text && text.trim()) {
            // Hide listening animation first
            this.hideListeningAnimation();
            
            // Show transcribed text with a slight delay for smooth transition
            setTimeout(() => {
                this.addMessage(text, 'transcription');
                console.log('✅ Transcription message added to chat');
                
                // Show thinking indicator after transcription
                setTimeout(() => {
                    this.showThinkingIndicator();
                }, 300);
            }, 200);
            
            logger.debug('Transcription received in chat', { textLength: text.length });
        } else {
            console.warn('❌ Transcription text is empty or invalid:', text);
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

    async sendMessage() {
        const text = this.elements.messageInput.value.trim();
        if (text) {
            this.addMessage(text, 'user');
            this.elements.messageInput.value = '';
            
            // Send to main process for session memory storage
            try {
                if (window.electronAPI && window.electronAPI.sendChatMessage) {
                    await window.electronAPI.sendChatMessage(text);
                }
            } catch (error) {
                logger.error('Failed to send chat message to main process', { error: error.message });
            }
            
            logger.debug('User message sent', { textLength: text.length });
        }
    }

    addMessage(text, type = 'user') {
        console.log(`💬 Adding message [${type}]:`, text);
        
        if (!this.elements.chatMessages) {
            console.error('❌ Chat messages element not found!');
            return;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        
        // Format assistant messages as markdown
        if (type === 'assistant') {
            textDiv.innerHTML = this.formatMarkdown(text);
        } else {
            textDiv.textContent = text;
        }
        
        messageDiv.appendChild(timeDiv);
        messageDiv.appendChild(textDiv);
        
        this.elements.chatMessages.appendChild(messageDiv);
        
        // Auto-scroll to bottom
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        
        console.log('✅ Message added successfully, total messages:', this.elements.chatMessages.children.length);
    }

    formatMarkdown(text) {
        if (!text) return '';
        
        return text
            // Convert bullet points
            .replace(/^[•\-\*]\s+(.+)$/gm, '<div class="bullet-point">• $1</div>')
            // Convert numbered lists
            .replace(/^\d+\.\s+(.+)$/gm, '<div class="numbered-point">$1</div>')
            // Convert bold text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Convert italic text
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // Convert inline code
            .replace(/`(.+?)`/g, '<code>$1</code>')
            // Convert line breaks
            .replace(/\n/g, '<br>');
    }

    showThinkingIndicator() {
        if (!this.elements.chatMessages) return;

        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message assistant thinking';
        thinkingDiv.id = 'thinking-indicator';

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text thinking-dots';
        textDiv.innerHTML = '<span class="dot">•</span><span class="dot">•</span><span class="dot">•</span>';

        thinkingDiv.appendChild(timeDiv);
        thinkingDiv.appendChild(textDiv);

        this.elements.chatMessages.appendChild(thinkingDiv);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    hideThinkingIndicator() {
        const thinkingIndicator = document.getElementById('thinking-indicator');
        if (thinkingIndicator) {
            thinkingIndicator.remove();
        }
    }

    showInteractionIndicator(text, interactive) {
        if (!this.elements.interactionIndicator || !this.elements.interactionText) return;
        
        this.elements.interactionText.textContent = text;
        this.elements.interactionIndicator.className = `interaction-indicator show ${interactive ? 'interactive' : 'non-interactive'}`;
        
        setTimeout(() => {
            this.elements.interactionIndicator.classList.remove('show');
        }, 2000);
    }

    showListeningAnimation() {
        console.log('🎵 Showing listening animation');
        
        if (!this.elements.listeningContainer) {
            console.warn('❌ Listening container not found');
            return;
        }
        
        // Show the listening animation
        this.elements.listeningContainer.classList.add('active');
        
        // Start the duration timer
        this.listeningStartTime = Date.now();
        this.listeningTimer = setInterval(() => {
            this.updateListeningDuration();
        }, 100);
        
        // Auto-scroll to show the listening animation
        if (this.elements.chatMessages) {
            this.elements.chatMessages.scrollTop = 0;
        }
    }

    hideListeningAnimation() {
        console.log('🔇 Hiding listening animation');
        
        if (this.elements.listeningContainer) {
            this.elements.listeningContainer.classList.remove('active');
        }
        
        // Clear interim text
        this.clearInterimText();
        
        // Clear the duration timer
        if (this.listeningTimer) {
            clearInterval(this.listeningTimer);
            this.listeningTimer = null;
        }
        
        this.listeningStartTime = null;
    }

    updateListeningDuration() {
        if (!this.listeningStartTime || !this.elements.listeningDuration) return;
        
        const elapsed = Date.now() - this.listeningStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const milliseconds = Math.floor((elapsed % 1000) / 100);
        
        const formattedTime = `${seconds.toString().padStart(2, '0')}:${milliseconds}`;
        this.elements.listeningDuration.textContent = formattedTime;
    }

    showInterimText(text) {
        console.log('🔄 Showing interim text:', text);
        
        if (!this.elements.listeningContainer) return;
        
        // Find or create interim text element
        let interimElement = this.elements.listeningContainer.querySelector('.interim-text');
        if (!interimElement) {
            interimElement = document.createElement('div');
            interimElement.className = 'interim-text';
            interimElement.style.cssText = `
                color: rgba(255, 255, 255, 0.8);
                font-size: 12px;
                font-style: italic;
                margin-top: 10px;
                padding: 8px;
                background: rgba(76, 175, 80, 0.2);
                border-radius: 6px;
                min-height: 20px;
                border: 1px dashed rgba(76, 175, 80, 0.4);
            `;
            this.elements.listeningContainer.appendChild(interimElement);
        }
        
        interimElement.textContent = text || 'Waiting for speech...';
    }

    clearInterimText() {
        if (!this.elements.listeningContainer) return;
        
        const interimElement = this.elements.listeningContainer.querySelector('.interim-text');
        if (interimElement) {
            interimElement.remove();
        }
    }
}

    // Initialize when DOM is loaded
    console.log('🌐 CHAT-WINDOW: Document ready state:', document.readyState);

    if (document.readyState === 'loading') {
        console.log('⏳ CHAT-WINDOW: Waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ CHAT-WINDOW: DOMContentLoaded fired, creating ChatWindowUI');
            new ChatWindowUI();
        });
    } else {
        console.log('✅ CHAT-WINDOW: DOM already loaded, creating ChatWindowUI immediately');
        new ChatWindowUI();
    }

} catch (error) {
    console.error('💥 CHAT-WINDOW.JS: Script execution failed!', error);
    console.error('💥 CHAT-WINDOW.JS: Error stack:', error.stack);
} 