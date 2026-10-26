export const AUDIO_CONFIG = {
  masterVolume: 0.55,
  engine: {
    baseGain: 0.02,
    baseFreq: 42,
    subFreq: 21,
    filterFreq: 260,
    filterQ: 3.5,
    maxSpeedScale: 0.13,
    throttleScale: 0.02,
  },
  wind: {
    bandpassFreq: 780,
    q: 0.7,
    maxGain: 0.055,
  },
  impact: {
    thumpFreqStart: 92,
    thumpFreqEnd: 29,
    thumpGain: 0.9,
    burstFreqStart: 2600,
    burstFreqEnd: 240,
    burstGain: 0.65,
    ringFreq: 4800,
    ringGain: 0.02,
  }
} as const;
