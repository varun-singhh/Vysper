# Google Gemini Flash 1.5 Integration Guide

## Overview

Wysper now integrates with Google Gemini Flash 1.5 to provide intelligent, contextual responses to OCR text based on selected skills. This integration replaces the mock LLM responses with actual AI processing.

## Features

### 1. **Intelligent Content Analysis**
- Automatically analyzes OCR text to determine content type
- Provides skill-specific responses based on active skill selection
- Handles questions, descriptions, and technical content appropriately

### 2. **Skill-Based Response Formatting**
- **DSA**: Complete programming problems with test cases, constraints, and code examples
- **Behavioral**: STAR method framework with sample answers and tips
- **Sales**: Sales frameworks, objection handling, and best practices
- **Presentation**: Structure, delivery tips, and visual design principles
- **Data Science**: Methodological approach with code examples
- **General**: Appropriate analysis for non-technical content

### 3. **Enhanced Prompt Engineering**
- Optimized prompts for Gemini Flash 1.5
- Context-aware responses using session memory
- Structured output with clear headings and formatting

## Setup Instructions

### 1. **Get Your API Key**
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the API key (starts with "AIza...")

### 2. **Configure in Wysper**
1. Press `Alt+G` to open Gemini configuration
2. Enter your API key in the secure input field
3. Click "Configure" to save
4. Click "Test Connection" to verify setup

### 3. **Environment Variable (Optional)**
You can also set the API key via environment variable:
```bash
# Create a .env file in the project root
GEMINI_API_KEY=your_api_key_here
```

## Usage

### 1. **Basic Workflow**
1. Select a skill from the skills window (`Alt+3`)
2. Take a screenshot (`Cmd+Shift+S`)
3. OCR extracts text from the image
4. Gemini Flash 1.5 analyzes the content
5. Contextual response is displayed

### 2. **Response Types**

#### DSA Problems
- Problem statement with constraints
- Input/output format specifications
- Sample test cases with explanations
- Algorithm approach and complexity analysis
- Complete solution code
- Key insights and optimization tips

#### Behavioral Questions
- STAR method framework
- Key competencies being assessed
- Sample talking points
- Follow-up questions to prepare for
- Communication tips

#### Sales Queries
- Sales framework and methodology
- Customer understanding and value proposition
- Objection handling strategies
- Closing techniques and follow-up
- Best practices and common mistakes

#### Presentation Guidance
- Presentation structure (opening, body, closing)
- Delivery techniques and body language
- Visual design principles
- Audience engagement strategies
- Practice tips and common mistakes

#### Data Science Analysis
- Methodological approach
- Data preprocessing and feature engineering
- Model selection and evaluation
- Code examples in Python/R
- Best practices and tools

## Keyboard Shortcuts

- `Alt+G`: Open Gemini configuration
- `Cmd+Shift+S`: Take screenshot and process with Gemini
- `Alt+H`: View session history
- `Alt+;`: Clear session memory

## Configuration Options

### API Key Management
- Secure password field for API key input
- Connection testing functionality
- Status indicators for configuration
- Automatic fallback to mock responses if API fails

### Model Settings
- **Model**: gemini-1.5-flash (latest and fastest)
- **Context Window**: Large context for comprehensive responses
- **Response Format**: Markdown formatting for readability

## Error Handling

### API Key Issues
- Graceful fallback to mock responses
- Clear error messages for configuration problems
- Connection testing to verify API key validity

### Network Issues
- Automatic retry logic
- Fallback responses for offline scenarios
- Session memory logging of all attempts

### Content Processing
- Handles various content types appropriately
- Provides structured responses even for unclear content
- Maintains context across multiple interactions

## Best Practices

### 1. **API Key Security**
- Never share your API key
- Use environment variables for production
- Regularly rotate API keys

### 2. **Content Quality**
- Ensure clear, readable screenshots
- Use high contrast for better OCR
- Avoid blurry or low-resolution images

### 3. **Skill Selection**
- Select appropriate skill before taking screenshots
- Context matters for better responses
- Use general skill for mixed content

### 4. **Session Management**
- Review session history for context
- Clear session memory when starting new topics
- Use session focus to understand workflow patterns

## Troubleshooting

### Common Issues

1. **"API key not configured"**
   - Press `Alt+G` to open configuration
   - Enter your API key from Google AI Studio
   - Test the connection

2. **"Connection test failed"**
   - Check your internet connection
   - Verify API key is correct
   - Ensure API key has proper permissions

3. **Poor OCR results**
   - Improve screenshot quality
   - Use higher resolution
   - Ensure good contrast

4. **Irrelevant responses**
   - Select appropriate skill before screenshot
   - Check session context
   - Clear session memory if needed

### Debug Information
- Check console logs for detailed error messages
- Session memory logs all interactions
- Use connection test to verify API status

## Advanced Features

### 1. **Context Awareness**
- Uses session memory for better responses
- Maintains conversation context
- Adapts responses based on user workflow

### 2. **Structured Output**
- Markdown formatting for readability
- Clear headings and sections
- Code blocks with syntax highlighting
- Bullet points and numbered lists

### 3. **Multi-Modal Support**
- Text-based OCR processing
- Contextual analysis of content
- Skill-specific formatting
- Comprehensive response generation

## Future Enhancements

- Image analysis capabilities
- Multi-language support
- Custom skill definitions
- Response customization options
- Advanced prompt engineering
- Integration with other AI models

## Support

For issues with:
- **Wysper App**: Check console logs and session memory
- **Gemini API**: Visit [Google AI Studio Support](https://ai.google.dev/support)
- **API Key Issues**: Verify key permissions and quotas

## Privacy and Security

- API keys are stored locally only
- No data is transmitted except to Google's API
- OCR files are automatically deleted
- Session data is stored in memory only
- No persistent storage of sensitive information 