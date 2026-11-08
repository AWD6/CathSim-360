// CathSim 360 - Interactive Audio & Generative Background Music Engine
// Pure Web Audio API: 100% offline, zero latency, cheerful ambiance, no dead air.

let audioCtx: AudioContext | undefined;
let musicGain: GainNode | undefined;
let sfxGain: GainNode | undefined;
let bgTimer: ReturnType<typeof setInterval> | undefined;
let musicOn = true;
let isSpeaking = false;
let stepCounter = 0;

function getContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // Master FX bus
    sfxGain = audioCtx.createGain();
    sfxGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    sfxGain.connect(audioCtx.destination);

    // Master Music bus
    musicGain = audioCtx.createGain();
    musicGain.gain.setValueAtTime(0.22, audioCtx.currentTime);
    musicGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

// Gentle pleasant synth tone (marimba / electric piano bell)
function playMelodyNote(hz: number, time: number, duration: number, volume: number) {
  if (!audioCtx || !musicGain || !musicOn || document.hidden) return;
  try {
    const osc = audioCtx.createOscillator();
    const subOsc = audioCtx.createOscillator();
    const noteGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    // Warm soft timbre
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz, time);

    // Subtle harmonic warmth
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(hz * 2, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(450, time + duration);

    // Soft gentle attack, warm sustain, gentle release
    noteGain.gain.setValueAtTime(0.0001, time);
    noteGain.gain.linearRampToValueAtTime(volume, time + 0.035);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(noteGain);
    subOsc.connect(noteGain);
    noteGain.connect(filter);
    filter.connect(musicGain);

    osc.start(time);
    subOsc.start(time);
    osc.stop(time + duration + 0.05);
    subOsc.stop(time + duration + 0.05);
  } catch {
    // audio fallback
  }
}

// Cheerful chord sequences (Cmaj9 -> Am9 -> Fmaj7 -> Gsus4)
const CHORD_PROGRESSION = [
  // Cmaj9
  { bass: 130.81, notes: [261.63, 329.63, 392.00, 493.88, 587.33] },
  // Am9
  { bass: 110.00, notes: [220.00, 261.63, 329.63, 392.00, 493.88] },
  // Fmaj7
  { bass: 87.31,  notes: [174.61, 261.63, 329.63, 349.23, 440.00] },
  // Gsus4 / G
  { bass: 98.00,  notes: [196.00, 261.63, 293.66, 392.00, 493.88] }
];

function musicTick() {
  if (!audioCtx || audioCtx.state !== 'running' || !musicOn || document.hidden) return;
  const t = audioCtx.currentTime;
  const barIndex = Math.floor(stepCounter / 8) % CHORD_PROGRESSION.length;
  const chord = CHORD_PROGRESSION[barIndex];
  const stepInBar = stepCounter % 8;

  // Root Bass on beat 0 and 4
  if (stepInBar === 0) {
    playMelodyNote(chord.bass, t, 2.2, 0.16);
  } else if (stepInBar === 4) {
    playMelodyNote(chord.bass * 1.5, t, 1.8, 0.12);
  }

  // Sparkling gentle arpeggio patterns
  const arpeggioPattern = [0, 2, 4, 1, 3, 2, 4, 3];
  const noteIdx = arpeggioPattern[stepInBar];
  const pitch = chord.notes[noteIdx];
  playMelodyNote(pitch, t, 0.75, 0.13);

  // Gentle high sparkle every 2 beats
  if (stepInBar % 2 === 0) {
    playMelodyNote(pitch * 2, t + 0.12, 0.45, 0.04);
  }

  stepCounter++;
}

// Start continuous ambient background music
export function startSound() {
  try {
    const ctx = getContext();
    updateMusicGain();
    if (!bgTimer) {
      musicTick();
      bgTimer = setInterval(musicTick, 420); // ~71 BPM, pleasant and cheerful
    }
  } catch {
    // audio fallback
  }
}

function updateMusicGain() {
  if (!audioCtx || !musicGain) return;
  const now = audioCtx.currentTime;
  // Duck during nurse narration so speech is crystal clear, swell when listening
  const targetGain = !musicOn ? 0 : (isSpeaking ? 0.06 : 0.22);
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setTargetAtTime(targetGain, now, 0.25);
}

// Smoothly duck music when nurse is speaking
export function duckMusic(speaking: boolean) {
  isSpeaking = speaking;
  updateMusicGain();
}

// Toggle background music on/off
export function musicEnabled(enabled: boolean) {
  musicOn = enabled;
  if (enabled) {
    startSound();
  }
  updateMusicGain();
}

// Crisp, rewarding success chime when clicking "✓ ทำแล้ว · ไปขั้นต่อไป"
export function successSound() {
  try {
    const ctx = getContext();
    if (!sfxGain) return;
    const now = ctx.currentTime;

    // Sparkling 4-tone triumphant upward arpeggio with shimmering chime
    const notes = [
      { hz: 523.25, time: 0.00, dur: 0.35, vol: 0.45 }, // C5
      { hz: 659.25, time: 0.08, dur: 0.38, vol: 0.48 }, // E5
      { hz: 783.99, time: 0.16, dur: 0.42, vol: 0.52 }, // G5
      { hz: 1046.50, time: 0.24, dur: 0.75, vol: 0.60 }, // C6 (Bright finish)
      { hz: 2093.00, time: 0.25, dur: 0.85, vol: 0.18 }  // Shimmer sparkle (C7)
    ];

    notes.forEach(({ hz, time, dur, vol }) => {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hz, now + time);

      // Bell sparkle harmonic
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(hz * 2.01, now + time);

      gain.gain.setValueAtTime(0.0001, now + time);
      gain.gain.linearRampToValueAtTime(vol, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(sfxGain!);

      osc.start(now + time);
      osc2.start(now + time);
      osc.stop(now + time + dur + 0.05);
      osc2.stop(now + time + dur + 0.05);
    });
  } catch {
    // audio fallback
  }
}

// Stop all audio on page hide/destroy
export function stopSound() {
  if (bgTimer) {
    clearInterval(bgTimer);
    bgTimer = undefined;
  }
  if (audioCtx && audioCtx.state === 'running') {
    void audioCtx.suspend();
  }
}
