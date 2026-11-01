// Fully synthesised sound design (Web Audio). Created on the first click so
// browsers allow playback. Every sound of a flip is scheduled up front against
// the audio clock, so it stays in sync regardless of frame rate.

export class Sound {
  constructor() {
    this.ctx = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // Tap for MediaRecorder.
    this.streamDest = ctx.createMediaStreamDestination();
    comp.connect(this.streamDest);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.4);
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.32;
    this.reverb.connect(this.revGain);
    this.revGain.connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  out(node, wet = 0.2) {
    node.connect(this.master);
    if (wet > 0) {
      const s = this.ctx.createGain();
      s.gain.value = wet;
      node.connect(s);
      s.connect(this.reverb);
    }
  }

  noise(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  env(t, peak, attack, decay, hold = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    if (hold) g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
    return g;
  }

  /** Inharmonic struck-metal partials. */
  metal(t, gain, f0, decayScale = 1, wet = 0.35, muffle = 0) {
    const ctx = this.ctx;
    const ratios = [1, 1.594, 2.136, 2.653, 3.156, 4.06, 5.18];
    const decays = [1.5, 1.1, 0.9, 0.62, 0.48, 0.32, 0.2];
    const gains = [1, 0.7, 0.55, 0.4, 0.3, 0.2, 0.12];
    const bus = ctx.createGain();
    bus.gain.value = gain;
    let last = bus;
    if (muffle > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 9000 - muffle * 7500;
      bus.connect(lp);
      last = lp;
    }
    this.out(last, wet);
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f0 * r * (1 + (Math.random() - 0.5) * 0.004);
      // Slight beating, like a real coin's split modes.
      o.detune.setValueAtTime(0, t);
      o.detune.linearRampToValueAtTime((Math.random() - 0.5) * 6, t + decays[i]);
      const g = this.env(t, gains[i] * 0.22, 0.0015, decays[i] * decayScale);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + decays[i] * decayScale + 0.1);
    });
    // Strike transient.
    const n = this.noise(t, 0.03);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const ng = this.env(t, 0.5, 0.0008, 0.025);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(bus);
  }

  bass(t, gain, from = 120, to = 38, dur = 0.9) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + 0.35);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    const g = this.env(t, gain, 0.004, dur);
    o.connect(shaper);
    shaper.connect(g);
    this.out(g, 0.15);
    o.start(t);
    o.stop(t + dur + 0.1);
    // Low thump body.
    const n = this.noise(t, 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const ng = this.env(t, gain * 0.9, 0.003, 0.18);
    n.connect(lp);
    lp.connect(ng);
    this.out(ng, 0.1);
  }

  whoosh(t, dur, f0, f1, gain, q = 1.1, attack = 0.25) {
    const ctx = this.ctx;
    const n = this.noise(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp);
    bp.connect(g);
    this.out(g, 0.25);
    return g;
  }

  /**
   * Schedule a whole flip.
   * @param plan timeline plan; @param body def; @param spinHz fn(t) spin flutter rate
   */
  schedule(plan, def, spinHz) {
    this.ensure();
    const ctx = this.ctx;
    const T = ctx.currentTime + 0.02;

    // 1. Flick: thumbnail snap + bright ping as the coin leaves.
    {
      const n = this.noise(T, 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 0.9;
      const g = this.env(T, 0.9, 0.001, 0.035);
      n.connect(bp);
      bp.connect(g);
      this.out(g, 0.1);
      this.metal(T + 0.004, 0.32, 3350, 0.5, 0.3);
    }

    // 2. Whoosh with a spin flutter; drops in pitch for the slow motion.
    {
      const dur = plan.tImp + 0.05;
      const n = this.noise(T, dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      const pts = 64;
      const freq = new Float32Array(pts);
      const flut = new Float32Array(pts);
      const amp = new Float32Array(pts);
      for (let i = 0; i < pts; i++) {
        const t = (i / (pts - 1)) * dur;
        const s = plan.timeScaleAt(t);
        freq[i] = 250 + 2600 * Math.pow(s, 1.4);
        flut[i] = Math.max(0.5, spinHz(t));
        const rise = Math.min(1, t / 0.06);
        const fall = 1 - Math.max(0, (t - (plan.tImp - 0.05)) / 0.1);
        amp[i] = Math.max(0.0001, (0.08 + 0.32 * s) * rise * Math.max(0, fall));
      }
      bp.frequency.setValueCurveAtTime(freq, T, dur);
      const g = ctx.createGain();
      g.gain.setValueCurveAtTime(amp, T, dur);
      // Amplitude flutter at the face-flash rate.
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueCurveAtTime(flut, T, dur);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.5;
      const flutterBus = ctx.createGain();
      flutterBus.gain.value = 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(flutterBus.gain);
      n.connect(bp);
      bp.connect(g);
      g.connect(flutterBus);
      this.out(flutterBus, 0.3);
      lfo.start(T);
      lfo.stop(T + dur + 0.05);
      // Deep slow-motion swell.
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(52, T + 0.3);
      o.frequency.linearRampToValueAtTime(41, T + 1.4);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, T + 0.3);
      og.gain.exponentialRampToValueAtTime(0.22, T + 0.7);
      og.gain.exponentialRampToValueAtTime(0.0001, T + 1.6);
      o.connect(og);
      this.out(og, 0.2);
      o.start(T + 0.3);
      o.stop(T + 1.7);
      // Falling whoosh into the landing.
      this.whoosh(T + plan.tImp - 0.55, 0.6, 500, 2400, 0.28, 0.9, 0.85);
    }

    // 3. Landing.
    const tI = T + plan.tImp;
    const special = def.landingSound || 'metal';
    if (special === 'cloud') {
      this.metal(tI, 0.35, 2900, 0.6, 0.45, 0.8);
      this.bass(tI, 0.85, 95, 32, 1.1);
      this.whoosh(tI, 1.2, 900, 160, 0.35, 0.7, 0.08);
    } else {
      this.metal(tI, 1.0, 3050, 1, 0.38);
      this.bass(tI, 1.0);
      this.metal(T + plan.tBounceLand, 0.5, 3120, 0.7, 0.3);
      this.bass(T + plan.tBounceLand, 0.25, 90, 40, 0.4);
    }
    if (special === 'sizzle') {
      const n = this.noise(tI, 2.6);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tI);
      g.gain.exponentialRampToValueAtTime(0.22, tI + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, tI + 2.6);
      n.connect(hp);
      hp.connect(g);
      this.out(g, 0.2);
    }

    // 4. Settling rattle: one tiny strike per half-turn of the rim contact.
    for (const k of plan.ticks) {
      if (k.amp < 0.02) continue;
      this.metal(T + k.t, (special === 'cloud' ? 0.06 : 0.16) * Math.pow(k.amp, 0.7), 3200 + Math.random() * 120, 0.12 + 0.2 * k.amp, 0.2, special === 'cloud' ? 0.8 : 0);
    }
    if (special !== 'cloud') this.metal(T + plan.tRest, 0.12, 3250, 0.35, 0.3);
    return T;
  }
}
