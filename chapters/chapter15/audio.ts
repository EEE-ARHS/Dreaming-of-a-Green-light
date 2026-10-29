export class BoatAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private motor: OscillatorNode | null = null;
  private motorSub: OscillatorNode | null = null;
  private motorFilter: BiquadFilterNode | null = null;
  private motorGain: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;
  private waterSource: AudioBufferSourceNode | null = null;
  private muted = false;

  async unlock(): Promise<void> {
    if (!this.context) this.createNodes();
    await this.context?.resume();
  }

  setDrive(speed: number, throttle: number, active: boolean, muted: boolean): void {
    const context = this.context;
    if (!context || !this.motor || !this.motorSub || !this.motorFilter || !this.motorGain || !this.waterFilter || !this.waterGain || !this.master) return;
    const now = context.currentTime;
    const ratio = Math.max(0, Math.min(1, speed / 44.7));
    const running = active && context.state === "running";
    this.muted = muted;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.42, now, 0.08);
    this.motor.frequency.setTargetAtTime(42 + ratio * 74 + throttle * 8, now, 0.16);
    this.motorSub.frequency.setTargetAtTime(21 + ratio * 36, now, 0.16);
    this.motorFilter.frequency.setTargetAtTime(190 + ratio * 640 + throttle * 120, now, 0.2);
    this.motorGain.gain.setTargetAtTime(running ? 0.035 + ratio * 0.11 + throttle * 0.025 : 0.0001, now, 0.22);
    this.waterFilter.frequency.setTargetAtTime(420 + ratio * 950, now, 0.3);
    this.waterGain.gain.setTargetAtTime(running ? 0.018 + ratio * 0.075 : 0.0001, now, 0.35);
  }

  typeTick(index: number, finalLine = false): void {
    const context = this.context;
    if (!context || context.state !== "running" || this.muted || !this.master) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index % 3 === 0 ? "square" : "triangle";
    oscillator.frequency.setValueAtTime((finalLine ? 920 : 720) + (index % 5) * 58, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(finalLine ? 0.035 : 0.022, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.042);
  }

  dramaticCut(): void {
    const context = this.context;
    if (!context || context.state !== "running" || this.muted || !this.master) return;
    const now = context.currentTime;
    const drone = context.createOscillator();
    const droneGain = context.createGain();
    drone.type = "sine";
    drone.frequency.setValueAtTime(68, now);
    drone.frequency.exponentialRampToValueAtTime(27, now + 2.2);
    droneGain.gain.setValueAtTime(0.0001, now);
    droneGain.gain.linearRampToValueAtTime(0.24, now + 0.12);
    droneGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.1);
    drone.connect(droneGain);
    droneGain.connect(this.master);
    drone.start(now);
    drone.stop(now + 3.2);

    const burst = context.createBufferSource();
    burst.buffer = this.createNoiseBuffer(context, 3.3);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(110, now + 2.5);
    const burstGain = context.createGain();
    burstGain.gain.setValueAtTime(0.0001, now);
    burstGain.gain.linearRampToValueAtTime(0.14, now + 0.08);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
    burst.connect(filter);
    filter.connect(burstGain);
    burstGain.connect(this.master);
    burst.start(now);
    burst.stop(now + 3);
  }

  dispose(): void {
    this.motor?.stop();
    this.motorSub?.stop();
    this.waterSource?.stop();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.motor = null;
    this.motorSub = null;
    this.motorFilter = null;
    this.motorGain = null;
    this.waterFilter = null;
    this.waterGain = null;
    this.waterSource = null;
  }

  private createNodes(): void {
    const Constructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return;
    const context = new Constructor();
    this.context = context;

    const master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
    this.master = master;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 210;
    filter.Q.value = 1.2;
    const motorGain = context.createGain();
    motorGain.gain.value = 0.0001;
    const motor = context.createOscillator();
    motor.type = "sawtooth";
    motor.frequency.value = 42;
    const motorSub = context.createOscillator();
    motorSub.type = "sine";
    motorSub.frequency.value = 21;
    const subGain = context.createGain();
    subGain.gain.value = 0.42;
    motor.connect(filter);
    motorSub.connect(subGain);
    subGain.connect(filter);
    filter.connect(motorGain);
    motorGain.connect(master);
    motor.start();
    motorSub.start();
    this.motor = motor;
    this.motorSub = motorSub;
    this.motorFilter = filter;
    this.motorGain = motorGain;

    const waterSource = context.createBufferSource();
    waterSource.buffer = this.createNoiseBuffer(context, 3);
    waterSource.loop = true;
    const waterFilter = context.createBiquadFilter();
    waterFilter.type = "bandpass";
    waterFilter.frequency.value = 520;
    waterFilter.Q.value = 0.45;
    const waterGain = context.createGain();
    waterGain.gain.value = 0.0001;
    waterSource.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(master);
    waterSource.start();
    this.waterSource = waterSource;
    this.waterFilter = waterFilter;
    this.waterGain = waterGain;
  }

  private createNoiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = Math.random() * 2 - 1;
    return buffer;
  }
}
