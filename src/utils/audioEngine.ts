// Web Audio API Gothic Heartbeat & Atmospheric Room Drone Engine

export class GothicAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private schedulerId: number | null = null;
  private nextBeatTime = 0;
  private currentBpm = 72;
  private currentStress = 30;
  private running = false;

  public isRunning(): boolean {
    return this.running;
  }

  public start(bpm: number, stressLevel: number): void {
    this.currentBpm = Math.max(45, Math.min(185, bpm));
    this.currentStress = Math.max(0, Math.min(100, stressLevel));

    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (this.running) {
      this.updateParams(this.currentBpm, this.currentStress);
      return;
    }

    const now = this.ctx.currentTime;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.001, now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.85, now + 0.4);
    this.masterGain.connect(this.ctx.destination);

    // Subtle gothic subterranean room drone scaled by stress
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc2 = this.ctx.createOscillator();
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneGain = this.ctx.createGain();

    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.setValueAtTime(55, now);

    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.setValueAtTime(55.45, now);

    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.setValueAtTime(this.computeFilterCutoff(), now);
    this.droneFilter.Q.setValueAtTime(2.5, now);

    this.droneGain.gain.setValueAtTime(this.computeDroneVolume(), now);

    this.droneOsc1.connect(this.droneFilter);
    this.droneOsc2.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    this.droneOsc1.start(now);
    this.droneOsc2.start(now);

    this.running = true;
    this.nextBeatTime = now + 0.08;
    this.schedulerId = window.setInterval(() => this.scheduleHeartbeat(), 40);
  }

  public updateParams(bpm: number, stressLevel: number): void {
    this.currentBpm = Math.max(45, Math.min(185, bpm));
    this.currentStress = Math.max(0, Math.min(100, stressLevel));

    if (!this.running || !this.ctx || !this.droneFilter || !this.droneGain) return;
    const now = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(this.computeFilterCutoff(), now, 0.25);
    this.droneGain.gain.setTargetAtTime(this.computeDroneVolume(), now, 0.25);
  }

  public stop(): void {
    this.running = false;
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      try {
        this.masterGain.gain.setTargetAtTime(0.0001, now, 0.08);
      } catch {
        // Ignore ramp errors on teardown
      }
    }

    const osc1 = this.droneOsc1;
    const osc2 = this.droneOsc2;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneFilter = null;
    this.droneGain = null;

    setTimeout(() => {
      try {
        osc1?.stop();
        osc1?.disconnect();
        osc2?.stop();
        osc2?.disconnect();
      } catch {
        // Ignore stopped oscillator errors
      }
    }, 180);
  }

  private computeFilterCutoff(): number {
    return 85 + (this.currentStress / 100) * 190;
  }

  private computeDroneVolume(): number {
    return 0.02 + (this.currentStress / 100) * 0.055;
  }

  private scheduleHeartbeat(): void {
    if (!this.ctx || !this.masterGain || !this.running) return;
    const lookahead = 0.15;
    while (this.nextBeatTime < this.ctx.currentTime + lookahead) {
      this.triggerLubDub(this.nextBeatTime);
      const secondsPerBeat = 60 / this.currentBpm;
      this.nextBeatTime += secondsPerBeat;
    }
  }

  private triggerLubDub(time: number): void {
    if (!this.ctx || !this.masterGain) return;
    const stressGainBoost = 0.18 + (this.currentStress / 100) * 0.22;

    // S1 ("Lub"): deeper systolic thump
    this.triggerPulse(time, 64, 34, 0.13, stressGainBoost);

    // S2 ("Dub"): slightly sharper diastolic follow-up
    const lubDubGap = Math.max(0.14, Math.min(0.24, (60 / this.currentBpm) * 0.28));
    this.triggerPulse(time + lubDubGap, 76, 40, 0.11, stressGainBoost * 0.78);
  }

  private triggerPulse(
    startTime: number,
    startFreq: number,
    endFreq: number,
    duration: number,
    peakGain: number
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}

export const gothicAudioEngine = new GothicAudioEngine();

export function base64WavToObjectUrl(base64Audio: string): string {
  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
