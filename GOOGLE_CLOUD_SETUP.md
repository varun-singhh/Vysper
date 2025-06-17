# Google Cloud Speech API Setup

To use the speech recognition feature, you need to set up Google Cloud Speech API credentials.

## Prerequisites

1. **Google Cloud Account**: You need a Google Cloud account
2. **Google Cloud Project**: Create a new project or use an existing one
3. **Billing**: Enable billing for your project (Speech API has usage costs)

## Setup Steps

### 1. Enable Speech API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to "APIs & Services" > "Library"
4. Search for "Cloud Speech-to-Text API"
5. Click on it and press "Enable"

### 2. Create Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the details:
   - **Name**: `wysper-speech-recognition`
   - **Description**: `Service account for Wysper speech recognition`
4. Click "Create and Continue"
5. For "Role", select "Cloud Speech-to-Text User"
6. Click "Continue" and then "Done"

### 3. Download JSON Key

1. In the Credentials page, find your service account
2. Click on the service account name
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Choose "JSON" format
6. Click "Create" - this will download a JSON file

### 4. Set Environment Variable

Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to point to your JSON key file:

#### macOS/Linux:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
```

#### Windows:
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your\service-account-key.json
```

### 5. Add to .env file (Optional)

Create a `.env` file in the project root:
```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
```

## Usage

Once set up, the speech recognition will work automatically when you:
1. Press `⌘+R` to start recording
2. Speak into your microphone
3. Press `⌘+R` again to stop recording

## Pricing

Google Cloud Speech-to-Text API has usage-based pricing:
- **Standard models**: $0.006 per 15 seconds
- **Enhanced models**: $0.009 per 15 seconds

For more details, see [Google Cloud Speech-to-Text Pricing](https://cloud.google.com/speech-to-text/pricing).

## Troubleshooting

### "Speech recognition not available" error
- Check that your JSON key file path is correct
- Verify the service account has the correct permissions
- Ensure billing is enabled for your project

### "Permission denied" error
- Make sure the service account has "Cloud Speech-to-Text User" role
- Check that the Speech API is enabled in your project

### Microphone not working
- Check system microphone permissions
- Ensure your microphone is working in other applications
- Try restarting the application

## Alternative: Use Fallback Mode

If you don't want to use Google Cloud Speech API, the application includes a fallback mode that records audio without transcription. You can implement your own speech-to-text solution or use other services. 