const fs = require('fs');
const path = require('path');

class PromptLoader {
  constructor() {
    this.prompts = new Map();
    this.promptsLoaded = false;
    this.skillPromptSent = new Set(); // Track which skills have had their system prompt sent
  }

  /**
   * Load all skill prompts from the prompts directory
   */
  loadPrompts() {
    if (this.promptsLoaded) {
      return;
    }

    const promptsDir = path.join(__dirname, 'prompts');
    
    try {
      const files = fs.readdirSync(promptsDir);
      
      for (const file of files) {
        if (file.endsWith('.md')) {
          const skillName = path.basename(file, '.md');
          const filePath = path.join(promptsDir, file);
          const promptContent = fs.readFileSync(filePath, 'utf8');
          
          this.prompts.set(skillName, promptContent);
          console.log(`Loaded system prompt for skill: ${skillName}`);
        }
      }
      
      this.promptsLoaded = true;
      console.log(`Successfully loaded ${this.prompts.size} skill prompts`);
      
    } catch (error) {
      console.error('Error loading skill prompts:', error);
      throw new Error(`Failed to load skill prompts: ${error.message}`);
    }
  }

  /**
   * Get the system prompt for a specific skill
   * @param {string} skillName - The name of the skill
   * @returns {string|null} The system prompt content or null if not found
   */
  getSkillPrompt(skillName) {
    if (!this.promptsLoaded) {
      this.loadPrompts();
    }

    const normalizedSkillName = this.normalizeSkillName(skillName);
    return this.prompts.get(normalizedSkillName) || null;
  }

  /**
   * Check if stored memory is empty (first time interaction)
   * @param {Array} storedMemory - Current stored memory from your system
   * @returns {boolean} True if memory is empty
   */
  isFirstTimeInteraction(storedMemory) {
    return !storedMemory || storedMemory.length === 0;
  }

  /**
   * Check if skill prompt should be sent as model memory
   * @param {string} skillName - The name of the skill
   * @param {Array} storedMemory - Current stored memory
   * @returns {boolean} True if skill prompt should be sent as model memory
   */
  shouldSendAsModelMemory(skillName, storedMemory) {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    
    // If stored memory is empty, this is the first time - send as model memory
    if (this.isFirstTimeInteraction(storedMemory)) {
      console.log(`First interaction - will send ${normalizedSkillName} prompt as model memory`);
      return true;
    }

    // Check if we've already sent this skill's prompt as model memory
    const hasSkillInMemory = storedMemory.some(event => 
      event.skillUsed === normalizedSkillName && event.promptSentAsMemory === true
    );

    if (!hasSkillInMemory) {
      console.log(`${normalizedSkillName} prompt not yet sent as model memory - will send`);
      return true;
    }

    console.log(`${normalizedSkillName} prompt already in model memory - skipping`);
    return false;
  }

  /**
   * Prepare Gemini API request with model memory or regular message
   * @param {string} skillName - The active skill
   * @param {string} userMessage - The user's message/query
   * @param {Array} storedMemory - Current stored memory
   * @returns {Object} Gemini API request configuration
   */
  prepareGeminiRequest(skillName, userMessage, storedMemory) {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const skillPrompt = this.getSkillPrompt(normalizedSkillName);
    
    const requestConfig = {
      model: 'gemini-pro', // or your preferred Gemini model
      contents: [],
      systemInstruction: null,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      }
    };

    // If stored memory is empty or skill prompt not sent, use model memory
    if (this.shouldSendAsModelMemory(skillName, storedMemory)) {
      if (skillPrompt) {
        // Send skill prompt as system instruction (model memory)
        requestConfig.systemInstruction = {
          parts: [{ text: skillPrompt }]
        };
        
        // Add user message as regular content
        requestConfig.contents.push({
          role: 'user',
          parts: [{ text: userMessage }]
        });

        console.log(`Prepared Gemini request with model memory for ${normalizedSkillName}`);
        console.log(`System instruction length: ${skillPrompt.length} characters`);
        
        // Mark that we're sending this as model memory
        this.skillPromptSent.add(normalizedSkillName);
        
        return {
          ...requestConfig,
          isUsingModelMemory: true,
          skillUsed: normalizedSkillName
        };
      } else {
        console.warn(`No system prompt found for skill: ${normalizedSkillName}`);
      }
    }

    // Regular message (stored memory not empty, prompt already sent)
    requestConfig.contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    console.log(`Prepared regular Gemini request for ${normalizedSkillName}`);
    
    return {
      ...requestConfig,
      isUsingModelMemory: false,
      skillUsed: normalizedSkillName
    };
  }

  /**
   * Alternative method: Get separate components for manual API construction
   * @param {string} skillName - The active skill
   * @param {string} userMessage - The user's message/query
   * @param {Array} storedMemory - Current stored memory
   * @returns {Object} Separated components for manual request building
   */
  getRequestComponents(skillName, userMessage, storedMemory) {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const shouldUseModelMemory = this.shouldSendAsModelMemory(skillName, storedMemory);
    const skillPrompt = this.getSkillPrompt(normalizedSkillName);

    return {
      skillName: normalizedSkillName,
      userMessage,
      skillPrompt,
      shouldUseModelMemory,
      isFirstTime: this.isFirstTimeInteraction(storedMemory),
      modelMemory: shouldUseModelMemory && skillPrompt ? skillPrompt : null,
      messageContent: userMessage
    };
  }

  /**
   * Update stored memory after successful API call
   * @param {Array} storedMemory - Current stored memory array
   * @param {string} skillName - The skill that was used
   * @param {boolean} wasModelMemoryUsed - Whether model memory was used
   * @param {string} userMessage - The user message
   * @param {string} aiResponse - The AI response
   * @returns {Array} Updated stored memory
   */
  updateStoredMemory(storedMemory, skillName, wasModelMemoryUsed, userMessage, aiResponse) {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const updatedMemory = [...(storedMemory || [])];
    
    const memoryEntry = {
      timestamp: new Date().toISOString(),
      skillUsed: normalizedSkillName,
      promptSentAsMemory: wasModelMemoryUsed,
      userMessage,
      aiResponse: aiResponse ? aiResponse.substring(0, 200) + '...' : null, // Truncated for storage
      action: wasModelMemoryUsed ? 'MODEL_MEMORY_SENT' : 'REGULAR_MESSAGE'
    };
    
    updatedMemory.push(memoryEntry);
    
    console.log(`Updated stored memory: ${wasModelMemoryUsed ? 'Model memory used' : 'Regular message'} for ${normalizedSkillName}`);
    
    return updatedMemory;
  }

  /**
   * Example usage method showing complete flow
   * @param {string} skillName - The active skill
   * @param {string} userMessage - User's message
   * @param {Array} storedMemory - Current stored memory
   * @returns {Object} Complete flow result
   */
  async processUserRequest(skillName, userMessage, storedMemory) {
    try {
      // Get request components
      const components = this.getRequestComponents(skillName, userMessage, storedMemory);
      
      console.log('Processing request:', {
        skill: components.skillName,
        isFirstTime: components.isFirstTime,
        useModelMemory: components.shouldUseModelMemory,
        hasPrompt: !!components.skillPrompt
      });

      // Prepare the actual API request
      const geminiRequest = this.prepareGeminiRequest(skillName, userMessage, storedMemory);
      
      return {
        requestReady: true,
        geminiRequest,
        components,
        needsMemoryUpdate: true
      };
      
    } catch (error) {
      console.error('Error processing user request:', error);
      return {
        requestReady: false,
        error: error.message
      };
    }
  }

  /**
   * Normalize skill names to match file names
   * @param {string} skillName - Raw skill name
   * @returns {string} Normalized skill name
   */
  normalizeSkillName(skillName) {
    if (!skillName) return 'general';
    
    // Convert to lowercase and handle common variations
    const normalized = skillName.toLowerCase().trim();
    
    // Map common variations to standard names
    const skillMap = {
      'dsa': 'dsa',
      'data-structures': 'dsa',
      'algorithms': 'dsa',
      'data-structures-algorithms': 'dsa',
      'behavioral': 'behavioral',
      'behavioral-interview': 'behavioral',
      'behavior': 'behavioral',
      'sales': 'sales',
      'selling': 'sales',
      'business-development': 'sales',
      'presentation': 'presentation',
      'presentations': 'presentation',
      'public-speaking': 'presentation',
      'data-science': 'data-science',
      'datascience': 'data-science',
      'machine-learning': 'data-science',
      'ml': 'data-science',
      'programming': 'programming',
      'coding': 'programming',
      'software-development': 'programming',
      'development': 'programming',
      'devops': 'devops',
      'dev-ops': 'devops',
      'infrastructure': 'devops',
      'system-design': 'system-design',
      'systems-design': 'system-design',
      'architecture': 'system-design',
      'distributed-systems': 'system-design',
      'negotiation': 'negotiation',
      'negotiating': 'negotiation',
      'conflict-resolution': 'negotiation'
    };

    return skillMap[normalized] || normalized;
  }

  /**
   * Get list of available skills
   * @returns {Array<string>} Array of available skill names
   */
  getAvailableSkills() {
    if (!this.promptsLoaded) {
      this.loadPrompts();
    }
    
    return Array.from(this.prompts.keys());
  }

  /**
   * Reset the prompt sent tracking and clear stored memory
   */
  resetSession() {
    this.skillPromptSent.clear();
    console.log('Session reset - next skill usage will use model memory');
  }

  /**
   * Get current session statistics
   * @returns {Object} Statistics about current session
   */
  getSessionStats() {
    if (!this.promptsLoaded) {
      this.loadPrompts();
    }

    const stats = {
      totalPrompts: this.prompts.size,
      skillsUsedInSession: this.skillPromptSent.size,
      availableSkills: this.getAvailableSkills(),
      skillsUsed: Array.from(this.skillPromptSent)
    };

    return stats;
  }
}

// Export singleton instance
const promptLoader = new PromptLoader();

module.exports = {
  PromptLoader,
  promptLoader
};