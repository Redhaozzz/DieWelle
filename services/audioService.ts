
// Note frequencies for the BGM
const NOTES: Record<string, number> = {
  'C2': 65.41, 'D2': 73.42, 'Eb2': 77.78, 'F2': 87.31, 'G2': 98.00, 'Bb2': 116.54,
  'C3': 130.81, 'D3': 146.83, 'Eb3': 155.56, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'Bb3': 233.08,
  'D4': 293.66, 'F4': 349.23, 'A4': 440.00
};

class AudioService {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  
  private isBgmEnabled: boolean = false; // Default off
  private isSfxEnabled: boolean = true;  // Default on

  private isPlayingBgmLoop: boolean = false;
  private nextNoteTime: number = 0;
  private currentStep: number = 0;
  private schedulerId: number | null = null;
  
  // "Epic" Slow Progression (D Minor)
  private melody = [
    // Section A
    { freq: [NOTES.D2, NOTES.A3, NOTES.D4], duration: 4 }, // Dm
    { freq: [NOTES.Bb2, NOTES.F3, NOTES.Bb3], duration: 4 }, // Bb
    { freq: [NOTES.F2, NOTES.C3, NOTES.A3], duration: 4 }, // F
    { freq: [NOTES.C2, NOTES.G2, NOTES.G3], duration: 4 }, // C
    // Section B
    { freq: [NOTES.G2, NOTES.D3, NOTES.Bb3], duration: 4 }, // Gm
    { freq: [NOTES.D2, NOTES.A3, NOTES.F4], duration: 4 }, // Dm
    { freq: [NOTES.Bb2, NOTES.F3, NOTES.D4], duration: 4 }, // Bb
    { freq: [NOTES.A3, NOTES.D4, NOTES.A4], duration: 4 }, // A (Tension)
  ];

  constructor() {
    // Lazy init
  }

  private async initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3; 
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.isBgmEnabled ? 0.4 : 0;
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.isSfxEnabled ? 1.0 : 0;
      this.sfxGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  public async toggleBgm(): Promise<boolean> {
    await this.initCtx();
    this.isBgmEnabled = !this.isBgmEnabled;
    
    if (this.bgmGain) {
        this.bgmGain.gain.setValueAtTime(this.isBgmEnabled ? 0.4 : 0, this.ctx!.currentTime);
    }

    if (this.isBgmEnabled && !this.isPlayingBgmLoop) {
        this.isPlayingBgmLoop = true;
        this.nextNoteTime = this.ctx!.currentTime;
        this.currentStep = 0;
        this.scheduleLoop();
    }
    
    return this.isBgmEnabled;
  }

  public async toggleSfx(): Promise<boolean> {
    await this.initCtx();
    this.isSfxEnabled = !this.isSfxEnabled;
    
    if (this.sfxGain) {
        this.sfxGain.gain.setValueAtTime(this.isSfxEnabled ? 1.0 : 0, this.ctx!.currentTime);
    }
    return this.isSfxEnabled;
  }

  public getStatus() {
      return { bgm: this.isBgmEnabled, sfx: this.isSfxEnabled };
  }

  // --- BGM Sequencer ---

  private scheduleLoop = () => {
    if (!this.ctx) return;

    // Keep loop running even if muted, so it resumes at right spot (or check flag to stop processing)
    // Here we keep it running but the Gain is 0 if disabled.
    
    while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
      this.playStep(this.currentStep, this.nextNoteTime);
      const stepDuration = 2.5; 
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % this.melody.length;
    }

    this.schedulerId = requestAnimationFrame(this.scheduleLoop);
  };

  private playStep(index: number, time: number) {
    if (!this.ctx || !this.bgmGain) return;

    const chord = this.melody[index];
    
    chord.freq.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = i === 0 ? 'sawtooth' : 'triangle'; 
      osc.frequency.value = f;

      if (i > 0) osc.detune.value = Math.random() * 10 - 5;

      filter.type = 'lowpass';
      filter.Q.value = 1;
      filter.frequency.setValueAtTime(400, time);
      filter.frequency.exponentialRampToValueAtTime(800, time + chord.duration * 0.5);
      filter.frequency.exponentialRampToValueAtTime(400, time + chord.duration);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.3 / chord.freq.length, time + 0.5);
      gain.gain.setValueAtTime(0.3 / chord.freq.length, time + chord.duration - 0.5);
      gain.gain.linearRampToValueAtTime(0, time + chord.duration + 1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain!); // Connect to BGM bus

      osc.start(time);
      osc.stop(time + chord.duration + 2);
    });
  }

  // --- SFX ---

  public async playSfx(type: 'aoe' | 'convert' | 'beam_hit' | 'ui_click') {
    if (!this.ctx) await this.initCtx();
    if (this.ctx!.state !== 'running' || !this.sfxGain) return;
    
    // Fire and forget, gain node controls mute
    const t = this.ctx!.currentTime;

    if (type === 'aoe') {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);
      
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.5);

    } else if (type === 'convert') {
      const notes = [523.25, 659.25, 783.99, 1046.50]; 
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        const start = t + i * 0.05;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);

        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(start);
        osc.stop(start + 0.6);
      });

    } else if (type === 'ui_click') {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  public async playVictory() {
      if (!this.ctx) await this.initCtx();
      if (this.ctx!.state !== 'running' || !this.sfxGain) return;
      const t = this.ctx!.currentTime;
      
      // Firework Sound (Noise Burst)
      const bufferSize = this.ctx.sampleRate * 1.5; // 1.5 seconds
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Fill with white noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const gain = this.ctx.createGain();
      
      // Envelope: Pop -> Decay
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.5, t + 0.05); // Attack
      gain.gain.exponentialRampToValueAtTime(0.01, t + 1.0); // Decay

      noise.connect(gain);
      gain.connect(this.sfxGain!);
      
      noise.start(t);
      // No stop needed really, buffer ends, but good practice
      noise.stop(t + 1.5);
  }
}

export const audioService = new AudioService();
