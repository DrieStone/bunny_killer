// All sound is synthesized on the fly with WebAudio. No sound files.
import type { GameEvent } from './types';

type Wave = OscillatorType;

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();
  private coinStreak = 0;
  private lastCoin = 0;

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.32;
      this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(name: string, gap: number): boolean {
    if (this.muted || !this.ctx || !this.out) return false;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < gap) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  private tone(freq: number, dur: number, type: Wave, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.out!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(gain).connect(this.out!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: string): void {
    switch (name) {
      case 'sling':
        if (this.ready(name, 0.03)) this.noise(0.09, 0.5, 'bandpass', 2400, 500);
        break;
      case 'miss':
        if (this.ready(name, 0.03)) this.noise(0.05, 0.2, 'lowpass', 700);
        break;
      case 'hit':
        if (this.ready(name, 0.03)) this.tone(520, 0.06, 'square', 0.12, 260);
        break;
      case 'poof':
        if (this.ready(name, 0.04)) {
          this.noise(0.22, 0.5, 'lowpass', 1800, 250);
          this.tone(420, 0.07, 'sine', 0.25, 900);
        }
        break;
      case 'bigpoof':
        if (this.ready(name, 0.1)) {
          this.noise(0.6, 0.7, 'lowpass', 1400, 120);
          this.tone(200, 0.4, 'triangle', 0.3, 60);
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'square', 0.08, undefined, 0.25 + i * 0.08));
        }
        break;
      case 'snap':
        if (this.ready(name, 0.05)) {
          this.tone(1400, 0.03, 'square', 0.15);
          this.noise(0.08, 0.45, 'highpass', 2500);
        }
        break;
      case 'caw':
        if (this.ready(name, 0.3)) {
          this.tone(760, 0.12, 'sawtooth', 0.06, 520);
          this.tone(700, 0.14, 'sawtooth', 0.06, 480, 0.16);
        }
        break;
      case 'spray':
        if (this.ready(name, 0.2)) this.noise(0.4, 0.18, 'highpass', 3500, 1800);
        break;
      case 'twang':
        if (this.ready(name, 0.08)) {
          this.tone(330, 0.08, 'triangle', 0.1, 160);
          this.noise(0.04, 0.12, 'bandpass', 1800);
        }
        break;
      case 'woof':
        if (this.ready(name, 0.25)) {
          this.tone(240, 0.09, 'square', 0.1, 140);
          this.noise(0.08, 0.2, 'bandpass', 700);
        }
        break;
      case 'chomp':
        if (this.ready(name, 0.12)) this.noise(0.04, 0.12, 'bandpass', 1100);
        break;
      case 'chew':
        if (this.ready(name, 0.15)) this.noise(0.03, 0.08, 'bandpass', 2600);
        break;
      case 'lost':
        if (this.ready(name, 0.15)) this.tone(460, 0.25, 'triangle', 0.18, 170);
        break;
      case 'broken':
        if (this.ready(name, 0.1)) {
          this.noise(0.3, 0.45, 'lowpass', 900, 200);
          this.tone(130, 0.12, 'square', 0.1, 80);
        }
        break;
      case 'coin': {
        if (!this.ready(name, 0.04)) break;
        const now = this.ctx!.currentTime;
        this.coinStreak = now - this.lastCoin < 0.4 ? Math.min(this.coinStreak + 1, 12) : 0;
        this.lastCoin = now;
        const k = Math.pow(2, this.coinStreak / 12);
        this.tone(988 * k, 0.06, 'square', 0.09);
        this.tone(1319 * k, 0.14, 'square', 0.09, undefined, 0.06);
        break;
      }
      case 'place':
        if (this.ready(name, 0.03)) {
          this.tone(300, 0.05, 'triangle', 0.2, 200);
          this.noise(0.06, 0.2, 'lowpass', 500);
        }
        break;
      case 'remove':
        if (this.ready(name, 0.03)) this.tone(260, 0.07, 'triangle', 0.2, 150);
        break;
      case 'buy':
        if (this.ready(name, 0.05)) {
          this.tone(660, 0.07, 'triangle', 0.2);
          this.tone(880, 0.1, 'triangle', 0.2, undefined, 0.07);
        }
        break;
      case 'error':
        if (this.ready(name, 0.15)) this.tone(110, 0.16, 'square', 0.12);
        break;
      case 'dig':
        if (this.ready(name, 0.1)) this.noise(0.1, 0.15, 'lowpass', 600);
        break;
      case 'dawn':
        if (this.ready(name, 0.5)) [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.2, undefined, i * 0.09));
        break;
      case 'dusk':
        if (this.ready(name, 0.5)) [784, 659, 523, 392].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.2, undefined, i * 0.13));
        break;
      case 'click':
        if (this.ready(name, 0.02)) this.tone(1800, 0.015, 'square', 0.05);
        break;
    }
  }

  handle(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'sling': this.play('sling'); if (!e.hit) this.play('miss'); break;
        case 'hit': this.play('hit'); break;
        case 'poof': this.play(e.kind === 'mutant' ? 'bigpoof' : 'poof'); break;
        case 'snap': this.play('snap'); break;
        case 'scare': this.play('caw'); break;
        case 'spray': this.play('spray'); break;
        case 'shoot': this.play('twang'); break;
        case 'bite': this.play('woof'); break;
        case 'chomp': this.play('chomp'); break;
        case 'chew': this.play('chew'); break;
        case 'cropLost': this.play('lost'); break;
        case 'broken': this.play('broken'); break;
        case 'coin': this.play('coin'); break;
        case 'place': this.play('place'); break;
        case 'remove': this.play('remove'); break;
        case 'buy': this.play('buy'); break;
        case 'error': this.play('error'); break;
        case 'dig': this.play('dig'); break;
        case 'roundStart': this.play('dawn'); break;
        case 'sundown': this.play('dusk'); break;
        default: break;
      }
    }
  }
}
