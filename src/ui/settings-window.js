// Settings Window Management
class SettingsWindow {
  constructor() {
    this.appIcons = {
      'terminal': { 
        name: 'Terminal', 
        file: 'terminal.png',
        description: 'Clean terminal interface',
        appName: 'Terminal '
      },
      'activity': { 
        name: 'Activity Monitor', 
        file: 'activity.png',
        description: 'System activity tracking',
        appName: 'Activity Monitor '
      },
      'settings': { 
        name: 'System Settings', 
        file: 'settings.png',
        description: 'Configuration and settings',
        appName: 'System Settings '
      }
    };

    this.currentSettings = {
      codingLanguage: 'javascript',
      activeSkill: 'dsa',
      appIcon: 'terminal'
    };

    this.init();
  }

  async init() {
    await this.loadCurrentSettings();
    this.setupEventListeners();
    this.populateIconGrid();
    this.updateUI();
  }

  async loadCurrentSettings() {
    try {
      // Request current settings from main process
      if (typeof window !== 'undefined' && window.electronAPI) {
        const settings = await window.electronAPI.getSettings();
        if (settings) {
          this.currentSettings = { ...this.currentSettings, ...settings };
        }
      }
    } catch (error) {
      console.log('Using default settings');
    }
  }

  setupEventListeners() {
    // Language selection - auto-save on change
    const languageSelect = document.getElementById('codingLanguage');
    languageSelect.addEventListener('change', async (e) => {
      this.currentSettings.codingLanguage = e.target.value;
      this.updateCurrentLanguageDisplay();
      await this.autoSaveSetting('codingLanguage', e.target.value);
    });

    // Skill selection - auto-save on change
    const skillSelect = document.getElementById('activeSkill');
    skillSelect.addEventListener('change', async (e) => {
      this.currentSettings.activeSkill = e.target.value;
      this.updateCurrentSkillDisplay();
      await this.autoSaveSetting('activeSkill', e.target.value);
    });

    // Hide save/cancel buttons since we're auto-saving
    document.getElementById('saveBtn').style.display = 'none';
    document.getElementById('cancelBtn').textContent = 'Close';
    
    // Close button
    document.getElementById('cancelBtn').addEventListener('click', () => {
      this.closeWindow();
    });

    // Handle window close
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        // Settings are already saved automatically
      });
    }

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeWindow();
      }
    });
  }

  populateIconGrid() {
    const iconGrid = document.getElementById('iconGrid');
    iconGrid.innerHTML = '';

    Object.entries(this.appIcons).forEach(([key, icon]) => {
      const iconElement = document.createElement('div');
      iconElement.className = 'icon-option';
      iconElement.dataset.iconKey = key;
      
      // Create image element instead of emoji
      const imgElement = document.createElement('img');
      imgElement.src = `assests/icons/${icon.file}`;
      imgElement.alt = icon.name;
      imgElement.style.width = '40px';
      imgElement.style.height = '40px';
      imgElement.style.objectFit = 'contain';
      imgElement.style.borderRadius = '8px';
      
      // Create name label
      const nameElement = document.createElement('div');
      nameElement.textContent = icon.name;
      nameElement.style.fontSize = '12px';
      nameElement.style.marginTop = '4px';
      nameElement.style.color = 'rgba(255, 255, 255, 0.8)';
      nameElement.style.textAlign = 'center';
      
      iconElement.appendChild(imgElement);
      iconElement.appendChild(nameElement);
      iconElement.title = icon.description;

      // Set current selection
      if (key === this.currentSettings.appIcon) {
        iconElement.classList.add('selected');
      }

      // Click handler
      iconElement.addEventListener('click', () => {
        this.selectIcon(key);
      });

      iconGrid.appendChild(iconElement);
    });
  }

  async selectIcon(iconKey) {
    // Remove previous selection
    document.querySelectorAll('.icon-option').forEach(el => {
      el.classList.remove('selected');
    });

    // Add new selection
    const selectedElement = document.querySelector(`[data-icon-key="${iconKey}"]`);
    if (selectedElement) {
      selectedElement.classList.add('selected');
    }

    // Update settings
    this.currentSettings.appIcon = iconKey;
    this.updateCurrentIconDisplay();

    // Auto-save the icon change
    await this.autoSaveIcon(iconKey);
  }

  updateUI() {
    // Update language dropdown
    document.getElementById('codingLanguage').value = this.currentSettings.codingLanguage;
    this.updateCurrentLanguageDisplay();

    // Update skill dropdown
    document.getElementById('activeSkill').value = this.currentSettings.activeSkill;
    this.updateCurrentSkillDisplay();

    // Update icon display
    this.updateCurrentIconDisplay();
  }

  updateCurrentLanguageDisplay() {
    const languageSelect = document.getElementById('codingLanguage');
    const selectedOption = languageSelect.options[languageSelect.selectedIndex];
    document.getElementById('currentLanguage').textContent = selectedOption.text;
  }

  updateCurrentSkillDisplay() {
    const skillSelect = document.getElementById('activeSkill');
    const selectedOption = skillSelect.options[skillSelect.selectedIndex];
    document.getElementById('currentSkill').textContent = selectedOption.text;
  }

  updateCurrentIconDisplay() {
    const iconData = this.appIcons[this.currentSettings.appIcon];
    if (iconData) {
      document.getElementById('currentIcon').textContent = iconData.name;
    }
  }

  async autoSaveSetting(settingType, value) {
    try {
      console.log(`Auto-saving ${settingType}:`, value);
      
      if (typeof window !== 'undefined' && window.electronAPI) {
        // Save the specific setting
        const settingsUpdate = { [settingType]: value };
        await window.electronAPI.saveSettings(settingsUpdate);

        // Update skill in main window if it's a skill change
        if (settingType === 'activeSkill') {
          await window.electronAPI.updateActiveSkill(value);
        }

        console.log(`${settingType} auto-saved successfully`);
      }
    } catch (error) {
      console.error(`Failed to auto-save ${settingType}:`, error);
      this.showTempFeedback(`Failed to save ${settingType}`, 'error');
    }
  }

  async autoSaveIcon(iconKey) {
    try {
      console.log('Auto-saving icon:', iconKey);
      
      if (typeof window !== 'undefined' && window.electronAPI) {
        // Save icon setting
        await window.electronAPI.saveSettings({ appIcon: iconKey });
        
        // Update app icon and name immediately
        await window.electronAPI.updateAppIcon(iconKey);
        console.log('Icon auto-saved successfully');
      }
    } catch (error) {
      console.error('Failed to auto-save icon:', error);
      this.showTempFeedback('Failed to save icon', 'error');
    }
  }

  showTempFeedback(message, type = 'success') {
    // Create or update feedback element
    let feedback = document.getElementById('tempFeedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'tempFeedback';
      feedback.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 15px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        z-index: 1000;
        transition: all 0.3s ease;
        opacity: 0;
        transform: translateX(100px);
      `;
      document.body.appendChild(feedback);
    }

    // Set message and style
    feedback.textContent = message;
    feedback.style.background = type === 'success' 
      ? 'linear-gradient(135deg, #4CAF50, #45a049)' 
      : 'linear-gradient(135deg, #f44336, #d32f2f)';
    feedback.style.color = 'white';

    // Show with animation
    setTimeout(() => {
      feedback.style.opacity = '1';
      feedback.style.transform = 'translateX(0)';
    }, 10);

    // Hide after delay
    setTimeout(() => {
      feedback.style.opacity = '0';
      feedback.style.transform = 'translateX(100px)';
    }, 2000);
  }

  closeWindow() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.closeWindow();
    }
  }

  // Method to get skill display name
  getSkillDisplayName(skillKey) {
    const skillNames = {
      'programming': 'Programming',
      'dsa': 'Data Structures & Algorithms',
      'system-design': 'System Design',
      'behavioral': 'Behavioral Interview',
      'data-science': 'Data Science',
      'sales': 'Sales & Business',
      'presentation': 'Presentation Skills',
      'negotiation': 'Negotiation',
      'devops': 'DevOps & Infrastructure'
    };
    return skillNames[skillKey] || skillKey;
  }

  // Method to get language display name
  getLanguageDisplayName(langKey) {
    const select = document.getElementById('codingLanguage');
    const option = select.querySelector(`option[value="${langKey}"]`);
    return option ? option.textContent : langKey;
  }
}

// Initialize the settings window when DOM is loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    new SettingsWindow();
  });
}

// Global functions for electron API
if (typeof window !== 'undefined') {
  window.settingsAPI = {
    updateSettings: (settings) => {
      if (window.settingsWindow) {
        window.settingsWindow.currentSettings = { ...window.settingsWindow.currentSettings, ...settings };
        window.settingsWindow.updateUI();
      }
    }
  };
} 