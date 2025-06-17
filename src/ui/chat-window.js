const logger = require('../core/logger');

class ChatWindowUI {
    constructor() {
        this.isRecording = false;
        this.isInteractive = false;
        this.recognizer = null;
        this.speechConfig = null;
        this.audioConfig = null;
        this.currentTranscription = '';
        this.transcriptionTimeout = null;
        this.lastTranscriptionTime = 0;
        
        this.elements = {};
        
        this.init();
    }

    init() {
        try {
            this.setupElements();
            this.setupEventListeners();
            this.initializeSpeechServices();
            
            logger.info('Chat window UI initialized', { component: 'ChatWindowUI' });
        } catch (error) {
            logger.error('Failed to initialize chat window UI', {
                component: 'ChatWindowUI',
                error: error.message
            });
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
        const { ipcRenderer } = require('electron');
        
        // Interaction state handlers
        ipcRenderer.on('interaction-enabled', () => this.handleInteractionEnabled());
        ipcRenderer.on('interaction-disabled', () => this.handleInteractionDisabled());
        
        // Speech recognition handlers
        ipcRenderer.on('recording-started', () => this.handleRecordingStarted());
        ipcRenderer.on('recording-stopped', () => this.handleRecordingStopped());
        ipcRenderer.on('transcription', (event, text) => this.handleTranscription(text));
        ipcRenderer.on('interim-transcription', (event, text) => this.handleInterimTranscription(text));
        ipcRenderer.on('status', (event, message) => this.addMessage(message, 'system'));
        ipcRenderer.on('error', (event, error) => this.addMessage(`Error: ${error}`, 'error'));
        
        // Skill and session handlers
        this.setupSkillHandlers(ipcRenderer);
        this.setupSessionHandlers();
        
        // UI event handlers
        this.setupUIHandlers();
    }

    setupSkillHandlers(ipcRenderer) {
        ipcRenderer.on('skill-activated', (event, skillName) => {
            this.handleSkillActivated(skillName);
        });
        
        ipcRenderer.on('controls-changed', (event, inChat) => {
            // No visual feedback needed for controls movement
        });
    }

    setupSessionHandlers() {
        window.electronAPI.onSessionEvent((event, sessionEvent) => {
            logger.debug('Session event received in chat', {
                component: 'ChatWindowUI',
                event: sessionEvent
            });
        });

        window.electronAPI.onSessionCleared(() => {
            logger.info('Session memory cleared in chat', { component: 'ChatWindowUI' });
            this.addMessage('Session memory has been cleared', 'system');
        });

        window.electronAPI.onOcrCompleted((event, data) => {
            logger.debug('OCR completed in chat', {
                component: 'ChatWindowUI',
                textLength: data.text?.length || 0
            });
            if (data.text && data.text.trim()) {
                this.addMessage(`📷 OCR Result: ${data.text}`, 'transcription');
            }
        });

        window.electronAPI.onOcrError((event, data) => {
            logger.error('OCR error in chat', {
                component: 'ChatWindowUI',
                error: data.error
            });
            this.addMessage(`OCR Error: ${data.error}`, 'error');
        });

        window.electronAPI.onLlmResponse((event, data) => {
            logger.info('LLM response received in chat', {
                component: 'ChatWindowUI',
                skill: data.skill || 'General'
            });
            this.addMessage(`🤖 LLM Analysis: ${data.response}`, 'system');
        });

        window.electronAPI.onLlmError((event, data) => {
            logger.error('LLM error in chat', {
                component: 'ChatWindowUI',
                error: data.error
            });
            this.addMessage(`LLM Error: ${data.error}`, 'error');
        });
    }

    setupUIHandlers() {
        // Microphone button
        this.elements.micButton.addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
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
    }

    async initializeSpeechServices() {
        try {
            if (typeof require !== 'undefined') {
                const sdk = require('microsoft-cognitiveservices-speech-sdk');
                
                const subscriptionKey = process.env.AZURE_SPEECH_KEY;
                const region = process.env.AZURE_SPEECH_REGION;
                
                if (!subscriptionKey || !region) {
                    throw new Error('Azure Speech credentials not found. Please set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables.');
                }
                
                this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
                this.speechConfig.speechRecognitionLanguage = 'en-US';
                this.speechConfig.enableDictation();
                
                this.addMessage('Azure Speech Services initialized successfully', 'system');
                logger.info('Azure Speech Services initialized', { component: 'ChatWindowUI' });
                return true;
            } else {
                throw new Error('Azure Speech SDK not available');
            }
        } catch (error) {
            this.addMessage(`Failed to initialize Azure Speech Services: ${error.message}`, 'error');
            logger.error('Failed to initialize Azure Speech Services', {
                component: 'ChatWindowUI',
                error: error.message
            });
            return false;
        }
    }

    handleInteractionEnabled() {
        this.isInteractive = true;
        this.elements.chatContainer.classList.remove('non-interactive');
        this.showInteractionIndicator('Interactive', true);
        
        logger.debug('Interaction mode enabled in chat', { component: 'ChatWindowUI' });
    }

    handleInteractionDisabled() {
        this.isInteractive = false;
        this.elements.chatContainer.classList.add('non-interactive');
        this.showInteractionIndicator('Non-Interactive', false);
        
        logger.debug('Interaction mode disabled in chat', { component: 'ChatWindowUI' });
    }

    handleRecordingStarted() {
        if (!this.isRecording) {
            this.startRecording();
        }
    }

    handleRecordingStopped() {
        if (this.isRecording) {
            this.stopRecording();
        }
    }

    handleTranscription(text) {
        if (text && text.trim()) {
            this.addMessage(text, 'transcription');
        }
    }

    handleInterimTranscription(text) {
        logger.debug('Interim transcription received', {
            component: 'ChatWindowUI',
            text
        });
    }

    handleSkillActivated(skillName) {
        const skillPrompts = {
            'dsa': 'DSA Interview Mode: I\'ll help you practice data structures and algorithms. Ask me to explain concepts, solve problems, or review your solutions.',
            'behavioral': 'Behavioral Interview Mode: I\'ll help you practice STAR method responses and behavioral questions. Share your experiences and I\'ll help you structure your answers.',
            'sales': 'Sales Mode: I\'ll help you practice sales techniques, objection handling, and closing strategies. Role-play sales scenarios with me.',
            'presentation': 'Presentation Mode: I\'ll help you practice public speaking and presentation skills. I can provide feedback on your delivery and content.',
            'data-science': 'Data Science Mode: I\'ll help you with machine learning concepts, statistics, and data analysis. Ask me technical questions or discuss your projects.',
            'programming': 'Programming Mode: I\'ll help you with coding best practices, debugging, and software development concepts.',
            'devops': 'DevOps Mode: I\'ll help you with CI/CD, cloud infrastructure, and deployment strategies.',
            'system-design': 'System Design Mode: I\'ll help you practice large-scale system architecture and design patterns.',
            'negotiation': 'Negotiation Mode: I\'ll help you practice negotiation strategies and conflict resolution techniques.'
        };
        
        const prompt = skillPrompts[skillName] || `Ready to help with ${skillName}! Start speaking or ask me questions.`;
        this.addMessage(prompt, 'system');
        
        logger.info('Skill activated in chat', {
            component: 'ChatWindowUI',
            skill: skillName
        });
    }

    async startRecording() {
        if (this.isRecording) {
            logger.warn('Already recording', { component: 'ChatWindowUI' });
            return;
        }
        
        if (!this.speechConfig) {
            const initialized = await this.initializeSpeechServices();
            if (!initialized) {
                return;
            }
        }
        
        try {
            this.isRecording = true;
            this.elements.recordingIndicator.style.display = 'block';
            this.elements.micButton.classList.add('recording');
            this.addMessage('Starting Azure Speech recognition...', 'system');
            
            this.resetTranscriptionState();
            
            const sdk = require('microsoft-cognitiveservices-speech-sdk');
            this.audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
            this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
            
            this.setupRecognizerHandlers(sdk);
            
            this.recognizer.startContinuousRecognitionAsync(
                () => {
                    logger.info('Azure Speech recognition started', { component: 'ChatWindowUI' });
                    this.addMessage('Recording started - speak now!', 'system');
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('recording-started');
                },
                (error) => {
                    logger.error('Failed to start recognition', {
                        component: 'ChatWindowUI',
                        error
                    });
                    this.addMessage(`Failed to start recognition: ${error}`, 'error');
                    this.resetRecordingState();
                }
            );
            
        } catch (error) {
            logger.error('Failed to start recording', {
                component: 'ChatWindowUI',
                error: error.message
            });
            this.addMessage(`Failed to start recording: ${error.message}`, 'error');
            this.resetRecordingState();
        }
    }

    stopRecording() {
        if (!this.isRecording) {
            return;
        }
        
        this.isRecording = false;
        this.elements.recordingIndicator.style.display = 'none';
        this.elements.micButton.classList.remove('recording');
        this.addMessage('Stopping Azure Speech recognition...', 'system');
        
        this.finalizeTranscription();
        
        if (this.recognizer) {
            this.recognizer.stopContinuousRecognitionAsync(
                () => {
                    logger.info('Azure Speech recognition stopped', { component: 'ChatWindowUI' });
                    this.addMessage('Recording stopped', 'system');
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('recording-stopped');
                },
                (error) => {
                    logger.error('Error stopping recognition', {
                        component: 'ChatWindowUI',
                        error
                    });
                }
            );
            
            this.cleanupRecognizer();
        }
    }

    setupRecognizerHandlers(sdk) {
        this.recognizer.recognizing = (s, e) => {
            if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
                logger.debug('Interim transcription', {
                    component: 'ChatWindowUI',
                    text: e.result.text
                });
                this.currentTranscription = e.result.text;
            }
        };
        
        this.recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                logger.debug('Final transcription', {
                    component: 'ChatWindowUI',
                    text: e.result.text
                });
                if (e.result.text && e.result.text.trim()) {
                    this.addMessage(e.result.text, 'transcription');
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('transcription-received', e.result.text);
                    this.currentTranscription = '';
                }
            } else if (e.result.reason === sdk.ResultReason.NoMatch) {
                logger.debug('No speech detected', { component: 'ChatWindowUI' });
                if (this.currentTranscription && this.currentTranscription.trim()) {
                    this.addMessage(this.currentTranscription, 'transcription');
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('transcription-received', this.currentTranscription);
                    this.currentTranscription = '';
                }
            }
        };
        
        this.recognizer.canceled = (s, e) => {
            logger.warn('Recognition canceled', {
                component: 'ChatWindowUI',
                reason: e.reason
            });
            if (e.reason === sdk.CancellationReason.Error) {
                logger.error('Recognition error', {
                    component: 'ChatWindowUI',
                    error: e.errorDetails
                });
                this.addMessage(`Recognition error: ${e.errorDetails}`, 'error');
            }
            this.stopRecording();
        };
        
        this.recognizer.sessionStopped = (s, e) => {
            logger.info('Recognition session stopped', { component: 'ChatWindowUI' });
            this.stopRecording();
        };
    }

    resetTranscriptionState() {
        this.currentTranscription = '';
        this.lastTranscriptionTime = 0;
        if (this.transcriptionTimeout) {
            clearTimeout(this.transcriptionTimeout);
            this.transcriptionTimeout = null;
        }
    }

    resetRecordingState() {
        this.isRecording = false;
        this.elements.recordingIndicator.style.display = 'none';
        this.elements.micButton.classList.remove('recording');
    }

    finalizeTranscription() {
        if (this.currentTranscription && this.currentTranscription.trim()) {
            this.addMessage(this.currentTranscription, 'transcription');
            this.currentTranscription = '';
        }
        
        if (this.transcriptionTimeout) {
            clearTimeout(this.transcriptionTimeout);
            this.transcriptionTimeout = null;
        }
    }

    cleanupRecognizer() {
        if (this.recognizer) {
            this.recognizer.close();
            this.recognizer = null;
        }
        
        if (this.audioConfig) {
            this.audioConfig.close();
            this.audioConfig = null;
        }
    }

    sendMessage() {
        const text = this.elements.messageInput.value.trim();
        if (text) {
            this.addMessage(`${text}`, 'user');
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('text-input', text);
            this.elements.messageInput.value = '';
            
            logger.debug('Message sent', {
                component: 'ChatWindowUI',
                messageLength: text.length
            });
        }
    }

    addMessage(text, type = 'user') {
        const messagesContainer = this.elements.chatMessages;
        const messageDiv = document.createElement('div');
        
        messageDiv.className = `message ${type}`;
        
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        messageDiv.innerHTML = `
            <div class="message-time">${timeString}</div>
            <div class="message-text">${text}</div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        logger.debug('Message added to chat', {
            component: 'ChatWindowUI',
            type,
            textLength: text.length
        });
    }

    showInteractionIndicator(text, interactive) {
        if (this.elements.interactionText) {
            this.elements.interactionText.textContent = text;
            this.elements.interactionIndicator.className = `interaction-indicator show ${interactive ? 'interactive' : 'non-interactive'}`;
            
            setTimeout(() => {
                this.elements.interactionIndicator.classList.remove('show');
            }, 2000);
        }
    }
}

// Initialize when DOM is ready
let chatWindowUI;
document.addEventListener('DOMContentLoaded', () => {
    chatWindowUI = new ChatWindowUI();
});

module.exports = ChatWindowUI; 