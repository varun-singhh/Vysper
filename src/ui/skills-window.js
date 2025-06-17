const logger = require('../core/logger');

class SkillsWindowUI {
    constructor() {
        this.isInteractive = false;
        this.activeSkill = null;
        this.skillCards = [];
        this.currentSkillIndex = 0;
        
        this.elements = {};
        
        this.init();
    }

    init() {
        try {
            this.setupElements();
            this.setupEventListeners();
            this.initializeSkills();
            
            logger.info('Skills window UI initialized', { component: 'SkillsWindowUI' });
        } catch (error) {
            logger.error('Failed to initialize skills window UI', {
                component: 'SkillsWindowUI',
                error: error.message
            });
        }
    }

    setupElements() {
        this.elements = {
            skillsContainer: document.getElementById('skillsContainer'),
            skillsContent: document.getElementById('skillsContent'),
            activeIndicator: document.getElementById('activeIndicator'),
            interactionIndicator: document.getElementById('interactionIndicator'),
            interactionText: document.getElementById('interactionText')
        };
        
        // Validate required elements
        const requiredElements = ['skillsContainer', 'skillsContent'];
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
        
        // Window state handlers
        ipcRenderer.on('window-activated', () => this.handleWindowActivated());
        ipcRenderer.on('window-deactivated', () => this.handleWindowDeactivated());
        
        // Skill navigation handlers
        ipcRenderer.on('navigate-skill', (event, direction) => this.navigateSkill(direction));
        ipcRenderer.on('select-skill', (event, skillName) => this.selectSkill(skillName));
        
        // Global skill change handlers
        ipcRenderer.on('skill-changed', (event, data) => this.handleGlobalSkillChanged(data));
        ipcRenderer.on('current-skill', (event, data) => this.handleCurrentSkillResponse(data));
        
        // UI event handlers
        this.setupUIHandlers();
        this.setupKeyboardHandlers();
    }

    setupUIHandlers() {
        // Event listeners for skill cards
        document.querySelectorAll('.skill-card').forEach(card => {
            card.addEventListener('click', () => {
                const skillName = card.getAttribute('data-skill');
                this.selectSkill(skillName);
            });
        });
    }

    setupKeyboardHandlers() {
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });
    }

    handleInteractionEnabled() {
        this.isInteractive = true;
        this.elements.skillsContainer.classList.remove('non-interactive');
        this.showInteractionIndicator('Interactive', true);
        
        logger.debug('Interaction mode enabled in skills', { component: 'SkillsWindowUI' });
    }

    handleInteractionDisabled() {
        this.isInteractive = false;
        this.elements.skillsContainer.classList.add('non-interactive');
        this.showInteractionIndicator('Non-Interactive', false);
        
        logger.debug('Interaction mode disabled in skills', { component: 'SkillsWindowUI' });
    }

    handleWindowActivated() {
        if (this.elements.activeIndicator) {
            this.elements.activeIndicator.style.display = 'block';
        }
        logger.debug('Skills window activated', { component: 'SkillsWindowUI' });
    }

    handleWindowDeactivated() {
        if (this.elements.activeIndicator) {
            this.elements.activeIndicator.style.display = 'none';
        }
        logger.debug('Skills window deactivated', { component: 'SkillsWindowUI' });
    }

    handleGlobalSkillChanged(data) {
        logger.debug('Global skill changed', {
            component: 'SkillsWindowUI',
            skill: data.skill
        });
        this.selectSkill(data.skill, true); // fromGlobal = true to avoid circular events
    }

    handleCurrentSkillResponse(data) {
        logger.debug('Received current skill state', {
            component: 'SkillsWindowUI',
            skill: data.skill
        });
        if (data.skill) {
            this.selectSkill(data.skill, true); // fromGlobal = true to avoid circular events
        }
    }

    handleKeyDown(e) {
        if (e.key === 'Enter' && this.activeSkill) {
            this.activateSkill(this.activeSkill);
        }
        
        // Handle Cmd+Up/Down for skill navigation when skills window is focused and interactive
        if ((e.metaKey || e.ctrlKey) && document.hasFocus() && this.isInteractive) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                this.navigateSkill('prev');
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                this.navigateSkill('next');
            }
        }
    }

    navigateSkill(direction) {
        if (this.skillCards.length === 0) {
            logger.warn('No skill cards available for navigation', { component: 'SkillsWindowUI' });
            return;
        }
        
        if (direction === 'next') {
            this.currentSkillIndex = (this.currentSkillIndex + 1) % this.skillCards.length;
        } else if (direction === 'prev') {
            this.currentSkillIndex = (this.currentSkillIndex - 1 + this.skillCards.length) % this.skillCards.length;
        }
        
        this.updateActiveSkillDisplay();
        
        const currentCard = this.skillCards[this.currentSkillIndex];
        if (currentCard) {
            this.activeSkill = currentCard.getAttribute('data-skill');
            
            // Scroll to make the active skill visible
            currentCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            
            logger.debug('Navigated to skill', {
                component: 'SkillsWindowUI',
                skill: this.activeSkill,
                index: this.currentSkillIndex
            });
            
            // Send skill selection to main process to sync across all windows
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('skill-selected', this.activeSkill);
        }
    }

    selectSkill(skillName, fromGlobal = false) {
        this.updateActiveSkillDisplay();
        
        // Add active class to selected skill
        const selectedCard = document.querySelector(`[data-skill="${skillName}"]`);
        if (selectedCard) {
            selectedCard.classList.add('active');
            const status = selectedCard.querySelector('.skill-status');
            if (status) {
                status.classList.add('active');
            }
            this.activeSkill = skillName;
            
            // Update current index
            this.currentSkillIndex = this.skillCards.indexOf(selectedCard);
            
            // Scroll to make the active skill visible
            selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            
            logger.debug('Skill selected', {
                component: 'SkillsWindowUI',
                skill: skillName,
                fromGlobal,
                index: this.currentSkillIndex
            });
            
            // Only send to main process if this wasn't triggered by a global change
            if (!fromGlobal) {
                const { ipcRenderer } = require('electron');
                ipcRenderer.send('skill-selected', skillName);
            }
        } else {
            logger.warn('Skill card not found', {
                component: 'SkillsWindowUI',
                skill: skillName
            });
        }
    }

    activateSkill(skillName) {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('activate-skill', skillName);
        
        logger.info('Skill activated', {
            component: 'SkillsWindowUI',
            skill: skillName
        });
    }

    updateActiveSkillDisplay() {
        // Remove active class from all skills
        this.skillCards.forEach(card => {
            card.classList.remove('active');
            const status = card.querySelector('.skill-status');
            if (status) {
                status.classList.remove('active');
            }
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

    initializeSkills() {
        try {
            this.skillCards = Array.from(document.querySelectorAll('.skill-card'));
            
            if (this.skillCards.length > 0) {
                this.currentSkillIndex = 0;
                const firstSkill = this.skillCards[0].getAttribute('data-skill');
                this.activeSkill = firstSkill; // Set initial active skill but don't broadcast
                
                // Request current skill state from main process
                const { ipcRenderer } = require('electron');
                ipcRenderer.send('request-current-skill');
                
                logger.debug('Skills initialized', {
                    component: 'SkillsWindowUI',
                    skillCount: this.skillCards.length,
                    initialSkill: firstSkill
                });
            } else {
                logger.warn('No skill cards found', { component: 'SkillsWindowUI' });
            }
        } catch (error) {
            logger.error('Failed to initialize skills', {
                component: 'SkillsWindowUI',
                error: error.message
            });
        }
    }

    // Public methods for external access
    getCurrentSkill() {
        return this.activeSkill;
    }

    getSkillCards() {
        return this.skillCards;
    }

    isInteractiveMode() {
        return this.isInteractive;
    }
}

// Initialize when DOM is ready
let skillsWindowUI;
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure all DOM elements are ready
    setTimeout(() => {
        skillsWindowUI = new SkillsWindowUI();
    }, 100);
});

module.exports = SkillsWindowUI; 