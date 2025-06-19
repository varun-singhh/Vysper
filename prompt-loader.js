const fs = require('fs');
const path = require('path');

class PromptLoader {
  constructor() {
    this.prompts = new Map();
    this.promptsLoaded = false;
    this.skillPromptSent = new Set(); // Track which skills have had their system prompt sent
    this.skillsRequiringProgrammingLanguage = ['programming', 'dsa', 'devops', 'system-design', 'data-science'];
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
        }
      }
      
      this.promptsLoaded = true;
      
    } catch (error) {
      console.error('Error loading skill prompts:', error);
      throw new Error(`Failed to load skill prompts: ${error.message}`);
    }
  }

  /**
   * Get the system prompt for a specific skill with optional programming language injection
   * @param {string} skillName - The name of the skill
   * @param {string|null} programmingLanguage - Optional programming language to inject
   * @returns {string|null} The system prompt content or null if not found
   */
  getSkillPrompt(skillName, programmingLanguage = null) {
    if (!this.promptsLoaded) {
      this.loadPrompts();
    }

    const normalizedSkillName = this.normalizeSkillName(skillName);
    let promptContent = this.prompts.get(normalizedSkillName);
    
    if (!promptContent) {
      return null;
    }

    // Inject programming language if provided and skill requires it
    if (programmingLanguage && this.skillsRequiringProgrammingLanguage.includes(normalizedSkillName)) {
      promptContent = this.injectProgrammingLanguage(promptContent, programmingLanguage, normalizedSkillName);
    }

    return promptContent;
  }

  /**
   * Inject programming language context into skill prompts
   * @param {string} promptContent - Original prompt content
   * @param {string} programmingLanguage - Programming language to inject
   * @param {string} skillName - Normalized skill name
   * @returns {string} Modified prompt with programming language context
   */
  injectProgrammingLanguage(promptContent, programmingLanguage, skillName) {
    const languageUpper = programmingLanguage.toUpperCase();
    const languageTitle = programmingLanguage.charAt(0).toUpperCase() + programmingLanguage.slice(1);
    
    // Create language-specific injection based on skill type
    let languageInjection = '';
    
    switch (skillName) {
      case 'programming':
        languageInjection = `\n\n## PRIMARY PROGRAMMING LANGUAGE: ${languageUpper}
Unless explicitly asked for a different language, all code examples, solutions, and explanations should use ${languageTitle}. Consider ${languageTitle}-specific:
- Syntax and best practices
- Standard libraries and frameworks
- Common patterns and idioms
- Performance characteristics
- Ecosystem tools and conventions`;
        break;
        
      case 'dsa':
        languageInjection = `\n\n## IMPLEMENTATION LANGUAGE: ${languageUpper}
When providing algorithm implementations and data structure examples, use ${languageTitle} as the primary language. Focus on:
- ${languageTitle}-specific syntax for algorithms
- Built-in data structures available in ${languageTitle}
- Language-specific optimizations
- Standard library methods relevant to DSA
- Time/space complexity in the context of ${languageTitle}`;
        break;
        
      case 'system-design':
        languageInjection = `\n\n## IMPLEMENTATION CONTEXT: ${languageUpper}
When discussing implementation details, code examples, or technology choices, consider ${languageTitle} as the primary language context:
- ${languageTitle} frameworks and libraries for system components
- Language-specific performance characteristics
- Ecosystem tools for monitoring, deployment, and scaling
- ${languageTitle}-based microservices patterns
- Database drivers and ORM options for ${languageTitle}`;
        break;
        
      case 'data-science':
        languageInjection = `\n\n## PRIMARY LANGUAGE: ${languageUpper}
All data science solutions, code examples, and library recommendations should prioritize ${languageTitle}:
- ${languageTitle}-specific data science libraries and frameworks
- Language-appropriate data manipulation techniques
- Visualization tools available in ${languageTitle}
- Machine learning libraries and model implementation
- Data processing and pipeline tools for ${languageTitle}`;
        break;
        
      case 'devops':
        languageInjection = `\n\n## SCRIPTING/AUTOMATION LANGUAGE: ${languageUpper}
When providing automation scripts, infrastructure code, or tooling examples, use ${languageTitle} as the primary language:
- ${languageTitle}-based automation and scripting
- Infrastructure as Code tools that work with ${languageTitle}
- CI/CD pipeline configurations for ${languageTitle} projects
- Monitoring and logging solutions compatible with ${languageTitle}
- Container and orchestration setups for ${languageTitle} applications`;
        break;
        
      default:
        languageInjection = `\n\n## PROGRAMMING LANGUAGE CONTEXT: ${languageUpper}
When providing technical examples or code-related advice, use ${languageTitle} as the primary programming language.`;
    }

    // Insert the language injection at the end of the prompt
    return promptContent + languageInjection;
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
      return true;
    }

    // Check if we've already sent this skill's prompt as model memory
    const hasSkillInMemory = storedMemory.some(event => 
      event.skillUsed === normalizedSkillName && event.promptSentAsMemory === true
    );

    if (!hasSkillInMemory) {
      return true;
    }

    return false;
  }

  /**
   * Prepare Gemini API request with model memory or regular message
   * @param {string} skillName - The active skill
   * @param {string} userMessage - The user's message/query
   * @param {Array} storedMemory - Current stored memory
   * @param {string|null} programmingLanguage - Optional programming language
   * @returns {Object} Gemini API request configuration
   */
  prepareGeminiRequest(skillName, userMessage, storedMemory, programmingLanguage = null) {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const skillPrompt = this.getSkillPrompt(normalizedSkillName, programmingLanguage);
    
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
        
        // Mark that we're sending this as model memory
        this.skillPromptSent.add(normalizedSkillName);
        
        return {
          ...requestConfig,
          isUsingModelMemory: true,
          skillUsed: normalizedSkillName,
          programmingLanguage
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
    
    return {
      ...requestConfig,
      isUsingModelMemory: false,
      skillUsed: normalizedSkillName,
      programmingLanguage
    };
  }

  /**
   * Alternative method: Get separate components for manual API construction
   * @param {string} skillName - The active skill
   * @param {string} userMessage - The user's message/query
   * @param {Array} storedMemory - Current stored memory
   * @param {string|null} programmingLanguage - Optional programming language
   * @returns {Object} Separated components for manual request building
   */
  getRequestComponents(skillName, userMessage, storedMemory, programmingLanguage = null) {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const shouldUseModelMemory = this.shouldSendAsModelMemory(skillName, storedMemory);
    const skillPrompt = this.getSkillPrompt(normalizedSkillName, programmingLanguage);

    return {
      skillName: normalizedSkillName,
      userMessage,
      skillPrompt,
      shouldUseModelMemory,
      isFirstTime: this.isFirstTimeInteraction(storedMemory),
      modelMemory: shouldUseModelMemory && skillPrompt ? skillPrompt : null,
      messageContent: userMessage,
      programmingLanguage,
      requiresProgrammingLanguage: this.skillsRequiringProgrammingLanguage.includes(normalizedSkillName)
    };
  }

  /**
   * Update stored memory after successful API call
   * @param {Array} storedMemory - Current stored memory array
   * @param {string} skillName - The skill that was used
   * @param {boolean} wasModelMemoryUsed - Whether model memory was used
   * @param {string} userMessage - The user message
   * @param {string} aiResponse - The AI response
   * @param {string|null} programmingLanguage - Programming language used
   * @returns {Array} Updated stored memory
   */
  updateStoredMemory(storedMemory, skillName, wasModelMemoryUsed, userMessage, aiResponse, programmingLanguage = null) {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const updatedMemory = [...(storedMemory || [])];
    
    const memoryEntry = {
      timestamp: new Date().toISOString(),
      skillUsed: normalizedSkillName,
      promptSentAsMemory: wasModelMemoryUsed,
      userMessage,
      aiResponse: aiResponse ? aiResponse.substring(0, 200) + '...' : null, // Truncated for storage
      action: wasModelMemoryUsed ? 'MODEL_MEMORY_SENT' : 'REGULAR_MESSAGE',
      programmingLanguage: programmingLanguage || null
    };
    
    updatedMemory.push(memoryEntry);
        
    return updatedMemory;
  }

  /**
   * Example usage method showing complete flow
   * @param {string} skillName - The active skill
   * @param {string} userMessage - User's message
   * @param {Array} storedMemory - Current stored memory
   * @param {string|null} programmingLanguage - Optional programming language
   * @returns {Object} Complete flow result
   */
  async processUserRequest(skillName, userMessage, storedMemory, programmingLanguage = null) {
    try {
      // Get request components
      const components = this.getRequestComponents(skillName, userMessage, storedMemory, programmingLanguage);

      // Prepare the actual API request
      const geminiRequest = this.prepareGeminiRequest(skillName, userMessage, storedMemory, programmingLanguage);
      
      return {
        requestReady: true,
        geminiRequest,
        components,
        needsMemoryUpdate: true,
        programmingLanguage
      };
      
    } catch (error) {
      console.error('Error processing user request:', error);
      return {
        requestReady: false,
        error: error.message,
        programmingLanguage
      };
    }
  }

  /**
   * Check if a skill requires programming language context
   * @param {string} skillName - The skill name to check
   * @returns {boolean} True if skill requires programming language
   */
  requiresProgrammingLanguage(skillName) {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    return this.skillsRequiringProgrammingLanguage.includes(normalizedSkillName);
  }

  /**
   * Get list of skills that require programming language context
   * @returns {Array<string>} Array of skill names that require programming language
   */
  getSkillsRequiringProgrammingLanguage() {
    return [...this.skillsRequiringProgrammingLanguage];
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
      skillsUsed: Array.from(this.skillPromptSent),
      skillsRequiringProgrammingLanguage: this.skillsRequiringProgrammingLanguage
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