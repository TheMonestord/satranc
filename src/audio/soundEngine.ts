import type { MusicMood } from '../themes/types';
import type { Cue } from './cues';

/** Müzik havaları: her biri sırayla çalınan akorlardan (frekans, Hz) oluşur. */
const PROGRESSIONS: Record<MusicMood, number[][]> = {
  // Am – F – C – G (sıcak, sakin)
  sakin: [
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 261.63, 329.63],
    [196.0, 246.94, 293.66],
  ],
  // Dm – B♭ – Gm – A (karanlık, ağır)
  gece: [
    [146.83, 174.61, 220.0],
    [116.54, 146.83, 174.61],
    [98.0, 146.83, 196.0],
    [110.0, 138.59, 164.81],
  ],
  // C – G – Am – F (aydınlık)
  gunduz: [
    [261.63, 329.63, 392.0],
    [196.0, 246.94, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 261.63, 349.23],
  ],
};

const CHORD_SECONDS = 6;
const MUSIC_GAIN = 0.035;
const EFFECT_GAIN = 0.5;

/**
 * Oyunun bütün sesleri. Ses dosyası kullanılmaz; efektler ve müzik tarayıcıda üretilir.
 * Tarayıcılar sesi ancak kullanıcı sayfaya dokunduktan sonra açar: `unlock()` ilk dokunuşta çağrılmalıdır.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private sound = true;
  private music = false;
  private mood: MusicMood = 'sakin';
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicGain: GainNode | null = null;
  private chordIndex = 0;
  private unlocked = false;

  constructor(private createContext: () => AudioContext = () => new AudioContext()) {}

  setEnabled(sound: boolean, music: boolean): void {
    this.sound = sound;
    this.music = music;
    this.syncMusic();
  }

  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.chordIndex = 0;
  }

  /** İlk kullanıcı dokunuşunda çağrılır. */
  unlock(): void {
    this.unlocked = true;
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.syncMusic();
  }

  play(cue: Cue): void {
    if (!this.sound || !this.unlocked) return;
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (cue) {
      case 'place':
        this.knock(ctx, t, 150, 0.9);
        break;
      case 'capture':
        this.knock(ctx, t, 120, 1);
        this.knock(ctx, t + 0.09, 170, 0.8);
        break;
      case 'step':
        this.knock(ctx, t, 260, 0.35);
        this.knock(ctx, t + 0.16, 240, 0.3);
        break;
      case 'jump':
        this.sweep(ctx, t, 220, 520, 0.28, 0.25);
        break;
      case 'slide':
        this.noise(ctx, t, 0.55, 180, 0.5);
        break;
      case 'glide':
        this.noise(ctx, t, 0.5, 1800, 0.18);
        this.sweep(ctx, t, 660, 880, 0.45, 0.07);
        break;
      case 'promote':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(ctx, t + i * 0.09, f, 0.35, 0.22));
        break;
      case 'check':
        this.tone(ctx, t, 880, 0.16, 0.25);
        this.tone(ctx, t + 0.17, 698.46, 0.3, 0.25);
        break;
      case 'mate':
        [392, 311.13, 233.08, 155.56].forEach((f, i) => this.tone(ctx, t + i * 0.22, f, 0.9, 0.3));
        break;
      case 'draw':
        this.tone(ctx, t, 440, 0.4, 0.2);
        this.tone(ctx, t + 0.25, 440, 0.6, 0.2);
        break;
    }
  }

  dispose(): void {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
  }

  private context(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = this.createContext();
      } catch {
        // Ses desteği yoksa oyun sessiz sürer.
        this.sound = false;
        this.music = false;
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // ---------- Efekt yapı taşları ----------

  private envelope(ctx: AudioContext, t: number, duration: number, peak: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * EFFECT_GAIN), t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    gain.connect(ctx.destination);
    return gain;
  }

  /** Tahtaya konan taş: kısa, tok bir vuruş. */
  private knock(ctx: AudioContext, t: number, freq: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 1.8, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    osc.connect(this.envelope(ctx, t, 0.12, level));
    osc.start(t);
    osc.stop(t + 0.14);
    this.noise(ctx, t, 0.04, 2400, level * 0.35);
  }

  private tone(ctx: AudioContext, t: number, freq: number, duration: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(this.envelope(ctx, t, duration, level));
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private sweep(ctx: AudioContext, t: number, from: number, to: number, duration: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    osc.connect(this.envelope(ctx, t, duration, level));
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(ctx: AudioContext, t: number, duration: number, cutoff: number, level: number): void {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    src.connect(filter);
    filter.connect(this.envelope(ctx, t, duration, level));
    src.start(t);
  }

  // ---------- Müzik ----------

  private syncMusic(): void {
    const shouldPlay = this.music && this.unlocked;
    if (shouldPlay && !this.musicTimer) this.startMusic();
    else if (!shouldPlay && this.musicTimer) this.stopMusic();
  }

  private startMusic(): void {
    const ctx = this.context();
    if (!ctx) return;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.setValueAtTime(MUSIC_GAIN, ctx.currentTime);
    this.musicGain.connect(ctx.destination);
    this.playChord();
    this.musicTimer = setInterval(() => this.playChord(), CHORD_SECONDS * 1000);
  }

  private stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    const gain = this.musicGain;
    this.musicGain = null;
    if (gain && this.ctx) {
      // Çalan akor yumuşakça söner.
      gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
      setTimeout(() => gain.disconnect(), 2000);
    }
  }

  /** Yavaş girip yavaş çıkan bir akor; akorlar birbirinin üzerine biner. */
  private playChord(): void {
    const ctx = this.ctx;
    const out = this.musicGain;
    if (!ctx || !out) return;
    const chord = PROGRESSIONS[this.mood][this.chordIndex % PROGRESSIONS[this.mood].length];
    this.chordIndex++;
    const t = ctx.currentTime;
    const length = CHORD_SECONDS * 1.5;
    chord.forEach((freq, i) => {
      for (const detune of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.detune.setValueAtTime(detune, t);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.5, t + CHORD_SECONDS * 0.4);
        gain.gain.linearRampToValueAtTime(0.0001, t + length);
        osc.connect(gain);
        gain.connect(out);
        osc.start(t);
        osc.stop(t + length + 0.1);
      }
    });
  }
}
