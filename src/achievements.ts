// Achievements: things worth a small trophy. The checks read the game; main.ts keeps what's been earned.
import { LEGACY, MAX_LEVEL } from './config';
import type { Game } from './game';

export interface Achievement {
  id: string;
  name: string;
  text: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_bonk', name: 'First Bonk', text: 'Bonk a bunny.' },
  { id: 'bonk_100', name: 'Hundred Club', text: 'Bonk 100 bunnies on one farm.' },
  { id: 'bonk_1000', name: 'Bunny Bane', text: 'Bonk 1,000 bunnies on one farm.' },
  { id: 'first_buck', name: 'The Buck Stops Here', text: 'Beat an Asteroid Buck.' },
  { id: 'smoke', name: "Smoke 'Em Out", text: 'Beat a Buck you smoked out of the crater.' },
  { id: 'sealed', name: 'Capped', text: 'Seal the crater.' },
  { id: 'sealed_fast', name: 'Speed Farmer', text: 'Seal the crater by Day 28.' },
  { id: 'sealed_hard', name: 'Hard as Nails', text: 'Seal the crater in Hard Mode.' },
  { id: 'river', name: 'Bridge Keeper', text: 'Seal the crater on River Bend.' },
  { id: 'orchard', name: 'Orchardist', text: 'Seal the crater on Old Orchard.' },
  { id: 'endless_50', name: 'Stayed On', text: 'Keep farming after the win, to Day 50.' },
  { id: 'landmark', name: 'Pillar of the Community', text: 'Build a landmark of the Farm Legacy.' },
  { id: 'legacy', name: 'Finest Farm in the County', text: 'Complete the Farm Legacy: all five landmarks.' },
  { id: 'golden_1', name: 'Pot of Gold', text: 'Bonk a golden bunny.' },
  { id: 'golden_5', name: 'Gold Rush', text: 'Bonk 5 golden bunnies on one farm.' },
  { id: 'order_1', name: 'Special Delivery', text: 'Fill an order from town.' },
  { id: 'order_5', name: 'Local Supplier', text: 'Fill 5 orders on one farm.' },
  { id: 'fair', name: 'Blue Ribbon', text: 'Sell 20 crops to the County Fair in one evening.' },
  { id: 'merchant', name: 'Haggler', text: 'Buy something off the travelling merchant\'s cart.' },
  { id: 'combo', name: 'Teamwork', text: 'See two defenses pull off a combo.' },
  { id: 'five_star', name: 'Five Stars', text: 'Upgrade a defense all the way.' },
  { id: 'full_farm', name: 'Land Baron', text: 'Own every lot on the farm.' },
  { id: 'harvest_5000', name: 'Bumper Crop', text: 'Harvest 5,000¢ in one evening.' },
  { id: 'no_loss', name: 'Not a Nibble', text: 'From Day 5, get through a day of 20+ bunnies without losing a crop.' },
  { id: 'daily', name: 'Daily Grind', text: 'Finish a Daily Farm.' },
  { id: 'classic_1000', name: 'Old School', text: 'Score 1,000 in Classic Mode.' },
];

/** Things the game itself doesn't remember, noticed as they happen. */
export interface Noticed {
  combo?: boolean;
  classic?: number;
  dailyDone?: boolean;
}

/** Every achievement the game (and what's been noticed) satisfies right now. `evening` means after a harvest. */
export function satisfied(g: Game, noticed: Noticed, evening: boolean): string[] {
  const s = g.stats;
  const rs = g.roundStats;
  const won = g.sealed;
  const ok: Record<string, boolean> = {
    first_bonk: s.kills >= 1,
    bonk_100: s.kills >= 100,
    bonk_1000: s.kills >= 1000,
    first_buck: s.bossesBeaten >= 1,
    smoke: evening && g.smoked && rs.bucks > 0,
    sealed: won,
    sealed_fast: won && (s.sealedOn ?? 99) <= 28,
    sealed_hard: won && g.mode === 'hard',
    river: won && g.map === 'river',
    orchard: won && g.map === 'orchard',
    endless_50: won && g.round >= 50,
    landmark: g.legacy >= 1,
    legacy: g.legacy >= LEGACY.length,
    golden_1: (s.golden ?? 0) >= 1,
    golden_5: (s.golden ?? 0) >= 5,
    order_1: (s.orders ?? 0) >= 1,
    order_5: (s.orders ?? 0) >= 5,
    fair: evening && rs.fairSold >= 20,
    merchant: g.eventBought.length > 0,
    combo: !!noticed.combo,
    five_star: g.tiles.some((t) => (t.structure?.level ?? 0) >= MAX_LEVEL),
    full_farm: g.lots.every(Boolean),
    harvest_5000: evening && rs.harvestTotal >= 5000,
    no_loss: evening && g.round >= 5 && rs.cropsLost === 0 && g.waveTotal() >= 20,
    daily: !!noticed.dailyDone,
    classic_1000: (noticed.classic ?? 0) >= 1000,
  };
  return ACHIEVEMENTS.filter((a) => ok[a.id]).map((a) => a.id);
}
