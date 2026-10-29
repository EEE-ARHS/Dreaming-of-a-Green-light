/** All sound is synthesised at runtime: a straight-six idle, wind, and the impact. */
import { AUDIO_CONFIG } from "./audio-constants";

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private readonly pendingCues: { play: () => void; expiresAt: number }[] = [];
  private muted = false;

  get isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.initialize();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async initialize(): Promise<void> {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : AUDIO_CONFIG.masterVolume;
    master.connect(ctx.destination);
    this.master = master;

    // Engine: two detuned saws through a low-pass.
    const engineGain = ctx.createGain();
    engineGain.gain.value = AUDIO_CONFIG.engine.baseGain;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = AUDIO_CONFIG.engine.filterFreq;
    filter.Q.value = AUDIO_CONFIG.engine.filterQ;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = AUDIO_CONFIG.engine.baseFreq;
    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.value = AUDIO_CONFIG.engine.subFreq;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.45;
    sub.connect(subGain);
    subGain.connect(filter);
    osc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    osc.start();
    sub.start();
    this.engineOsc = osc;
    this.engineSub = sub;
    this.engineFilter = filter;
    this.engineGain = engineGain;

    // Wind / ash hiss.
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = AUDIO_CONFIG.wind.bandpassFreq;
    windFilter.Q.value = AUDIO_CONFIG.wind.q;
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer(ctx, 4, 0.4);
    wind.loop = true;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    wind.start();
    this.windGain = windGain;

    this.started = true;
    const now = Date.now();
    for (const cue of this.pendingCues.splice(0)) {
      if (cue.expiresAt >= now) cue.play();
    }
  }

  private noiseBuffer(ctx: AudioContext, seconds: number, smoothing: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * smoothing + white * (1 - smoothing);
      data[i] = last;
    }
    return buffer;
  }

  setEngine(speed: number, throttle: number, crashed: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter || !this.engineSub) return;
    const now = this.ctx.currentTime;
    const s = Math.min(1, Math.abs(speed) / 31);
    const target = crashed ? 0.005 : AUDIO_CONFIG.engine.baseGain + s * AUDIO_CONFIG.engine.maxSpeedScale + throttle * AUDIO_CONFIG.engine.throttleScale;
    this.engineGain.gain.setTargetAtTime(target, now, 0.12);
    this.engineOsc.frequency.setTargetAtTime(38 + s * 104 + throttle * 9, now, 0.15);
    this.engineSub.frequency.setTargetAtTime(19 + s * 46, now, 0.15);
    this.engineFilter.frequency.setTargetAtTime(220 + s * 620, now, 0.15);
    this.windGain?.gain.setTargetAtTime(crashed ? 0.005 : s * AUDIO_CONFIG.wind.maxGain, now, 0.3);
  }

  impact(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Low body thump.
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(AUDIO_CONFIG.impact.thumpFreqStart, now);
    thump.frequency.exponentialRampToValueAtTime(AUDIO_CONFIG.impact.thumpFreqEnd, now + 0.55);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(AUDIO_CONFIG.impact.thumpGain, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    thump.connect(thumpGain);
    thumpGain.connect(this.master);
    thump.start(now);
    thump.stop(now + 1);

    // Gravel / ash burst.
    const burst = ctx.createBufferSource();
    burst.buffer = this.noiseBuffer(ctx, 1.2, 0.1);
    const burstFilter = ctx.createBiquadFilter();
    burstFilter.type = "lowpass";
    burstFilter.frequency.setValueAtTime(AUDIO_CONFIG.impact.burstFreqStart, now);
    burstFilter.frequency.exponentialRampToValueAtTime(AUDIO_CONFIG.impact.burstFreqEnd, now + 0.6);
    const burstGain = ctx.createGain();
    burstGain.gain.setValueAtTime(AUDIO_CONFIG.impact.burstGain, now);
    burstGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    burst.connect(burstFilter);
    burstFilter.connect(burstGain);
    burstGain.connect(this.master);
    burst.start(now);
    burst.stop(now + 1.2);

    // A thin ring in the ears, like the moment after a collision.
    const ring = ctx.createOscillator();
    ring.type = "sine";
    ring.frequency.value = AUDIO_CONFIG.impact.ringFreq;
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.001, now);
    ringGain.gain.linearRampToValueAtTime(AUDIO_CONFIG.impact.ringGain, now + 0.1);
    ringGain.gain.exponentialRampToValueAtTime(0.0005, now + 5.5);
    ring.connect(ringGain);
    ringGain.connect(this.master);
    ring.start(now);
    ring.stop(now + 6);
  }

  playPartyIntro(): void {
    if (this.deferCue(() => this.playPartyIntro(), 5000)) return;
    const now = this.ctx?.currentTime ?? 0;
    for (const [frequency, delay, volume] of [[523.25, 0, 0.023], [659.25, 0.12, 0.021], [783.99, 0.24, 0.019], [987.77, 0.4, 0.024]] as const) {
      this.playTone(frequency, now + delay, 0.72, volume, "triangle");
    }
  }

  playPartyChime(): void {
    if (this.deferCue(() => this.playPartyChime(), 1500)) return;
    const now = this.ctx?.currentTime ?? 0;
    this.playTone(880, now, 0.38, 0.018, "sine");
    this.playTone(1318.51, now + 0.055, 0.31, 0.012, "sine");
  }

  playPartyTransition(): void {
    if (this.deferCue(() => this.playPartyTransition(), 1500)) return;
    const now = this.ctx?.currentTime ?? 0;
    for (const [frequency, delay] of [[392, 0], [493.88, 0.16], [587.33, 0.32]] as const) {
      this.playTone(frequency, now + delay, 1.15, 0.017, "triangle");
    }
  }

  playGuestShove(): void {
    if (this.deferCue(() => this.playGuestShove(), 700)) return;
    this.playNoiseBurst(0.16, 0.045, 620);
  }

  playGuestThrow(): void {
    if (this.deferCue(() => this.playGuestThrow(), 900)) return;
    this.playNoiseBurst(0.24, 0.035, 880);
  }

  playPorchReveal(): void {
    if (this.deferCue(() => this.playPorchReveal(), 1800)) return;
    const now = this.ctx?.currentTime ?? 0;
    for (const [frequency, delay] of [[349.23, 0], [440, 0.18], [523.25, 0.36]] as const) {
      this.playTone(frequency, now + delay, 1.45, 0.019, "sine");
    }
  }

  playFarewell(): void {
    if (this.deferCue(() => this.playFarewell(), 1200)) return;
    const now = this.ctx?.currentTime ?? 0;
    this.playTone(659.25, now, 0.52, 0.018, "sine");
    this.playTone(523.25, now + 0.16, 0.72, 0.016, "sine");
  }

  private deferCue(play: () => void, lifetimeMs: number): boolean {
    if (this.started) return false;
    this.pendingCues.push({ play, expiresAt: Date.now() + lifetimeMs });
    return true;
  }

  private playTone(frequency: number, startAt: number, duration: number, volume: number, type: OscillatorType): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state === "closed") return;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.linearRampToValueAtTime(volume, startAt + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  }

  private playNoiseBurst(duration: number, volume: number, frequency: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state === "closed") return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx, duration, 0.18);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.72;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(volume, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  getMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    this.engineOsc?.stop();
    this.engineSub?.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineSub = null;
    this.engineFilter = null;
    this.windGain = null;
    this.pendingCues.length = 0;
    this.started = false;
  }
}
