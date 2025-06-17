# Microsoft Azure Speech Services Setup Guide

This guide will help you set up Microsoft Azure Speech Services for the Wysper app.

## Prerequisites

1. A Microsoft Azure account (you can create one for free at [azure.microsoft.com](https://azure.microsoft.com))
2. Node.js and npm installed on your system

## Step 1: Create Azure Speech Resource

1. **Sign in to Azure Portal**
   - Go to [portal.azure.com](https://portal.azure.com)
   - Sign in with your Microsoft account

2. **Create Speech Resource**
   - Click "Create a resource - Wysper speech"
   - Search for "Speech service"
   - Select "Speech service" from the results
   - Click "Create"

3. **Configure Speech Resource**
   - **Subscription**: Choose your subscription
   - **Resource group**: Create new or use existing
   - **Region**: Choose a region close to you (e.g., "East US", "West Europe")
   - **Name**: Give your resource a unique name (e.g., "wysper-speech")
   - **Pricing tier**: Choose "Free (F0)" for testing or "Standard (S0)" for production
   - Click "Review + create" then "Create"

4. **Get Your Credentials**
   - Once deployment is complete, go to your Speech resource
   - In the left menu, click "Keys and Endpoint under Rescource Management"
   - Copy **Key 1** and **Region** (you'll need these for environment variables)

## Step 2: Set Environment Variables

You need to set two environment variables for the app to work:

### Option A: Create a `.env` file (Recommended)

Create a `.env` file in your project root:

```bash
# Azure Speech Services Configuration
AZURE_SPEECH_KEY=your_azure_speech_key_here
AZURE_SPEECH_REGION=your_azure_region_here
```

### Option B: Set in your shell

For macOS/Linux:
```bash
export AZURE_SPEECH_KEY="your_azure_speech_key_here"
export AZURE_SPEECH_REGION="your_azure_region_here"
```

For Windows:
```cmd
set AZURE_SPEECH_KEY=your_azure_speech_key_here
set AZURE_SPEECH_REGION=your_azure_region_here
```

### Option C: Set in your shell profile

Add to your `~/.zshrc` or `~/.bash_profile`:
```bash
export AZURE_SPEECH_KEY="your_azure_speech_key_here"
export AZURE_SPEECH_REGION="your_azure_region_here"
```

## Step 3: Install Dependencies

Install the Azure Speech SDK:

```bash
npm install microsoft-cognitiveservices-speech-sdk
```

## Step 4: Test the Setup

1. **Start the app**:
   ```bash
   npm run dev
   ```

2. **Test speech recognition**:
   - Press `Cmd+R` to start recording
   - Speak into your microphone
   - Press `Cmd+R` again to stop recording
   - Check the console for transcription results

## Troubleshooting

### Common Issues

1. **"Azure Speech credentials not found"**
   - Make sure you've set both `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`
   - Restart your terminal after setting environment variables
   - Check that the `.env` file is in the project root

2. **"Recognition error"**
   - Verify your Azure Speech resource is active
   - Check that you're using the correct region
   - Ensure your microphone permissions are granted to the app

3. **"Failed to start recognition"**
   - Check your internet connection
   - Verify your Azure subscription has sufficient quota
   - Try restarting the app

### Azure Speech Service Limits

- **Free Tier (F0)**:
  - 5 hours of audio per month
  - 20 concurrent requests
  - Limited to 10 minutes per request

- **Standard Tier (S0)**:
  - 250 hours of audio per month
  - 100 concurrent requests
  - No time limit per request

### Cost Management

- Monitor your usage in the Azure Portal
- Set up spending limits and alerts
- Use the free tier for development and testing
- Upgrade to standard tier only when needed

## Advanced Configuration

### Custom Speech Models

If you need better accuracy for specific domains:

1. Go to your Speech resource in Azure Portal
2. Click "Custom Speech" in the left menu
3. Create a custom model with your training data
4. Update the speech configuration in `speech-recognition.js`

### Language Support

To change the recognition language, modify this line in `speech-recognition.js`:

```javascript
this.speechConfig.speechRecognitionLanguage = 'en-US'; // Change to your language
```

Supported languages include:
- `en-US` (English US)
- `en-GB` (English UK)
- `es-ES` (Spanish)
- `fr-FR` (French)
- `de-DE` (German)
- `ja-JP` (Japanese)
- And many more...

### Security Best Practices

1. **Never commit credentials to version control**
2. **Use Azure Key Vault for production deployments**
3. **Implement proper access controls**
4. **Monitor usage and set up alerts**

## Support

- [Azure Speech Services Documentation](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/)
- [Speech SDK Reference](https://docs.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/)
- [Azure Support](https://azure.microsoft.com/en-us/support/) 