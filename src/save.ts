// Browser persistence: the current farm, the best run, and settings.
import { SAVE_VERSION, type SaveData } from './game';

const SAVE_KEY = 'bk4.save';
const BEST_KEY = 'bk4.best';
const SETTINGS_KEY = 'bk4.settings';
const SCORES_KEY = 'bk4.scores';
const CLASSIC_KEY = 'bk4.classicBest';

export interface Best {
  score: number; // lifetime harvest credits
  round: number; // days survived
}

export interface Settings {
  muted: boolean;
  musicMuted: boolean;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the game still plays, it just won't remember
  }
}

export function loadSave(): SaveData | null {
  const d = read<SaveData>(SAVE_KEY);
  return d && d.v === SAVE_VERSION && Array.isArray(d.tiles) ? d : null;
}

export const writeSave = (d: SaveData): void => write(SAVE_KEY, d);

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export const loadBest = (): Best | null => read<Best>(BEST_KEY);

/** Keep the higher-scoring run. Returns true on a new record. */
export function recordBest(score: number, round: number): boolean {
  const best = loadBest();
  if (best && best.score >= score) return false;
  write(BEST_KEY, { score, round });
  return true;
}

export const loadSettings = (): Settings => ({ muted: false, musicMuted: false, ...read<Settings>(SETTINGS_KEY) });
export const saveSettings = (s: Settings): void => write(SETTINGS_KEY, s);

// ---------------------------------------------------------------- high scores

export interface ScoreEntry {
  score: number; // lifetime harvest
  days: number;
  kills: number;
  bosses: number;
  date: string; // YYYY-MM-DD
  retired: boolean;
}

export function loadScores(): ScoreEntry[] {
  const list = read<ScoreEntry[]>(SCORES_KEY);
  return Array.isArray(list) ? list : [];
}

/** Add a finished run; returns its 0-based rank in the top ten, or -1 if it didn't place. */
export function addScore(entry: ScoreEntry): number {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score || b.days - a.days);
  const top = list.slice(0, 10);
  write(SCORES_KEY, top);
  return top.indexOf(entry);
}

// ---------------------------------------------------------------- Classic Mode best

export const loadClassicBest = (): number => read<number>(CLASSIC_KEY) ?? 0;

/** Returns true on a new record. */
export function recordClassicBest(score: number): boolean {
  if (score <= loadClassicBest()) return false;
  write(CLASSIC_KEY, score);
  return true;
}
