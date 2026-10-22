/** All sound is synthesised at runtime: a straight-six idle, wind, and the impact. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private started = false;
  private muted = false;

  get isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.55;
    master.connect(ctx.destination);
    this.master = master;

    // Engine: two detuned saws through a low-pass.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.02;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    filter.Q.value = 3.5;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 42;
    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.value = 21;
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
    windFilter.frequency.value = 780;
    windFilter.Q.value = 0.7;
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer(ctx, 4, 0.4);
    wind.loop = true;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    wind.start();
    this.windGain = windGain;

    this.started = true;
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
    const target = crashed ? 0.005 : 0.024 + s * 0.13 + throttle * 0.02;
    this.engineGain.gain.setTargetAtTime(target, now, 0.12);
    this.engineOsc.frequency.setTargetAtTime(38 + s * 104 + throttle * 9, now, 0.15);
    this.engineSub.frequency.setTargetAtTime(19 + s * 46, now, 0.15);
    this.engineFilter.frequency.setTargetAtTime(220 + s * 620, now, 0.15);
    this.windGain?.gain.setTargetAtTime(crashed ? 0.005 : s * 0.055, now, 0.3);
  }

  impact(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Low body thump.
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(92, now);
    thump.frequency.exponentialRampToValueAtTime(29, now + 0.55);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.9, now);
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
    burstFilter.frequency.setValueAtTime(2600, now);
    burstFilter.frequency.exponentialRampToValueAtTime(240, now + 0.6);
    const burstGain = ctx.createGain();
    burstGain.gain.setValueAtTime(0.65, now);
    burstGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    burst.connect(burstFilter);
    burstFilter.connect(burstGain);
    burstGain.connect(this.master);
    burst.start(now);
    burst.stop(now + 1.2);

    // A thin ring in the ears, like the moment after a collision.
    const ring = ctx.createOscillator();
    ring.type = "sine";
    ring.frequency.value = 4800;
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.001, now);
    ringGain.gain.linearRampToValueAtTime(0.02, now + 0.1);
    ringGain.gain.exponentialRampToValueAtTime(0.0005, now + 5.5);
    ring.connect(ringGain);
    ringGain.connect(this.master);
    ring.start(now);
    ring.stop(now + 6);
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
}
