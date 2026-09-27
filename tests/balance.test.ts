// Balance report: BALANCE=1 npx vitest run tests/balance.test.ts
import { describe, it } from 'vitest';
import { Game } from '../src/game';
import { botPlan, playDay } from './helpers';

describe.runIf(import.meta.env.BALANCE)('balance', () => {
  for (const [aim, acc, label] of [[0, 0, 'no sling'], [1.0, 0.55, 'casual'], [0.6, 0.7, 'decent']] as const) {
    it(label, () => {
      const g = new Game();
      g.newGame(99);
      const log: string[] = [];
      for (let day = 0; day < 28 && g.phase === 'planning'; day++) {
        botPlan(g);
        const start = g.credits;
        playDay(g, aim, acc);
        const rs = g.roundStats;
        log.push(`${label} R${g.round} ${g.season}/${g.weather} bunnies ${g.wave.length} kills ${rs.kills} fed ${rs.escapedFed} lost ${rs.cropsLost} broken ${rs.structuresBroken} harvest ${rs.harvestTotal} credits ${start}->${g.credits} plot ${g.plotLevel}`);
        g.continueAfterSummary();
      }
      log.push(label + ' ended phase ' + g.phase + ' round ' + g.round);
      console.log(log.join('\n'));
    });
  }
});
