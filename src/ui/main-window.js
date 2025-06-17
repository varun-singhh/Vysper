// Simple logger for renderer process
const logger = {
    info: (...args) => console.log('[MainWindowUI]', ...args),
    debug: (...args) => console.log('[MainWindowUI DEBUG]', ...args),
    error: (...args) => console.error('[MainWindowUI ERROR]', ...args),
    warn: (...args) => console.warn('[MainWindowUI WARN]', ...args)
};

class MainWindowUI {
    constructor() {
        this.isInteractive = false;
        this.isHidden = false;
        this.currentSkill = 'dsa';
        this.statusDot = null;
        this.skillIndicator = null;
        
        this.init();
    }

    init() {
        try {
            this.setupElements();
            this.setupEventListeners();
            this.updateSkillIndicator();
            this.resizeWindowToContent();
            
            logger.info('Main window UI initialized', {
                component: 'MainWindowUI',
                skill: this.currentSkill
            });
        } catch (error) {
            logger.error('Failed to initialize main window UI', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    resizeWindowToContent() {
        // Wait for DOM to fully render
        setTimeout(() => {
            const commandTab = document.querySelector('.command-tab');
            if (commandTab && window.electronAPI && window.electronAPI.resizeWindow) {
                const rect = commandTab.getBoundingClientRect();
                const width = Math.ceil(rect.width);
                const height = Math.ceil(rect.height);
                
                logger.debug('Resizing window to content', {
                    width,
                    height,
                    component: 'MainWindowUI'
                });
                
                window.electronAPI.resizeWindow(width, height);
            }
        }, 100);
    }

    setupElements() {
        this.statusDot = document.getElementById('statusDot');
        this.skillIndicator = document.getElementById('skillIndicator');
        this.settingsIndicator = document.getElementById('settingsIndicator');
        
        if (!this.statusDot || !this.skillIndicator || !this.settingsIndicator) {
            throw new Error('Required UI elements not found');
        }

        // Add click handler for settings
        this.settingsIndicator.addEventListener('click', () => {
            console.log('Settings clicked!');
            this.openSettings();
        });
        
        console.log('Settings click handler attached to:', this.settingsIndicator);
    }

    setupEventListeners() {
        // Set up event listeners using electronAPI from preload
        if (window.electronAPI) {
            // Skill change handlers
            window.electronAPI.onSkillChanged((event, data) => this.handleSkillChanged(data));
            
            // LLM handlers
            window.electronAPI.onLlmResponse((event, data) => this.handleLLMResponse(data));
            window.electronAPI.onLlmError((event, data) => this.handleLLMError(data));
        }
        
        // IPC event listeners
        window.addEventListener('message', (event) => {
            if (event.data.type === 'set-interactive') {
                this.handleInteractionModeChanged(event.data.interactive);
            }
        });
        
        // Use the electron IPC directly for the 'set-interactive' event
        if (window.electronAPI && window.electronAPI.onInteractionModeChanged) {
            window.electronAPI.onInteractionModeChanged((event, interactive) => {
                this.handleInteractionModeChanged(interactive);
            });
        }
        
        // Keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Settings shortcut
        this.setupSettingsShortcut();
    }

    handleLLMResponse(data) {
        logger.info('LLM response received', {
            component: 'MainWindowUI',
            skill: data.skill || 'General'
        });
        this.showNotification(`LLM Analysis Complete - ${data.skill || 'General'}`, 'success');
    }

    handleLLMError(data) {
        logger.error('LLM error received', {
            component: 'MainWindowUI',
            error: data.error
        });
        this.showNotification(`LLM Error: ${data.error}`, 'error');
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.metaKey && e.key === '\\') {
                this.isHidden = !this.isHidden;
                if (this.isHidden) {
                    this.showHiddenIndicator();
                }
            }
            
            // Alt+A is handled globally by the main process
            // No need to handle it here since it needs to work even when windows are non-interactive
        });
    }

    handleInteractionEnabled() {
        this.isInteractive = true;
        this.statusDot.className = 'status-dot interactive';
        this.skillIndicator.classList.remove('non-interactive');
        
        logger.debug('Interaction mode enabled', { component: 'MainWindowUI' });
    }

    handleInteractionDisabled() {
        this.isInteractive = false;
        this.statusDot.className = 'status-dot non-interactive';
        this.skillIndicator.classList.add('non-interactive');
        
        logger.debug('Interaction mode disabled', { component: 'MainWindowUI' });
    }

    handleInteractionModeChanged(interactive) {
        this.isInteractive = interactive;
        
        if (interactive) {
            this.handleInteractionEnabled();
        } else {
            this.handleInteractionDisabled();
        }
        
        logger.info('Interaction mode changed via IPC', {
            component: 'MainWindowUI',
            interactive
        });
    }

    handleSkillChanged(data) {
        this.currentSkill = data.skill;
        this.updateSkillIndicator();
        
        logger.info('Skill changed', {
            component: 'MainWindowUI',
            skill: this.currentSkill
        });
    }

    handleSkillActivated(skillName) {
        this.currentSkill = skillName;
        this.updateSkillIndicator();
        
        logger.info('Skill activated', {
            component: 'MainWindowUI',
            skill: skillName
        });
    }

    handleScreenshotRequest() {
        logger.debug('Screenshot request received', { component: 'MainWindowUI' });
    }

    handleRecordingStarted() {
        logger.debug('Recording started', { component: 'MainWindowUI' });
    }

    handleRecordingStopped() {
        logger.debug('Recording stopped', { component: 'MainWindowUI' });
    }

    updateSkillIndicator() {
        const skillNames = {
            'dsa': 'DSA',
            'behavioral': 'Behavioral', 
            'sales': 'Sales',
            'presentation': 'Presentation',
            'data-science': 'Data Science',
            'programming': 'Programming',
            'devops': 'DevOps',
            'system-design': 'System Design',
            'negotiation': 'Negotiation'
        };
        
        const skillName = skillNames[this.currentSkill] || this.currentSkill.toUpperCase();
        const skillSpan = this.skillIndicator.querySelector('span');
        
        if (skillSpan) {
            skillSpan.textContent = skillName;
            
            const tooltip = this.isInteractive ? 
                `${skillName} - Use ⌘↑/↓ to navigate skills` : 
                `${skillName} - Enable interactive mode (Alt+A) to navigate`;
            this.skillIndicator.title = tooltip;
            
            // Add visual feedback for skill change
            this.animateSkillChange();
        }
    }

    animateSkillChange() {
        this.skillIndicator.style.transform = 'scale(1.1)';
        this.skillIndicator.style.transition = 'transform 0.2s ease';
        
        setTimeout(() => {
            this.skillIndicator.style.transform = 'scale(1)';
        }, 200);
    }

    showHiddenIndicator() {
        const indicator = document.querySelector('.hidden-indicator');
        if (indicator) {
            indicator.classList.add('show');
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 3000);
        }
    }

    toggleInteractiveMode() {
        this.isInteractive = !this.isInteractive;
        this.statusDot.className = `status-dot ${this.isInteractive ? 'interactive' : 'non-interactive'}`;
        
        if (this.isInteractive) {
            this.skillIndicator.classList.remove('non-interactive');
        } else {
            this.skillIndicator.classList.add('non-interactive');
        }
        
        logger.debug('Interactive mode toggled', {
            component: 'MainWindowUI',
            interactive: this.isInteractive
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 ${
            type === 'error' ? 'bg-red-600' : 
            type === 'success' ? 'bg-green-600' :
            'bg-blue-600'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        logger.debug('Notification shown', {
            component: 'MainWindowUI',
            message,
            type
        });
    }

    async showGeminiConfig() {
        try {
            const status = await window.electronAPI.getGeminiStatus();
            
            const modal = this.createGeminiConfigModal(status);
            document.body.appendChild(modal);
            
            logger.debug('Gemini config modal shown', { component: 'MainWindowUI' });
        } catch (error) {
            logger.error('Failed to show Gemini config', {
                component: 'MainWindowUI',
                error: error.message
            });
            this.showNotification('Failed to load Gemini configuration', 'error');
        }
    }

    createGeminiConfigModal(status) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-900 text-white p-6 rounded-lg max-w-md w-full">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">🤖 Gemini Flash 1.5 Configuration</h2>
                    <button class="text-gray-400 hover:text-white" onclick="this.closest('.fixed').remove()">✕</button>
                </div>
                
                <div class="mb-4 p-3 rounded ${status.hasApiKey ? 'bg-green-900' : 'bg-red-900'}">
                    <p><strong>Status:</strong> ${status.hasApiKey ? 'Configured' : 'Not Configured'}</p>
                    <p><strong>Model:</strong> ${status.model}</p>
                </div>
                
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">API Key:</label>
                    <input type="password" id="geminiApiKey" placeholder="Enter your Gemini API key" 
                           class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white">
                    <p class="text-xs text-gray-400 mt-1">
                        Get your API key from: <a href="https://makersuite.google.com/app/apikey" target="_blank" class="text-blue-400">Google AI Studio</a>
                    </p>
                </div>
                
                <div class="flex space-x-2">
                    <button onclick="mainWindowUI.configureGemini()" class="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
                        Configure
                    </button>
                    <button onclick="mainWindowUI.testGeminiConnection()" class="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded">
                        Test Connection
                    </button>
                </div>
                
                <div class="mt-4 text-center">
                    <button class="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded" onclick="this.closest('.fixed').remove()">
                        Close
                    </button>
                </div>
            </div>
        `;
        return modal;
    }

    async configureGemini() {
        const apiKey = document.getElementById('geminiApiKey').value.trim();
        if (!apiKey) {
            this.showNotification('Please enter an API key', 'error');
            return;
        }
        
        try {
            const result = await window.electronAPI.setGeminiApiKey(apiKey);
            if (result.success) {
                this.showNotification('Gemini API key configured successfully!', 'success');
                document.querySelector('.fixed').remove();
                
                logger.info('Gemini API key configured', { component: 'MainWindowUI' });
            } else {
                this.showNotification(`Configuration failed: ${result.error}`, 'error');
                logger.error('Gemini configuration failed', {
                    component: 'MainWindowUI',
                    error: result.error
                });
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
            logger.error('Gemini configuration error', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    async testGeminiConnection() {
        try {
            const result = await window.electronAPI.testGeminiConnection();
            if (result.success) {
                this.showNotification('Gemini connection test successful!', 'success');
                logger.info('Gemini connection test successful', { component: 'MainWindowUI' });
            } else {
                this.showNotification(`Connection test failed: ${result.error}`, 'error');
                logger.error('Gemini connection test failed', {
                    component: 'MainWindowUI',
                    error: result.error
                });
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
            logger.error('Gemini connection test error', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    setupSettingsShortcut() {
        document.addEventListener('keydown', (e) => {
            // Cmd+, or Ctrl+, for settings
            if ((e.metaKey || e.ctrlKey) && e.key === ',') {
                console.log('Settings keyboard shortcut pressed!');
                e.preventDefault();
                this.openSettings();
            }
        });
        console.log('Settings keyboard shortcut handler attached');
    }

    openSettings() {
        console.log('openSettings called');
        try {
            console.log('window.electronAPI:', window.electronAPI);
            if (window.electronAPI && window.electronAPI.showSettings) {
                window.electronAPI.showSettings();
                console.log('showSettings called successfully');
            } else {
                console.error('electronAPI or showSettings not available');
                return;
            }
            
            // Add visual feedback
            this.settingsIndicator.style.transform = 'scale(1.1)';
            this.settingsIndicator.style.transition = 'transform 0.2s ease';
            
            setTimeout(() => {
                this.settingsIndicator.style.transform = 'scale(1)';
            }, 200);
            
            logger.info('Settings window opened', { component: 'MainWindowUI' });
        } catch (error) {
            console.error('Error opening settings:', error);
            logger.error('Failed to open settings', {
                component: 'MainWindowUI',
                error: error.message
            });
            this.showNotification('Failed to open settings', 'error');
        }
    }
}

// Initialize when DOM is ready
let mainWindowUI;
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        mainWindowUI = new MainWindowUI();
    });
}

module.exports = MainWindowUI; 