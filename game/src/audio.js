// Procedural sound: one WebAudio graph, no audio assets. A shared noise
// buffer and a few tiny synth helpers cover shots, reload clicks, hits,
// the bomb beeper and the round stingers. Everything is best-effort: if the
// browser has no audio (headless captures), the game still plays.
export function createAudio() {
  let context = null;
  let noiseBuffer = null;
  let master = null;

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!ensure() || context.state === 'suspended') return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, filterFreq, gain) {
    if (!ensure() || context.state === 'suspended') return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + dur);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(now);
    source.stop(now + dur + 0.02);
  }

  return {
    unlock() { ensure(); },
    shot() { noise(0.12, 1800, 0.9); tone(160, 0.08, 'square', 0.25, 60); },
    enemyShot() { noise(0.1, 1200, 0.35); },
    dry() { tone(1200, 0.03, 'square', 0.15); },
    reload() { tone(700, 0.05, 'square', 0.2); setTimeout(() => tone(900, 0.05, 'square', 0.2), 350); },
    hit() { tone(1900, 0.06, 'sine', 0.4); },
    kill() { tone(880, 0.09, 'sine', 0.4); setTimeout(() => tone(1320, 0.12, 'sine', 0.4), 90); },
    hurt() { tone(140, 0.15, 'sawtooth', 0.3, 70); },
    explosion() { noise(0.7, 500, 1.2); tone(60, 0.6, 'sine', 0.8, 30); },
    beep(fast) { tone(fast ? 1400 : 1000, 0.07, 'sine', 0.35); },
    plant() { tone(520, 0.15, 'sine', 0.35); setTimeout(() => tone(780, 0.2, 'sine', 0.35), 140); },
    win() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.35), i * 130)); },
    lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.3), i * 150)); },
  };
}
