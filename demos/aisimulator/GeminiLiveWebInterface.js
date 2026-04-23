import {GoogleGenAI, Modality} from '@google/genai';

export class GeminiLiveWebInterface {
  constructor(apiKey) {
    this.ai = new GoogleGenAI({apiKey: apiKey});
    this.model = 'gemini-3.1-flash-live-preview';
    this.config = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Aoede'}}},
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    };

    // Session and state management
    this.session = null;
    this.isRecording = false;
    this.isCapturingScreen = false;
    this.isGeminiSpeaking = false;
    this.lastAudioChunkReceived = 0;
    this.audioFinalizationTimeout = null;

    // Web Audio API setup
    this.audioContext = null;
    this.audioWorkletNode = null;
    this.mediaStream = null;
    this.mediaStreamSource = null;

    // Screen capture
    this.screenshotInterval = null;
    this.screenshotIntervalMs = 3000;
    this.displayStream = null;
    this.displayVideo = null;

    // Audio playback
    this.audioQueue = [];
    this.isPlayingAudio = false;

    this.currentInputText = '';
    this.currentOutputText = '';
    this.currentInputId = null;
    this.currentOutputId = null;
    this.conversationHistory = [];
    this.isSynthesizing = false;

    // Callbacks
    this.onTranscription = null;
    this.onError = null;
    this.onSessionStateChange = null;
  }

  async initialize() {
    try {
      console.log('Initializing Web Audio Context...');
      this.audioContext = new AudioContext({sampleRate: 16000});

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      console.log('✅ Web Audio Context initialized');

      const micPermission = await this.requestMicrophonePermission();
      if (!micPermission) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize audio context:', error);
      if (this.onError) this.onError(error);
      return false;
    }
  }

  async requestMicrophonePermission() {
    try {
      console.log('🎤 Requesting microphone access...');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      return true;
    } catch (error) {
      console.error('❌ Failed to get microphone access:', error);
      if (this.onError) this.onError(error);
      return false;
    }
  }

  async startSession() {
    if (this.session) {
      console.log('Session already active');
      return;
    }

    console.log('Connecting to Gemini Live...');

    try {
      this.session = await this.ai.live.connect({
        model: this.model,
        callbacks: {
          onopen: () => {
            console.log('✅ Session opened successfully');
            if (this.onSessionStateChange)
              this.onSessionStateChange('connected');
            this.startAudioRecording();
            this.startScreenCapture();
          },
          onmessage: (message) => {
            this.processMessageStream(message);
          },
          onerror: (e) => {
            console.error('❌ Session error:', e.message);
            if (this.onError) this.onError(e);
          },
          onclose: (e) => {
            console.log('🔒 Session closed:', e.reason);
            if (this.onSessionStateChange)
              this.onSessionStateChange('disconnected');
            this.cleanup();
          },
        },
        config: this.config,
      });
    } catch (error) {
      console.error('❌ Failed to connect to Gemini Live:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  processMessageStream(message) {
    try {
      if (message.data) {
        this.isGeminiSpeaking = true;
        this.lastAudioChunkReceived = Date.now();

        if (this.audioFinalizationTimeout) {
          clearTimeout(this.audioFinalizationTimeout);
        }

        this.playAudioChunk(message.data);

        this.audioFinalizationTimeout = setTimeout(() => {
          console.log('🔄 No more audio chunks received, allowing screenshots');
          this.isGeminiSpeaking = false;
        }, 1000);
      }

      if (message.serverContent) {
        if (message.serverContent.inputTranscription) {
          this.handleInputTranscription(
            message.serverContent.inputTranscription
          );
        }

        if (message.serverContent.outputTranscription) {
          this.handleOutputTranscription(
            message.serverContent.outputTranscription
          );
        }

        if (message.serverContent.turnComplete) {
          this.handleTurnComplete();
        }
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
      if (this.onError) this.onError(error);
    }
  }

  handleInputTranscription(transcription) {
    const text = transcription.text;
    if (!text) return;
    this.currentInputText += text;
    if (this.onTranscription) {
      if (this.currentInputId === null) {
        this.currentInputId = this.generateId();
        this.onTranscription({
          type: 'input',
          text: this.currentInputText,
          id: this.currentInputId,
          isPartial: true,
          action: 'create',
        });
      } else {
        this.onTranscription({
          type: 'input',
          text: this.currentInputText,
          id: this.currentInputId,
          isPartial: true,
          action: 'update',
        });
      }
    }
  }

  handleOutputTranscription(transcription) {
    const text = transcription.text;
    if (!text) return;
    this.currentOutputText += text;
    if (this.onTranscription) {
      if (this.currentOutputId === null) {
        this.currentOutputId = this.generateId();
        this.onTranscription({
          type: 'output',
          text: this.currentOutputText,
          id: this.currentOutputId,
          isPartial: true,
          action: 'create',
        });
      } else {
        this.onTranscription({
          type: 'output',
          text: this.currentOutputText,
          id: this.currentOutputId,
          isPartial: true,
          action: 'update',
        });
      }
    }
  }

  handleTurnComplete() {
    if (this.currentInputId !== null && this.currentInputText.trim()) {
      if (this.onTranscription) {
        this.onTranscription({
          type: 'input',
          text: this.currentInputText.trim(),
          id: this.currentInputId,
          isPartial: false,
          action: 'finalize',
        });
      }

      this.conversationHistory.push({
        type: 'input',
        text: this.currentInputText.trim(),
        timestamp: new Date(),
        id: this.currentInputId,
      });
    }

    if (this.currentOutputId !== null && this.currentOutputText.trim()) {
      if (this.onTranscription) {
        this.onTranscription({
          type: 'output',
          text: this.currentOutputText.trim(),
          id: this.currentOutputId,
          isPartial: false,
          action: 'finalize',
        });
      }

      this.conversationHistory.push({
        type: 'output',
        text: this.currentOutputText.trim(),
        timestamp: new Date(),
        id: this.currentOutputId,
      });
    }

    if (this.onTranscription) {
      this.onTranscription({type: 'turnComplete'});
    }
    this.currentInputText = '';
    this.currentOutputText = '';
    this.currentInputId = null;
    this.currentOutputId = null;
  }

  generateId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getConversationHistory() {
    return this.conversationHistory;
  }

  clearConversationHistory() {
    this.conversationHistory = [];
  }

  async startAudioRecording() {
    if (this.isRecording) {
      console.log('🎤 Recording already active');
      return;
    }

    try {
      if (!this.mediaStream) {
        const micPermission = await this.requestMicrophonePermission();
        if (!micPermission) {
          return;
        }
      }

      this.mediaStreamSource = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );

      // Create audio worklet for processing
      await this.createAudioWorklet();

      this.isRecording = true;
      console.log('✅ Audio recording started');
    } catch (error) {
      console.error('❌ Failed to start audio recording:', error);
      if (this.onError) this.onError(error);
    }
  }

  async createAudioWorklet() {
    const bufferSize = 4096;
    const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    processor.onaudioprocess = (event) => {
      if (!this.isRecording || !this.session || this.isSynthesizing) return;

      const inputBuffer = event.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);

      // Convert Float32Array to Int16Array (PCM 16-bit)
      const int16Array = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      const base64Audio = this.arrayBufferToBase64(int16Array.buffer);
      try {
        this.session.sendRealtimeInput({
          audio: {data: base64Audio, mimeType: 'audio/pcm;rate=16000'},
        });
      } catch (error) {
        console.error('❌ Error sending audio:', error);
      }
    };
    this.mediaStreamSource.connect(processor);
    processor.connect(this.audioContext.destination);
    this.audioWorkletNode = processor;
  }

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  sendRealtimeText(text) {
    if (!this.session || !text || !text.trim()) return;
    try {
      this.session.sendRealtimeInput({
        text: text,
      });
    } catch (error) {
      console.error('❌ Error sending text:', error);
    }
  }

  async playAudioChunk(audioData) {
    try {
      const arrayBuffer = this.base64ToArrayBuffer(audioData);
      const audioBuffer = this.audioContext.createBuffer(
        1,
        arrayBuffer.byteLength / 2,
        24000
      );
      const channelData = audioBuffer.getChannelData(0);
      const int16View = new Int16Array(arrayBuffer);
      for (let i = 0; i < int16View.length; i++) {
        channelData[i] = int16View[i] / 32768.0;
      }

      this.audioQueue.push(audioBuffer);

      if (!this.isPlayingAudio) {
        this.playNextAudioBuffer();
      }
    } catch (error) {
      console.error('❌ Error playing audio chunk:', error);
    }
  }

  playNextAudioBuffer() {
    if (this.audioQueue.length === 0) {
      this.isPlayingAudio = false;
      return;
    }

    this.isPlayingAudio = true;
    const audioBuffer = this.audioQueue.shift();
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    source.onended = () => {
      this.playNextAudioBuffer();
    };

    source.start();
  }

  async startScreenCapture() {
    if (this.isCapturingScreen) {
      console.log('📸 Screen capture already running');
      return;
    }

    try {
      console.log('📸 Starting screen capture...');

      await this.setupPersistentScreenCapture();
      this.isCapturingScreen = true;
      const captureScreenshot = async () => {
        try {
          if (this.isGeminiSpeaking) return;

          if (
            this.displayVideo &&
            this.displayVideo.readyState === this.displayVideo.HAVE_ENOUGH_DATA
          ) {
            await this.captureFromPersistentStream();
          } else {
            console.warn('⚠️ Display video not ready, using canvas fallback');
            await this.captureViaCanvas();
          }
        } catch (error) {
          console.error('❌ Error capturing screenshot:', error);
        }
      };

      await captureScreenshot();
      this.screenshotInterval = setInterval(
        captureScreenshot,
        this.screenshotIntervalMs
      );
      console.log(
        `✅ Screen capture started with ${this.screenshotIntervalMs}ms interval`
      );
    } catch (error) {
      console.error('❌ Failed to start screen capture:', error);
      if (this.onError) this.onError(error);
    }
  }

  async setupPersistentScreenCapture() {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        console.log('📸 Requesting screen capture permission...');
        console.log(
          '📸 Please select "Entire Screen" or a specific application for best results'
        );

        this.displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: {ideal: 1920, max: 1920},
            height: {ideal: 1080, max: 1080},
            frameRate: {ideal: 5, max: 10},
          },
          audio: false,
          // Request entire screen or application sharing
          displaySurface: 'monitor',
        });

        // Create video element to display the stream
        this.displayVideo = document.createElement('video');
        this.displayVideo.srcObject = this.displayStream;
        this.displayVideo.autoplay = true;
        this.displayVideo.muted = true;
        this.displayVideo.playsInline = true;

        // Make video element visible for debugging (you can remove this line
        // later)
        this.displayVideo.style.position = 'fixed';
        this.displayVideo.style.top = '10px';
        this.displayVideo.style.right = '10px';
        this.displayVideo.style.width = '200px';
        this.displayVideo.style.height = '112px';
        this.displayVideo.style.border = '2px solid red';
        this.displayVideo.style.zIndex = '9999';
        this.displayVideo.style.backgroundColor = 'black';

        document.body.appendChild(this.displayVideo);

        // Handle stream end (user stops sharing)
        this.displayStream.getVideoTracks()[0].addEventListener('ended', () => {
          console.log('📸 Screen sharing ended by user');
          this.stopScreenCapture();
        });

        // Wait for video to be ready and log details
        await new Promise((resolve) => {
          this.displayVideo.onloadedmetadata = () => {
            console.log('📸 Video metadata loaded:');
            console.log(
              `   - Resolution: ${this.displayVideo.videoWidth}x${
                this.displayVideo.videoHeight
              }`
            );
            console.log(`   - Ready state: ${this.displayVideo.readyState}`);
            console.log(`   - Current time: ${this.displayVideo.currentTime}`);
            resolve();
          };
        });

        // Additional check for video playing
        await new Promise((resolve) => {
          if (this.displayVideo.readyState >= 2) {
            resolve();
          } else {
            this.displayVideo.oncanplay = resolve;
          }
        });

        console.log('✅ Persistent screen capture stream established');
      } else {
        throw new Error('Screen Capture API not available');
      }
    } catch (error) {
      console.error('❌ Failed to setup persistent screen capture:', error);
      if (error.name === 'NotAllowedError') {
        console.error('❌ User denied screen capture permission');
      } else if (error.name === 'NotFoundError') {
        console.error('❌ No screen capture source available');
      } else if (error.name === 'AbortError') {
        console.error('❌ Screen capture setup was aborted');
      }
      throw error;
    }
  }

  async captureFromPersistentStream() {
    try {
      // Check if video is actually playing and has content
      if (!this.displayVideo || this.displayVideo.readyState < 2) {
        console.warn('⚠️ Video not ready for capture');
        return;
      }

      if (
        this.displayVideo.videoWidth === 0 ||
        this.displayVideo.videoHeight === 0
      ) {
        console.warn('⚠️ Video has no dimensions, skipping capture');
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Set canvas size to match video
      canvas.width = this.displayVideo.videoWidth;
      canvas.height = this.displayVideo.videoHeight;

      // Clear canvas with black background first
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw the video frame
      ctx.drawImage(this.displayVideo, 0, 0, canvas.width, canvas.height);

      // Check if the canvas actually has content (not just black)
      const imageData = ctx.getImageData(
        0,
        0,
        Math.min(100, canvas.width),
        Math.min(100, canvas.height)
      );
      const data = imageData.data;
      let hasContent = false;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) {
          hasContent = true;
          break;
        }
      }

      if (!hasContent) {
        console.warn('⚠️ Captured frame appears to be black/empty');
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.error('❌ Failed to create blob from canvas');
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            if (this.session && base64) {
              this.session.sendRealtimeInput({
                video: {data: base64, mimeType: 'image/jpeg'},
              });
              // console.log(`📸 Screenshot sent to Gemini Live (${
              //     base64.length} bytes) - ${canvas.width}x${canvas.height}`);
            }
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.8
      );
    } catch (error) {
      console.error('❌ Error capturing from persistent stream:', error);
      throw error;
    }
  }

  async captureViaCanvas() {
    console.warn('⚠️ Using canvas fallback for screenshot capture');
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // This is a basic fallback - in real implementation you might want to use
      // html2canvas or similar library for better page capture
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.font = '16px Arial';
      ctx.fillText('Page content capture (fallback method)', 20, 50);
      ctx.fillText(`Timestamp: ${new Date().toISOString()}`, 20, 80);
      canvas.toBlob(
        (blob) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            if (this.session) {
              this.session.sendRealtimeInput({
                video: {data: base64, mimeType: 'image/jpeg'},
              });
              console.log(`📸 Fallback screenshot sent to Gemini Live`);
            }
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.8
      );
    } catch (error) {
      console.error('❌ Canvas capture failed:', error);
      throw error;
    }
  }

  stopScreenCapture() {
    if (!this.isCapturingScreen) return;
    this.isCapturingScreen = false;
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }
    if (this.displayStream) {
      this.displayStream.getTracks().forEach((track) => track.stop());
      this.displayStream = null;
    }
    if (this.displayVideo) {
      if (this.displayVideo.parentNode) {
        this.displayVideo.parentNode.removeChild(this.displayVideo);
      }
      this.displayVideo.srcObject = null;
      this.displayVideo = null;
    }

    console.log('✅ Screen capture stopped');
  }

  stopAudioRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    console.log('✅ Audio recording stopped');
  }

  async stopSession() {
    if (!this.session) return;

    console.log('Stopping Gemini Live session...');

    this.stopAudioRecording();
    this.stopScreenCapture();

    if (this.audioFinalizationTimeout) {
      clearTimeout(this.audioFinalizationTimeout);
      this.audioFinalizationTimeout = null;
    }

    this.session.close();
    this.session = null;

    console.log('✅ Session stopped');
  }

  cleanup() {
    this.stopAudioRecording();
    this.stopScreenCapture();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioQueue = [];
    this.isPlayingAudio = false;
    this.session = null;
    this.displayStream = null;
    this.displayVideo = null;
  }

  setScreenCaptureInterval(intervalMs) {
    this.screenshotIntervalMs = intervalMs;
  }

  setCallbacks(callbacks) {
    this.onTranscription = callbacks.onTranscription || null;
    this.onError = callbacks.onError || null;
    this.onSessionStateChange = callbacks.onSessionStateChange || null;
  }

  isConnected() {
    return this.session !== null;
  }

  isRecordingAudio() {
    return this.isRecording;
  }

  isCapturingScreenshots() {
    return this.isCapturingScreen;
  }

  sendAudio(audioData) {
    if (!this.session) {
      console.warn('Cannot send text, session not active');
      return;
    }

    if (audioData) {
      console.log('Sending audio data with text:', audioData.inlineData);
      this.session.sendRealtimeInput({
        audio: {
          data: audioData.inlineData.data,
          mimeType: 'audio/pcm;rate=16000',
        },
      });
    }
  }

  resampleL16(inlineData) {
    // --- 1. Decode Base64 string to 16-bit PCM Audio Samples ---
    const base64String = inlineData.data;
    const binaryString = atob(base64String);
    const originalLength = binaryString.length / 2;
    const originalSamples = new Int16Array(originalLength);

    for (let i = 0; i < originalLength; i++) {
      // Combine two 8-bit bytes into one 16-bit sample (little-endian)
      let byte1 = binaryString.charCodeAt(i * 2);
      let byte2 = binaryString.charCodeAt(i * 2 + 1);
      originalSamples[i] = (byte2 << 8) | byte1;
    }

    // --- 2. Resample the audio data from 24000 Hz to 16000 Hz ---
    const originalRate = 24000;
    const targetRate = 16000;
    const newLength = Math.round(originalLength * (targetRate / originalRate));
    const resampledSamples = new Int16Array(newLength);
    const ratio = (originalLength - 1) / (newLength - 1);

    for (let i = 0; i < newLength; i++) {
      // Use linear interpolation to find the new sample value
      let index = i * ratio;
      let lowerIndex = Math.floor(index);
      let upperIndex = Math.ceil(index);
      let fraction = index - lowerIndex;

      let lowerValue = originalSamples[lowerIndex];
      let upperValue = originalSamples[upperIndex];

      resampledSamples[i] = lowerValue + (upperValue - lowerValue) * fraction;
    }

    // --- 3. Encode the new 16-bit PCM data back to Base64 ---
    const resampledBytes = new Uint8Array(resampledSamples.buffer);
    let newBinaryString = '';
    for (let i = 0; i < resampledBytes.length; i++) {
      newBinaryString += String.fromCharCode(resampledBytes[i]);
    }
    const newBase64String = btoa(newBinaryString);

    // --- 4. Return the new inlineData object ---
    return {
      inlineData: {
        data: newBase64String,
        mimeType: 'audio/L16;codec=pcm;rate=16000',
      },
    };
  }

  async generateSpeech(text) {
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{parts: [{text: `Say cheerfully: ${text}`}]}],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {voiceName: 'Kore'},
          },
        },
      },
    });
    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const resampledData = this.resampleL16(data);
    return resampledData;
  }
}
