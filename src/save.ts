// Browser persistence: the current farm, the best run, and settings.
import { migrateSave, type SaveData } from './game';
import type { MapKind } from './world';

const SAVE_KEY = 'bk4.save';
const BEST_KEY = 'bk4.best';
const SETTINGS_KEY = 'bk4.settings';
const SCORES_KEY = 'bk4.scores';
const CLASSIC_KEY = 'bk4.classicBest';
const HARD_KEY = 'bk4.hardOpen';
const DAILY_SAVE_KEY = 'bk4.dailySave';
const DAILY_KEY = 'bk4.daily';

export interface Best {
  score: number; // lifetime harvest credits
  round: number; // days survived
}

export interface Settings {
  muted: boolean;
  musicMuted: boolean;
  autoSkip: boolean; // skip to sundown by itself once the day's bunnies are dealt with
  mono: boolean; // 1993 Mode: black and white, like a Mac Plus
  sfxVolume: number; // 0-7
  musicVolume: number; // 0-7
  lastFarm: MapKind; // the farm picked last time, offered first next time
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
  return migrateSave(read<SaveData>(SAVE_KEY));
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

export const loadSettings = (): Settings => ({
  muted: false, musicMuted: false, autoSkip: false, mono: false, sfxVolume: 5, musicVolume: 5, lastFarm: 'home', ...read<Settings>(SETTINGS_KEY),
});
export const saveSettings = (s: Settings): void => write(SETTINGS_KEY, s);

// ---------------------------------------------------------------- high scores

export interface ScoreEntry {
  score: number; // lifetime harvest
  days: number;
  kills: number;
  bosses: number;
  date: string; // YYYY-MM-DD
  retired: boolean;
  sealed?: boolean; // won: sealed the crater in `days` days
  hard?: boolean; // played in Hard Mode
  id?: string; // the farm it's from: a farm kept after its win updates its entry
  endless?: number; // kept farming after sealing the crater, to this day
  legacy?: number; // landmarks of the Farm Legacy built (all five: the legacy is complete)
}

export function loadScores(): ScoreEntry[] {
  const list = read<ScoreEntry[]>(SCORES_KEY);
  return Array.isArray(list) ? list : [];
}

/** Add a finished run; returns its 0-based rank in the top ten, or -1 if it didn't place. */
export function addScore(entry: ScoreEntry): number {
  const list = loadScores().filter((e) => !entry.id || e.id !== entry.id);
  list.push(entry);
  // wins first (Hard Mode ahead), fastest on top; then everyone else by harvest
  list.sort((a, b) => Number(!!b.sealed) - Number(!!a.sealed) ||
    (a.sealed ? Number(!!b.hard) - Number(!!a.hard) || a.days - b.days : 0) || b.score - a.score || b.days - a.days);
  const top = list.slice(0, 10);
  write(SCORES_KEY, top);
  return top.indexOf(entry);
}

// ---------------------------------------------------------------- achievements and the bunny guide (across all farms)

const ACHIEVE_KEY = 'bk4.achievements';
const GUIDE_KEY = 'bk4.guide';

/** Earned achievements: id → the date it was earned. */
export const loadAchievements = (): Record<string, string> => read<Record<string, string>>(ACHIEVE_KEY) ?? {};

/** Mark some achievements earned; returns the ones that are new. */
export function earnAchievements(ids: string[]): string[] {
  const have = loadAchievements();
  const fresh = ids.filter((id) => !have[id]);
  if (!fresh.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  for (const id of fresh) have[id] = today;
  write(ACHIEVE_KEY, have);
  return fresh;
}

/** The bunny guide: which kinds you've met, and how many of each you've bonked, on every farm. */
export interface Guide {
  seen: string[];
  bonked: Record<string, number>;
}

export const loadGuide = (): Guide => ({ seen: [], bonked: {}, ...read<Guide>(GUIDE_KEY) });

/** Fold a batch of sightings and bonks into the guide. */
export function recordGuide(seen: Set<string>, bonked: Map<string, number>): void {
  if (!seen.size && !bonked.size) return;
  const g = loadGuide();
  for (const k of seen) if (!g.seen.includes(k)) g.seen.push(k);
  for (const [k, n] of bonked) g.bonked[k] = (g.bonked[k] ?? 0) + n;
  write(GUIDE_KEY, g);
}

// ---------------------------------------------------------------- the Daily Farm: its own save slot, and today's best

export function loadDailySave(key: string): SaveData | null {
  const d = migrateSave(read<SaveData>(DAILY_SAVE_KEY));
  return d && d.daily === key ? d : null;
}

export const writeDailySave = (d: SaveData): void => write(DAILY_SAVE_KEY, d);

export function clearDailySave(): void {
  try {
    localStorage.removeItem(DAILY_SAVE_KEY);
  } catch {
    // ignore
  }
}

export interface DailyResult {
  score: number;
  kills: number;
  golden: number;
  orders: number;
  bucks: number;
  days: number; // 10, unless the farm went bust first
}

/** Today's best, if you've finished today's Daily Farm. */
export function loadDailyBest(key: string): DailyResult | null {
  const d = read<{ key: string; best: DailyResult }>(DAILY_KEY);
  return d && d.key === key ? d.best : null;
}

/** Keep the better of today's runs. Returns true on a new best. */
export function recordDaily(key: string, r: DailyResult): boolean {
  const best = loadDailyBest(key);
  if (best && best.score >= r.score) return false;
  write(DAILY_KEY, { key, best: r });
  return true;
}

// ---------------------------------------------------------------- Hard Mode: open once you've sealed the crater

/** Open if you've ever sealed the crater (wins from before Hard Mode existed count too). */
export const hardModeOpen = (): boolean => read<boolean>(HARD_KEY) === true || loadScores().some((e) => e.sealed);
export const openHardMode = (): void => write(HARD_KEY, true);

// ---------------------------------------------------------------- Classic Mode best

export const loadClassicBest = (): number => read<number>(CLASSIC_KEY) ?? 0;

/** Returns true on a new record. */
export function recordClassicBest(score: number): boolean {
  if (score <= loadClassicBest()) return false;
  write(CLASSIC_KEY, score);
  return true;
}
