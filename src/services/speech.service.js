const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const config = require('../core/config');

class SpeechService extends EventEmitter {
  constructor() {
    super();
    this.recognizer = null;
    this.isRecording = false;
    this.audioConfig = null;
    this.speechConfig = null;
    this.sessionStartTime = null;
    
    this.initializeClient();
  }

  initializeClient() {
    const subscriptionKey = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    
    if (!subscriptionKey || !region) {
      const error = 'Azure Speech credentials missing. Configure AZURE_SPEECH_KEY and AZURE_SPEECH_REGION';
      logger.error('Speech service initialization failed', { reason: 'missing_credentials' });
      this.emit('error', error);
      return;
    }

    try {
      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      this.configureSpeechSettings();
      
      logger.info('Azure Speech service initialized successfully', {
        region,
        language: config.get('speech.azure.language')
      });
      
      this.emit('status', 'Azure Speech Services ready');
    } catch (error) {
      logger.error('Failed to initialize Azure Speech client', { error: error.message });
      this.emit('error', `Speech recognition unavailable: ${error.message}`);
    }
  }

  configureSpeechSettings() {
    const azureConfig = config.get('speech.azure');
    
    this.speechConfig.speechRecognitionLanguage = azureConfig.language;
    this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
    
    if (azureConfig.enableDictation) {
      this.speechConfig.enableDictation();
    }
    
    if (azureConfig.enableAudioLogging) {
      this.speechConfig.enableAudioLogging();
    }
  }

  startRecording() {
    if (!this.speechConfig) {
      this.emit('error', 'Speech service not initialized');
      return;
    }

    if (this.isRecording) {
      logger.warn('Recording already in progress');
      return;
    }

    this.sessionStartTime = Date.now();
    
    try {
      this.setupRecognizer();
      this.startContinuousRecognition();
    } catch (error) {
      logger.error('Failed to start recording session', { error: error.message });
      this.emit('error', `Recording startup failed: ${error.message}`);
      this.isRecording = false;
    }
  }

  setupRecognizer() {
    this.audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
    
    this.recognizer.recognizing = (sender, event) => {
      if (event.result.reason === sdk.ResultReason.RecognizingSpeech) {
        logger.debug('Interim transcription received', { 
          text: event.result.text,
          confidence: event.result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)
        });
        this.emit('interim-transcription', event.result.text);
      }
    };

    this.recognizer.recognized = (sender, event) => {
      if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const sessionDuration = Date.now() - this.sessionStartTime;
        
        logger.info('Final transcription received', {
          text: event.result.text,
          sessionDuration: `${sessionDuration}ms`,
          textLength: event.result.text.length
        });
        
        this.emit('transcription', event.result.text);
      } else if (event.result.reason === sdk.ResultReason.NoMatch) {
        logger.debug('No speech pattern detected in audio');
      }
    };

    this.recognizer.canceled = (sender, event) => {
      logger.warn('Recognition session canceled', { 
        reason: event.reason,
        errorDetails: event.errorDetails 
      });
      
      if (event.reason === sdk.CancellationReason.Error) {
        this.emit('error', `Recognition error: ${event.errorDetails}`);
      }
      
      this.stopRecording();
    };

    this.recognizer.sessionStopped = () => {
      logger.info('Recognition session ended');
      this.stopRecording();
    };
  }

  startContinuousRecognition() {
    this.recognizer.startContinuousRecognitionAsync(
      () => {
        this.isRecording = true;
        logger.info('Continuous speech recognition started');
        this.emit('recording-started');
        this.emit('status', 'Recording started - speak now');
        if (global.windowManager) {
          global.windowManager.handleRecordingStarted();
        }
      },
      (error) => {
        logger.error('Failed to start continuous recognition', { error });
        this.emit('error', `Recognition startup failed: ${error}`);
        this.isRecording = false;
      }
    );
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    
    logger.info('Stopping speech recognition session', { 
      sessionDuration: `${sessionDuration}ms` 
    });

    if (this.recognizer) {
      this.recognizer.stopContinuousRecognitionAsync(
        () => {
          logger.info('Speech recognition stopped successfully');
          this.emit('recording-stopped');
          this.emit('status', 'Recording stopped');
          if (global.windowManager) {
            global.windowManager.handleRecordingStopped();
          }
        },
        (error) => {
          logger.error('Error during recognition stop', { error });
        }
      );
      
      this.cleanupRecognizer();
    }
  }

  cleanupRecognizer() {
    if (this.recognizer) {
      this.recognizer.close();
      this.recognizer = null;
    }
    
    if (this.audioConfig) {
      this.audioConfig.close();
      this.audioConfig = null;
    }
  }

  async recognizeFromFile(audioFilePath) {
    if (!this.speechConfig) {
      throw new Error('Speech service not initialized');
    }

    const startTime = Date.now();
    
    try {
      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      const result = await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              resolve(result.text);
            } else {
              reject(new Error(`File recognition failed: ${result.reason}`));
            }
            recognizer.close();
          },
          (error) => {
            reject(error);
            recognizer.close();
          }
        );
      });

      logger.logPerformance('File speech recognition', startTime, {
        filePath: audioFilePath,
        textLength: result.length
      });

      return result;
    } catch (error) {
      logger.error('File recognition failed', { 
        filePath: audioFilePath, 
        error: error.message 
      });
      throw error;
    }
  }

  getStatus() {
    return {
      isRecording: this.isRecording,
      isInitialized: !!this.speechConfig,
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      config: config.get('speech.azure')
    };
  }
}

module.exports = new SpeechService(); 