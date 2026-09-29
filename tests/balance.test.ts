// Balance report: BALANCE=1 SEED=7 npx vitest run tests/balance.test.ts (SEED picks the farm, default 99; HARD=1 for Hard Mode)
// REPS=6 plays six seeded replays per skill instead and prints one line each: W31 = sealed on day 31, BUST20 = went
// bust on day 20, with the days each Crater Project stage was funded and the smoke bombs thrown. One run is too noisy
// to judge a change by; run a few seeds side by side.
import { describe, it } from 'vitest';
import { Game } from '../src/game';
import { botPlan, playDay } from './helpers';

const DAYS = Number(import.meta.env.DAYS ?? 70);
const SEED = Number(import.meta.env.SEED ?? 99);
const MODE = import.meta.env.HARD ? 'hard' : 'normal';
const REPS = Number(import.meta.env.REPS ?? 0);

/** The bot's aim is random too: seed it, so a run can be repeated exactly. */
function seeded(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe.runIf(import.meta.env.BALANCE)('balance', () => {
  for (const [aim, acc, label] of [[0, 0, 'no sling'], [1.0, 0.55, 'casual'], [0.6, 0.7, 'decent'], [0.4, 0.85, 'sharp']] as const) {
    it.runIf(REPS > 0 && aim > 0)(`${label} ×${REPS}`, () => {
      const runs: string[] = [];
      for (let rep = 1; rep <= REPS; rep++) {
        Math.random = seeded(rep * 7919 + SEED);
        const g = new Game();
        g.newGame(SEED, MODE);
        const funded: number[] = [];
        let bombs = 0;
        for (let day = 0; day < DAYS && g.phase === 'planning'; day++) {
          const project = g.project;
          botPlan(g);
          if (g.smoked) bombs++;
          if (g.project > project) funded.push(g.round);
          playDay(g, aim, acc);
          g.continueAfterSummary();
        }
        const end = g.phase === 'victory' ? 'W' : g.phase === 'gameover' ? 'BUST' : 'open';
        runs.push(`${end}${g.round}(${funded.join('/')}${bombs ? `;b${bombs}` : ''})`);
      }
      console.log(`seed ${SEED} ${MODE} ${label.padEnd(6)} ${runs.join(' ')}`);
    }, 1_800_000);

    it.runIf(REPS === 0)(label, () => {
      Math.random = seeded(SEED * 31 + aim * 1000);
      const g = new Game();
      g.newGame(SEED, MODE);
      const log: string[] = [];
      const events: string[] = [];
      for (let day = 0; day < DAYS && g.phase === 'planning'; day++) {
        const project = g.project;
        botPlan(g);
        if (g.project > project) events.push(`funded stage ${g.project} on day ${g.round}`);
        const start = g.credits;
        playDay(g, aim, acc);
        const rs = g.roundStats;
        log.push(`${label} R${g.round} ${g.season}/${g.weather} bunnies ${g.wave.length} kills ${rs.kills} fed ${rs.escapedFed} ` +
          `lost ${rs.cropsLost} harvest ${rs.harvestTotal} credits ${start}->${g.credits} lots ${g.lots.filter(Boolean).length} ` +
          `bucks ${rs.bucks}/${g.wave.filter((w) => w.kind === 'mutant').length} project ${g.project}`);
        if (g.nightResult) events.push(`Last Night on day ${g.round}: ${g.nightResult} (${rs.bucks} Bucks bonked)`);
        g.continueAfterSummary();
      }
      events.push(`${label} ended ${g.phase} on day ${g.round}, unlocked ${g.unlocked.size}, harvest ${g.stats.harvest}`);
      console.log(`${log.join('\n')}\n${events.map((e) => `  * ${e}`).join('\n')}`);
    }, 600_000);
  }
});
