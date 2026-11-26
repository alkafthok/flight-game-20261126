// Procedural WebAudio only: engine hum tied to throttle, wind noise tied
// to speed, and a short chime when a ring is threaded. No audio files.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
  }

  // Must be called from a user gesture (the Start button) in real browsers.
  // Guarded: headless or audio-less environments must not break the game.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    // Engine: a sawtooth plus a sub-octave square, through a lowpass.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 620;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc.start();
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'square';
    this.subOsc.frequency.value = 26;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    this.subOsc.connect(subGain);
    subGain.connect(this.engineFilter);
    this.subOsc.start();

    // Wind: looped white noise through a bandpass whose pitch follows speed.
    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    noise.start();
    } catch (err) {
      // No audio in this environment: stay silent, keep flying.
      this.ctx = null;
    }
  }

  update(throttle, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 48 + throttle * 95;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.12);
    this.subOsc.frequency.setTargetAtTime(freq / 2, t, 0.12);
    this.engineGain.gain.setTargetAtTime(0.028 + throttle * 0.055, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(320 + speed * 9, t, 0.2);
    this.windGain.gain.setTargetAtTime(Math.min(0.11, speed * 0.0015), t, 0.25);
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [880, 1174.7, 1568];
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      const gain = this.ctx.createGain();
      const start = t + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.55);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }
}
