// --- AUDIO CONTEXT (Retro Noise Pop) ---
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

export function playPopSound() {
  if (audioContext.state === 'suspended') audioContext.resume();
  const noiseSource = audioContext.createBufferSource();
  const bandpass = audioContext.createBiquadFilter();
  const gainNode = audioContext.createGain();
  const now = audioContext.currentTime;

  const sampleRate = audioContext.sampleRate;
  const bufferSize = sampleRate * 0.15;
  const noiseBuffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  noiseSource.buffer = noiseBuffer;

  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(3000, now);
  bandpass.Q.setValueAtTime(1.2, now);

  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.8, now + 0.002);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  noiseSource.connect(bandpass);
  bandpass.connect(gainNode);
  gainNode.connect(audioContext.destination);
  noiseSource.start(0);
}

export function playWhooshSound() {
  if (audioContext.state === 'suspended') audioContext.resume();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(800, now);
  oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.1);
  gainNode.gain.setValueAtTime(0.3, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(0);
  oscillator.stop(now + 0.1);
}
