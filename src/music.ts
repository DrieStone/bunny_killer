// A tiny chiptune player: square lead, triangle bass, soft arpeggio, noise drums, all synthesized.
// Songs are written on a 16th-note grid: a note like "E5" starts a note, "-" holds it, "." rests.
// Drums use k (kick), s (snare), h (hat).

export type Song = 'title' | 'plan' | 'day' | 'boss';

interface SongDef {
  bpm: number;
  lead: string;
  bass: string;
  arp?: string;
  drums?: string;
  leadVol: number;
}

const bars = (...b: string[]) => b.join(' ');

// "Morning on the Farm": C major, easygoing.
const MORNING: SongDef = {
  bpm: 92,
  leadVol: 0.07,
  lead: bars(
    'E5 - - - G5 - - - A5 - G5 - E5 - - -',
    'C5 - - - D5 - E5 - C5 - - - A4 - - -',
    'F4 - A4 - C5 - - - A4 - C5 - F5 - - -',
    'D5 - - - B4 - G4 - A4 - B4 - D5 - - -',
    'E5 - G5 - C6 - - - B5 - A5 - G5 - - -',
    'E5 - - - C5 - E5 - A5 - - - G5 - - -',
    'F5 - E5 - D5 - - - B4 - C5 - D5 - - -',
    'C5 - - - - - - - . . . . . . . .',
  ),
  bass: bars(
    'C3 - - - . . . . G2 - - - . . . .',
    'A2 - - - . . . . E3 - - - . . . .',
    'F2 - - - . . . . C3 - - - . . . .',
    'G2 - - - . . . . D3 - - - . . . .',
    'C3 - - - . . . . G2 - - - . . . .',
    'A2 - - - . . . . E3 - - - . . . .',
    'D3 - - - . . . . G2 - - - . . . .',
    'C3 - - - . . . . C3 - - - . . . .',
  ),
  arp: bars(
    'C4 . E4 . G4 . E4 . C4 . E4 . G4 . E4 .',
    'A3 . C4 . E4 . C4 . A3 . C4 . E4 . C4 .',
    'F3 . A3 . C4 . A3 . F3 . A3 . C4 . A3 .',
    'G3 . B3 . D4 . B3 . G3 . B3 . D4 . B3 .',
    'C4 . E4 . G4 . E4 . C4 . E4 . G4 . E4 .',
    'A3 . C4 . E4 . C4 . A3 . C4 . E4 . C4 .',
    'D4 . F4 . A4 . F4 . G3 . B3 . D4 . B3 .',
    'C4 . E4 . G4 . E4 . C4 . . . . . . . .',
  ),
};

// "Bunny Rush": G major, bouncy.
const DAY: SongDef = {
  bpm: 128,
  leadVol: 0.065,
  lead: bars(
    'G4 - B4 - D5 - B4 - G5 - - - D5 - B4 -',
    'E5 - - - G5 - E5 - B4 - - - G4 - - -',
    'C5 - E5 - G5 - E5 - C6 - - - G5 - E5 -',
    'F#5 - - - A5 - F#5 - D5 - - - A4 - - -',
    'B4 - D5 - G5 - - - B5 - A5 - G5 - D5 -',
    'E5 - G5 - B5 - - - G5 - E5 - B4 - - -',
    'C5 - E5 - G5 - - - F#5 - A5 - D6 - - -',
    'G5 - - - D5 - B4 - G4 - - - . . . .',
  ),
  bass: bars(
    'G2 . D3 . G2 . D3 . G2 . D3 . G2 . D3 .',
    'E2 . B2 . E2 . B2 . E2 . B2 . E2 . B2 .',
    'C3 . G3 . C3 . G3 . C3 . G3 . C3 . G3 .',
    'D3 . A3 . D3 . A3 . D3 . A3 . D3 . A3 .',
    'G2 . D3 . G2 . D3 . G2 . D3 . G2 . D3 .',
    'E2 . B2 . E2 . B2 . E2 . B2 . E2 . B2 .',
    'C3 . G3 . C3 . G3 . D3 . A3 . D3 . A3 .',
    'G2 . D3 . G2 . D3 . G2 . . . G2 . . .',
  ),
  drums: 'k . h . s . h . k . h . s . h h '.repeat(8).trim(),
};

// "Crater Rising": E minor, driving.
const BOSS: SongDef = {
  bpm: 144,
  leadVol: 0.06,
  lead: bars(
    'E5 - - - E5 - D5 - E5 - G5 - - - F#5 -',
    'E5 - - - C5 - - - E5 - C5 - B4 - - -',
    'D5 - - - D5 - C5 - D5 - F#5 - - - A5 -',
    'B5 - - - A5 - - - G5 - F#5 - D#5 - - -',
    'E5 - - - E5 - D5 - E5 - G5 - - - B5 -',
    'C6 - - - B5 - - - A5 - G5 - E5 - - -',
    'D5 - - - F#5 - - - A5 - - - F#5 - D5 -',
    'B4 - - - D#5 - - - F#5 - - - B5 - - -',
  ),
  bass: bars(
    'E2 . E2 . E3 . E2 . E2 . E2 . E3 . D3 .',
    'C2 . C2 . C3 . C2 . C2 . C2 . C3 . B2 .',
    'D2 . D2 . D3 . D2 . D2 . D2 . D3 . C3 .',
    'B1 . B1 . B2 . B1 . B1 . B1 . B2 . D#3 .',
    'E2 . E2 . E3 . E2 . E2 . E2 . E3 . D3 .',
    'C2 . C2 . C3 . C2 . C2 . C2 . C3 . B2 .',
    'D2 . D2 . D3 . D2 . D2 . D2 . D3 . C3 .',
    'B1 . B1 . B2 . B1 . B1 . D#2 . F#2 . B2 .',
  ),
  drums: 'k . h h s . h . k k h . s . h h '.repeat(8).trim(),
};

const SONGS: Record<Song, SongDef> = { title: { ...MORNING, bpm: 84 }, plan: MORNING, day: DAY, boss: BOSS };

const NOTE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function freq(note: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(note);
  if (!m) return 0;
  const midi = (Number(m[2]) + 1) * 12 + NOTE[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Parse a track into [step, note, lengthInSteps] events. */
function events(track: string): [number, string, number][] {
  const toks = track.trim().split(/\s+/);
  const out: [number, string, number][] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '-' || t === '.') continue;
    let len = 1;
    while (toks[i + len] === '-') len++;
    out.push([i, t, len]);
  }
  return out;
}

export class Music {
  muted = false;
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private current: Song | null = null;
  private wanted: Song | null = null;
  private stepAt = 0; // audio time of the next step
  private step = 0;
  private parsed = new Map<Song, { len: number; tracks: { kind: string; ev: Map<number, [string, number]> }[] }>();

  /** Hook up to the shared AudioContext once the browser allows sound. */
  attach(ctx: AudioContext, dest: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.muted ? 0 : 1;
    this.bus.connect(dest);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    window.setInterval(() => this.tick(), 25);
    if (this.wanted) this.play(this.wanted);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.bus && this.ctx) this.bus.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  play(song: Song | null): void {
    this.wanted = song;
    if (!this.ctx || song === this.current) return;
    this.current = song;
    this.step = 0;
    this.stepAt = this.ctx.currentTime + 0.12;
  }

  private song(name: Song) {
    let p = this.parsed.get(name);
    if (!p) {
      const def = SONGS[name];
      const mk = (kind: string, track?: string) => {
        const ev = new Map<number, [string, number]>();
        if (track) for (const [s, n, l] of events(track)) ev.set(s, [n, l]);
        return { kind, ev };
      };
      const len = def.lead.trim().split(/\s+/).length;
      p = { len, tracks: [mk('lead', def.lead), mk('bass', def.bass), mk('arp', def.arp), mk('drums', def.drums)] };
      this.parsed.set(name, p);
    }
    return p;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.current || ctx.state !== 'running') return;
    const def = SONGS[this.current];
    const song = this.song(this.current);
    const stepDur = 60 / def.bpm / 4;
    if (this.stepAt < ctx.currentTime - 0.2) this.stepAt = ctx.currentTime + 0.05; // we fell behind (tab was hidden)
    while (this.stepAt < ctx.currentTime + 0.15) {
      for (const tr of song.tracks) {
        const e = tr.ev.get(this.step);
        if (!e) continue;
        const [note, len] = e;
        const dur = len * stepDur;
        if (tr.kind === 'drums') this.drum(note, this.stepAt);
        else this.voice(tr.kind, freq(note), this.stepAt, dur, def.leadVol);
      }
      this.stepAt += stepDur;
      this.step = (this.step + 1) % song.len;
    }
  }

  private voice(kind: string, f: number, t: number, dur: number, leadVol: number): void {
    if (!f) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    let vol: number;
    if (kind === 'lead') {
      osc.type = 'square';
      filter.frequency.value = 2600;
      vol = leadVol;
      // a touch of vibrato on held notes
      if (dur > 0.3) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = 5.5;
        depth.gain.value = f * 0.006;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t + 0.12);
        lfo.stop(t + dur + 0.05);
      }
    } else if (kind === 'bass') {
      osc.type = 'triangle';
      filter.frequency.value = 1200;
      vol = 0.11;
    } else {
      osc.type = 'square';
      filter.frequency.value = 1500;
      vol = 0.022;
    }
    osc.frequency.setValueAtTime(f, t);
    const end = t + Math.max(0.05, dur * 0.92);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(vol * 0.55, t + Math.min(0.12, dur * 0.5));
    gain.gain.setValueAtTime(vol * 0.55, end - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(filter).connect(gain).connect(this.bus!);
    osc.start(t);
    osc.stop(end + 0.02);
  }

  private drum(kind: string, t: number): void {
    const ctx = this.ctx!;
    if (kind === 'k') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain).connect(this.bus!);
      osc.start(t);
      osc.stop(t + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const snare = kind === 's';
    filter.type = snare ? 'bandpass' : 'highpass';
    filter.frequency.value = snare ? 1900 : 7500;
    const len = snare ? 0.12 : 0.035;
    gain.gain.setValueAtTime(snare ? 0.07 : 0.025, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter).connect(gain).connect(this.bus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  }
}
