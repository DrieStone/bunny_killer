// The morning's advice, worked out from the game: what today's weather, season, and event do, which crops pay
// best, what to do about it, and what would make the farm grow more. DOM-free, so it's tested like the rules.
import {
  CROP_ORDER, cropPlural, CROPS, type CropKind, EVENTS, FARM, fruitsPerDay, HYBRID_GROWTH, HYBRID_LEVELS, hybridCost, MARKET,
  ripenDays, ROUND_SECONDS, SEASONS, SOIL_GROWTH, SPRINKLER_GROWTH, WEATHER, WELL_GROWTH,
} from './config';
import type { Game } from './game';

export interface CropReturn {
  kind: CropKind;
  seed: number;
  price: number; // what the first one sells for tonight
  days: number; // days to ripen on dry ground today
  wetDays: number; // ...by a sprinkler
  fruits: number; // fruit a day once it bears (1 for all but strawberries and tomatoes)
  perDay: number; // profit per tile per day on dry ground, after the seed
  wetPerDay: number; // ...by a sprinkler
}

const pct = (m: number) => `${Math.round(Math.abs(m - 1) * 100)}%`;
const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const Cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Profit per tile per day at a growth speed: a crop's sale (or a perennial's whole run of fruit) less its seed. */
function profitPerDay(kind: CropKind, speed: number, price: number): number {
  const c = CROPS[kind];
  const days = ripenDays(kind, speed);
  if (!c.regrow) return (price - c.seedCost) / days;
  const perDay = fruitsPerDay(kind, speed);
  const n = c.harvests ?? 1;
  const life = days - 1 + Math.ceil(n / perDay); // the first picking on day `days`, then `perDay` a day
  return (price * n - c.seedCost) / life;
}

/** Every crop in the store, best-paying first (on dry ground, at tonight's prices). */
export function cropReturns(g: Game): CropReturn[] {
  return CROP_ORDER.filter((k) => g.isUnlocked(k)).map((kind) => {
    const dry = g.growthOn(kind, false);
    const wet = g.growthOn(kind, true);
    const price = g.cropPrice(kind);
    return {
      kind, seed: CROPS[kind].seedCost, price, days: ripenDays(kind, dry), wetDays: ripenDays(kind, wet),
      fruits: fruitsPerDay(kind, dry), perDay: profitPerDay(kind, dry, price), wetPerDay: profitPerDay(kind, wet, price),
    };
  }).sort((a, b) => b.perDay - a.perDay);
}

/** Crop growth today as a share of normal, for crops with no Seed Lab work: on dry ground, and by a sprinkler. */
export function fieldGrowth(g: Game): { dry: number; wet: number } {
  const soil = 1 + SOIL_GROWTH * g.farm.soil;
  const water = g.farm.well ? WELL_GROWTH : SPRINKLER_GROWTH;
  const wet = g.climateGrowth * soil * water;
  const windmill = g.landmark('windmill');
  const drought = g.event?.kind === 'drought' ? EVENTS.drought : 1;
  return { dry: windmill ? wet : g.climateGrowth * soil * drought, wet };
}

/** What the weather, the season, and today's event mean, in plain words. */
export function weatherLines(g: Game): string[] {
  const w = WEATHER[g.weather];
  const s = SEASONS[g.season];
  const cover = g.farm.greenhouse > 0;
  const out: string[] = [];
  switch (g.weather) {
    case 'sunny': out.push('Sunny: clear skies, nothing out of the ordinary.'); break;
    case 'rain': out.push(`Rain: crops grow ${pct(w.growth)} faster, and bunnies move ${pct(w.bunnySpeed)} slower, so they're easier to hit.`); break;
    case 'fog': out.push(`Fog: ${pct(w.bunnies)} more bunnies than the weather would usually bring.`); break;
    case 'snow':
      out.push(`Snow: ${cover ? 'your greenhouse keeps the crops growing, and' : `crops grow ${pct(w.growth)} slower, and`} ` +
        `bunnies move ${pct(w.bunnySpeed)} slower (Snow Hares don't).`);
      break;
  }
  // the season, in one short sentence: growing, then prices, then bunnies
  const grow = s.growth === 1 ? '' : s.growth > 1 ? `grow ${pct(s.growth)} faster` : cover ? '' : `grow ${pct(s.growth)} slower`;
  const sell = s.sell === 1 ? '' : `sell ${pct(s.sell)} ${s.sell > 1 ? 'higher' : 'lower'}`;
  const crops = [grow, sell].filter(Boolean).join(' and ');
  const bunnies = s.bunnies === 1 ? '' : `${pct(s.bunnies)} ${s.bunnies > 1 ? 'more' : 'fewer'} bunnies come`;
  const glass = s.growth < 1 && cover ? ' (the greenhouse keeps them growing)' : '';
  out.push(`${s.name}: ${crops ? `crops ${crops}${glass}` : glass ? `crops keep growing${glass}` : 'the usual growing and the usual prices'}` +
    `${bunnies ? `, and ${bunnies}` : ''}.`);
  const e = g.event;
  if (e?.kind === 'fair') {
    out.push(`County Fair: ${cropPlural(e.crop!)} sell for ${EVENTS.fairMult}× tonight, the first ${g.fairCap}. Planted this morning, they ripen in time.`);
  } else if (e?.kind === 'hail') {
    const at = clock(g, e.at ?? 0);
    out.push(`Hail around ${at}: ${cover ? 'your greenhouse covers the crops' : `it knocks ${Math.round(EVENTS.hailDamage * 100)}% off every crop's toughness`}, ` +
      `and the bunnies cower for ${EVENTS.hailSeconds} seconds: easy shots.`);
  } else if (e?.kind === 'drought') {
    out.push(g.landmark('windmill') ? 'Drought: your windmill keeps every row watered.'
      : `Drought: crops grow at ${Math.round(EVENTS.drought * 100)}% speed unless a sprinkler reaches them.`);
  } else if (e?.kind === 'merchant') {
    out.push('A travelling merchant has parked a cart by the farm with a few deals, this morning only. Click the cart.');
  }
  const { dry, wet } = fieldGrowth(g);
  const speed = (m: number) => `${Math.round(m * 100)}%`;
  out.push(`All told, crops grow at ${speed(dry)} of normal speed today${g.isUnlocked('sprinkler') && wet !== dry ? `, ${speed(wet)} by a sprinkler` : ''}.`);
  return out;
}

/** The time of day `t` seconds into the day, as the menubar clock shows it. */
function clock(g: Game, t: number): string {
  const mins = (6 * 60 + Math.floor((t / ROUND_SECONDS) * (g.lastNight ? 10 : 14) * 60)) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = Math.floor((mins % 60) / 15) * 15;
  return `${((h + 11) % 12) + 1}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** What to do about today, most useful first. */
export function todayTips(g: Game, returns = cropReturns(g)): string[] {
  const out: string[] = [];
  const name = (k: CropKind) => cropPlural(k);
  const soon = returns.filter((r) => !CROPS[r.kind].regrow && r.days < ripenDays(r.kind)).map((r) => r.kind);
  if (soon.length) out.push(`A good day for ${list(soon.map(name))}: ${soon.length === 1 ? 'it ripens' : 'they ripen'} a day sooner than usual.`);
  const twice = returns.filter((r) => r.fruits > 1).map((r) => r.kind);
  if (twice.length) out.push(`${Cap(list(twice.map(name)))} fruit twice a day at this speed.`);
  const slow = returns.filter((r) => r.days > ripenDays(r.kind)).map((r) => r.kind);
  if (slow.length) {
    const quick = returns.filter((r) => r.days === 1 && !CROPS[r.kind].regrow).map((r) => r.kind);
    out.push(`${Cap(list(slow.map(name)))} take an extra day today.${quick.length ? ` ${Cap(list(quick.slice(0, 3).map(name)))} still ripen tonight.` : ''}`);
  }
  if (g.isUnlocked('sprinkler') && !g.landmark('windmill')) {
    const watered = returns.filter((r) => r.wetDays < r.days).slice(0, 3);
    for (const r of watered) {
      out.push(`By a sprinkler, ${name(r.kind)} ripen ${r.wetDays === 1 ? 'tonight' : `in ${r.wetDays} days`} instead of in ${r.days} days.`);
    }
  }
  const o = g.order;
  if (o) {
    const left = o.due - g.round;
    out.push(`${o.who} wants ${o.want} ${cropPlural(o.kind, o.want)} by ${left === 0 ? 'tonight' : `Day ${o.due}, ${left + 1} days counting today`}: ` +
      `a ${o.bonus}¢ bonus. ${o.got} so far.`);
  }
  const missed = [...CROP_ORDER].filter((k) => g.isUnlocked(k) && g.demand(k) >= 0.1).sort((a, b) => g.demand(b) - g.demand(a))[0];
  if (missed) out.push(`Nobody's sold ${name(missed)} in a while: they fetch ${Math.round(g.demand(missed) * 100)}% more tonight.`);
  const glutted = CROP_ORDER.filter((k) => g.isUnlocked(k) && g.glut[k] >= 1).sort((a, b) => g.glut[b] - g.glut[a])[0];
  if (glutted) {
    const room = Math.max(0, Math.floor(MARKET.glut - g.glut[glutted]));
    out.push(`Town still has ${name(glutted)} from last time: about ${room} more sell at full price tonight.`);
  }
  const counts = g.waveCounts();
  if (counts.mutant && !g.lastNight) out.push('An Asteroid Buck climbs out of the crater today. It shrugs off scarecrows and sprinklers: shoot it, early and often.');
  if (g.breedBonus > 0) out.push(`${g.breedBonus} of today's bunnies are babies of yesterday's well-fed escapees. Shut the gaps they got through.`);
  out.push(`Prices sag after ${MARKET.glut} of one crop in an evening, so a mix sells best.`);
  return out;
}

/** What would make the farm grow more, for the crops that pay best today: at most three ideas. */
export function growMore(g: Game, returns = cropReturns(g)): string[] {
  const out: string[] = [];
  const top = returns.slice(0, 3);
  const name = (k: CropKind) => cropPlural(k);
  const soil = g.farmPrice('soil');
  if (soil !== null && g.isUnlocked('soil')) {
    const lvl = g.farm.soil;
    const next = (1 + SOIL_GROWTH * (lvl + 1)) / (1 + SOIL_GROWTH * lvl);
    const helped = top.find((r) => ripenDays(r.kind, g.growthOn(r.kind, false) * next) < r.days);
    out.push(`Rich Soil ${lvl + 1} (${soil}¢): every crop grows ${Math.round(SOIL_GROWTH * 100)}% faster` +
      `${helped ? `, and ${name(helped.kind)} would ripen a day sooner today` : ''}.`);
  }
  if (g.isUnlocked('lab')) {
    const pick = top.find((r) => g.hybrid[r.kind] < HYBRID_LEVELS);
    if (pick) {
      const cost = hybridCost(pick.kind, g.hybrid[pick.kind]);
      out.push(`Seed Lab for ${name(pick.kind)} (${cost}¢): ${Math.round(HYBRID_GROWTH * 100)}% faster growth and a higher price, for good.`);
    }
  }
  const sprinklers = g.tiles.some((t) => t.structure?.kind === 'sprinkler');
  const well = g.farmPrice('well');
  if (sprinklers && well !== null && g.isUnlocked('well')) {
    out.push(`Well Pump (${well}¢): sprinklers give +${Math.round((WELL_GROWTH - 1) * 100)}% growth instead of +${Math.round((SPRINKLER_GROWTH - 1) * 100)}%.`);
  }
  const cold = SEASONS[g.season].growth < 1 || WEATHER[g.weather].growth < 1;
  const glass = g.farmPrice('greenhouse');
  if (cold && glass !== null && g.isUnlocked('greenhouse')) out.push(`Greenhouse (${glass}¢): the cold stops slowing your crops.`);
  if (g.isUnlocked('sprinkler') && !g.landmark('windmill') && !out.length) {
    out.push(`Sprinklers: crops within reach grow ${Math.round((SPRINKLER_GROWTH - 1) * 100)}% faster, and shrug off a drought.`);
  }
  const stall = g.farmPrice('stall');
  if (stall !== null && g.isUnlocked('stall') && out.length < 3) out.push(`${FARM.stall.name} (${stall}¢): every crop fetches 6% more.`);
  return out.slice(0, 3);
}
