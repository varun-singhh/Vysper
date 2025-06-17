# LLM-Optimized Session Memory System for Wysper

## Overview

The Wysper Electron app now features a sophisticated session memory system specifically designed for optimal consumption by Large Language Models (LLMs). This system captures, categorizes, and structures user interactions in a format that enables AI models to provide contextually aware, actionable responses.

## Key Features

### 1. Structured Data Format
All session events are automatically categorized and structured with:
- **Action Types**: Standardized categories (SCREENSHOT_OCR, SPEECH_RECOGNITION, TEXT_INPUT, etc.)
- **Primary Content**: Extracted meaningful content from each action
- **Metadata**: Timestamps, file paths, skills, windows, and error information
- **Context Summaries**: Human-readable descriptions optimized for LLM understanding

### 2. LLM-Optimized Context
Each session event includes an `llm_context` object containing:
```json
{
  "action_type": "SCREENSHOT_OCR",
  "primary_content": "extracted text from screenshot",
  "metadata": {
    "timestamp": "2024-01-01T12:00:00.000Z"
  },
  "context_summary": "User captured a screenshot and extracted text: \"Hello World\""
}
```

### 3. Session Analytics
The system provides comprehensive analytics including:
- Session duration and event counts
- Activity breakdown by type
- Current context (active window, skill, recording status)
- Workflow timeline with step-by-step progression
- Session focus determination

## API Endpoints

### Get LLM-Optimized Session History
```javascript
const llmHistory = await window.electronAPI.getLLMSessionHistory()
```

Returns a structured object with:
- `session_summary`: Human-readable session overview
- `current_context`: Current state information
- `activity_breakdown`: Quantified activity metrics
- `workflow_timeline`: Chronological step-by-step events
- `recent_activities`: Last 5 activities for quick context
- `llm_context`: AI-optimized context information

### Get Raw Session History
```javascript
const rawHistory = await window.electronAPI.getSessionHistory()
```

Returns the complete array of session events with full details.

### Clear Session Memory
```javascript
const result = await window.electronAPI.clearSessionMemory()
```

Clears all session data and returns success status.

## Action Categories

### SCREENSHOT_OCR
- **Trigger**: Screenshot capture with OCR processing
- **Content**: Extracted text from images
- **Use Case**: Document analysis, text extraction, visual content processing

### SPEECH_RECOGNITION
- **Trigger**: Speech-to-text conversion
- **Content**: Transcribed speech content
- **Use Case**: Voice commands, dictation, conversation analysis

### TEXT_INPUT
- **Trigger**: Manual text entry
- **Content**: User-typed text
- **Use Case**: Chat messages, notes, queries

### SKILL_WORK
- **Trigger**: Skill selection and activation
- **Content**: Selected skill name and context
- **Use Case**: Workflow tracking, skill-specific assistance

### WINDOW_NAVIGATION
- **Trigger**: Window switching and UI interactions
- **Content**: Target window and navigation context
- **Use Case**: UI state tracking, workflow analysis

### SYSTEM_CONTROL
- **Trigger**: System-level operations
- **Content**: Control actions and system state
- **Use Case**: System monitoring, automation tracking

## LLM Integration Examples

### 1. Context-Aware Responses
```javascript
const llmHistory = await window.electronAPI.getLLMSessionHistory()
const context = llmHistory.llm_context.current_context
// "User is in chat window with Sales skill active and currently recording speech"
```

### 2. Workflow Analysis
```javascript
const workflow = llmHistory.llm_context.user_workflow
// "User captured 3 screenshots with OCR, conducted 2 speech recognition sessions, worked with skills: Sales, DSA interview"
```

### 3. Activity-Based Recommendations
```javascript
const focus = llmHistory.llm_context.session_focus
// "SCREENSHOT_AND_OCR_WORK" - suggests user is primarily working with visual content
```

### 4. Recent Activity Context
```javascript
const recent = llmHistory.recent_activities
// Last 5 activities with timestamps and summaries for immediate context
```

## Keyboard Shortcuts

- **Option+H**: View session history (LLM-optimized format)
- **Option+;**: Clear session memory
- **Option+2**: Switch to chat window
- **Option+3**: Switch to skills window

## Best Practices for LLM Integration

### 1. Context Injection
When sending session data to LLMs, include:
```javascript
const prompt = `
Current Session Context:
${llmHistory.llm_context.current_context}

User Workflow:
${llmHistory.llm_context.user_workflow}

Recent Activities:
${llmHistory.recent_activities.map(a => `- ${a.summary}`).join('\n')}

User Query: ${userInput}
`
```

### 2. Dynamic Response Adaptation
Use session focus to adapt responses:
```javascript
switch(llmHistory.llm_context.session_focus) {
  case 'SCREENSHOT_AND_OCR_WORK':
    // Provide image analysis assistance
    break;
  case 'SPEECH_RECOGNITION_WORK':
    // Provide voice interaction help
    break;
  case 'SKILL_PRACTICE_WORK':
    // Provide skill-specific guidance
    break;
}
```

### 3. Workflow Optimization
Analyze workflow patterns to suggest improvements:
```javascript
const timeline = llmHistory.workflow_timeline
const efficiency = analyzeWorkflowEfficiency(timeline)
// Provide suggestions for workflow optimization
```

## Data Structure Examples

### Complete LLM History Object
```json
{
  "session_summary": "Session started at 12:00:00 PM, duration: 45 minutes",
  "total_events": 23,
  "session_duration": "45 minutes",
  "current_context": {
    "active_window": "chat",
    "active_skill": "Sales",
    "recording_status": "inactive",
    "last_action": "User typed: \"How do I handle objections?\""
  },
  "activity_breakdown": {
    "screenshots_taken": 5,
    "speech_sessions": 3,
    "text_inputs": 8,
    "skills_used": ["Sales", "DSA interview"],
    "window_switches": 7
  },
  "workflow_timeline": [
    {
      "step": 1,
      "time": "12:00:00 PM",
      "action": "SKILL_SELECTION",
      "summary": "User selected skill: Sales",
      "content": "Sales"
    }
  ],
  "recent_activities": [
    {
      "time": "12:44:30 PM",
      "action": "TEXT_INPUT",
      "summary": "User typed: \"How do I handle objections?\""
    }
  ],
  "llm_context": {
    "user_workflow": "User captured 5 screenshots with OCR, conducted 3 speech recognition sessions, entered 8 text inputs, worked with skills: Sales, DSA interview",
    "primary_activities": ["SCREENSHOT_OCR", "SPEECH_RECOGNITION", "TEXT_INPUT", "SKILL_WORK"],
    "current_context": "User is in chat window with Sales skill active",
    "session_focus": "MIXED_ACTIVITIES"
  }
}
```

## Security and Privacy

- Session data is stored locally in memory only
- Screenshot files are automatically deleted immediately after OCR processing
- No file paths are tracked or stored in session memory
- No data is transmitted to external services unless explicitly requested
- Session memory is cleared when the app is closed
- Users can manually clear session data at any time

## Troubleshooting

### Common Issues
1. **Session history not updating**: Check if events are being logged properly
2. **LLM context missing**: Ensure all actions are properly categorized
3. **Performance issues**: Large session histories may impact performance

### Debug Information
Enable console logging to see session events:
```javascript
// Events are automatically logged to console
console.log(`[SESSION] ${event.time} - ${action}:`, details)
```

## Future Enhancements

- Persistent session storage across app restarts
- Export session data in various formats (JSON, CSV, PDF)
- Advanced analytics and insights
- Integration with external LLM APIs
- Custom action categorization
- Session comparison and benchmarking 