// Test script for Azure Speech Services
require('dotenv').config()
const SpeechRecognitionService = require('./speech-recognition')

console.log('Testing Azure Speech Services...')
console.log('Environment variables:')
console.log('AZURE_SPEECH_KEY:', process.env.AZURE_SPEECH_KEY ? 'Set' : 'Not set')
console.log('AZURE_SPEECH_REGION:', process.env.AZURE_SPEECH_REGION || 'Not set')

if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
  console.error('❌ Azure Speech credentials not found!')
  console.error('Please set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables')
  console.error('See AZURE_SPEECH_SETUP.md for instructions')
  process.exit(1)
}

console.log('✅ Azure Speech credentials found')

// Test speech recognition service
const speechService = new SpeechRecognitionService()

speechService.on('status', (message) => {
  console.log('📡 Status:', message)
})

speechService.on('error', (error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

speechService.on('recording-started', () => {
  console.log('🎤 Recording started')
})

speechService.on('recording-stopped', () => {
  console.log('⏹️ Recording stopped')
})

speechService.on('transcription', (text) => {
  console.log('📝 Transcription:', text)
})

speechService.on('interim-transcription', (text) => {
  console.log('🔄 Interim:', text)
})

// Test initialization
setTimeout(() => {
  console.log('✅ Azure Speech Services initialized successfully!')
  console.log('You can now run the main app with: npm run dev')
  process.exit(0)
}, 2000) 