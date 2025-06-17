const sdk = require('microsoft-cognitiveservices-speech-sdk');
const recorder = require('node-record-lpcm16');
const { EventEmitter } = require('events');

class SpeechRecognitionService extends EventEmitter {
  constructor() {
    super();
    this.recognizer = null;
    this.recording = false;
    this.recordingStream = null;
    this.audioConfig = null;
    this.speechConfig = null;
    
    this.initializeClient();
  }

  initializeClient() {
    try {
      // Get Azure Speech credentials from environment variables
      const subscriptionKey = process.env.AZURE_SPEECH_KEY;
      const region = process.env.AZURE_SPEECH_REGION;
      
      if (!subscriptionKey || !region) {
        throw new Error('Azure Speech credentials not found. Please set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables.');
      }

      // Initialize Azure Speech configuration
      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      
      // Configure speech recognition settings
      this.speechConfig.speechRecognitionLanguage = 'en-US';
      this.speechConfig.enableDictation();
      this.speechConfig.enableAudioLogging();
      
      // Use detailed recognition results
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      
      console.log('Azure Speech recognition client initialized');
      this.emit('status', 'Azure Speech Services ready');
      
    } catch (error) {
      console.error('Failed to initialize Azure Speech client:', error);
      this.emit('error', `Azure Speech recognition not available: ${error.message}`);
    }
  }

  startRecording() {
    if (!this.speechConfig) {
      this.emit('error', 'Azure Speech client not initialized');
      return;
    }

    if (this.recording) {
      console.log('Already recording');
      return;
    }

    try {
      this.recording = true;
      this.emit('recording-started');

      // Create audio configuration for microphone input
      this.audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      
      // Create speech recognizer
      this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);

      // Set up event handlers
      this.recognizer.recognizing = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
          console.log('Interim transcription:', e.result.text);
          this.emit('interim-transcription', e.result.text);
        }
      };

      this.recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          console.log('Final transcription:', e.result.text);
          this.emit('transcription', e.result.text);
        } else if (e.result.reason === sdk.ResultReason.NoMatch) {
          console.log('No speech detected');
        }
      };

      this.recognizer.canceled = (s, e) => {
        console.log('Recognition canceled:', e.reason);
        if (e.reason === sdk.CancellationReason.Error) {
          console.error('Recognition error:', e.errorDetails);
          this.emit('error', `Recognition error: ${e.errorDetails}`);
        }
        this.stopRecording();
      };

      this.recognizer.sessionStopped = (s, e) => {
        console.log('Recognition session stopped');
        this.stopRecording();
      };

      // Start continuous recognition
      this.recognizer.startContinuousRecognitionAsync(
        () => {
          console.log('Azure Speech recognition started');
          this.emit('status', 'Recording started - speak now!');
        },
        (error) => {
          console.error('Failed to start recognition:', error);
          this.emit('error', `Failed to start recognition: ${error}`);
          this.recording = false;
        }
      );

    } catch (error) {
      console.error('Failed to start recording:', error);
      this.emit('error', `Failed to start recording: ${error.message}`);
      this.recording = false;
    }
  }

  stopRecording() {
    if (!this.recording) {
      return;
    }

    this.recording = false;
    console.log('Stopping Azure Speech recognition...');

    // Stop continuous recognition
    if (this.recognizer) {
      this.recognizer.stopContinuousRecognitionAsync(
        () => {
          console.log('Azure Speech recognition stopped');
          this.emit('recording-stopped');
          this.emit('status', 'Recording stopped');
        },
        (error) => {
          console.error('Error stopping recognition:', error);
        }
      );
      
      // Clean up recognizer
      this.recognizer.close();
      this.recognizer = null;
    }

    // Clean up audio config
    if (this.audioConfig) {
      this.audioConfig.close();
      this.audioConfig = null;
    }
  }

  isRecording() {
    return this.recording;
  }

  // Alternative method using file-based recognition (for testing)
  async recognizeFromFile(audioFilePath) {
    if (!this.speechConfig) {
      throw new Error('Azure Speech client not initialized');
    }

    try {
      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              resolve(result.text);
            } else {
              reject(new Error(`Recognition failed: ${result.reason}`));
            }
            recognizer.close();
          },
          (error) => {
            reject(error);
            recognizer.close();
          }
        );
      });
    } catch (error) {
      throw new Error(`File recognition failed: ${error.message}`);
    }
  }

  // Method to get available voices (for text-to-speech if needed later)
  async getAvailableVoices() {
    if (!this.speechConfig) {
      throw new Error('Azure Speech client not initialized');
    }

    try {
      const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig);
      
      return new Promise((resolve, reject) => {
        synthesizer.getVoicesAsync(
          (result) => {
            resolve(result.voices);
            synthesizer.close();
          },
          (error) => {
            reject(error);
            synthesizer.close();
          }
        );
      });
    } catch (error) {
      throw new Error(`Failed to get voices: ${error.message}`);
    }
  }
}

module.exports = SpeechRecognitionService; 