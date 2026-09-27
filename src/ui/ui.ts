// The System 7 chrome around the farm: menubar, Farm Store, Almanac, and dialogs.
import {
  BREED_CAP, BUNNIES, BUNNY_ORDER, CROP_ORDER, CROPS, DEFENSE_ORDER, DEFENSES, defenseStats, MAX_LEVEL, PLOT_LEVELS,
  ROUND_SECONDS, SEASONS, SLING_LEVELS, upgradeCost, WEATHER, yearOf,
} from '../config';
import type { Game } from '../game';
import { dataURL, iconURL, menuBunny, spriteImg } from '../render/icons';
import { PixelGrid } from '../render/pixels';
import { type Img, sprites } from '../render/sprites';
import { type Classic, CLASSIC_SECONDS } from '../classic';
import type { ScoreEntry } from '../save';
import type { ShopItem } from '../types';
import type { DefenseKind } from '../config';
import { tileX, tileY } from '../world';

export interface UiHooks {
  newGame(): void;
  continueGame(): void;
  toTitle(): void;
  startDay(): void;
  nextDay(): void;
  togglePause(): void;
  toggleSpeed(): void;
  skipDay(): void;
  toggleMute(): void;
  toggleMusic(): void;
  musicMuted(): boolean;
  changed(): void; // something was bought or placed; save soon
  hasSave(): boolean;
  best(): { score: number; round: number } | null;
  paused(): boolean;
  speed(): number;
  muted(): boolean;
  unlockAudio(): void;
  toggleBalloons(): void;
  retire(): void;
  startClassic(): void;
  quitClassic(): void;
  classicBest(): number;
  scores(): ScoreEntry[];
  balloonsOn(): boolean;
  replayTutorial(): void;
}

export const HOTKEYS: Record<string, ShopItem> = {
  '1': { type: 'crop', kind: 'radish' },
  '2': { type: 'crop', kind: 'lettuce' },
  '3': { type: 'crop', kind: 'carrot' },
  '4': { type: 'crop', kind: 'corn' },
  '5': { type: 'crop', kind: 'strawberry' },
  '6': { type: 'crop', kind: 'pumpkin' },
  q: { type: 'defense', kind: 'fence' },
  w: { type: 'defense', kind: 'trap' },
  e: { type: 'defense', kind: 'scarecrow' },
  r: { type: 'defense', kind: 'sprinkler' },
  t: { type: 'defense', kind: 'turret' },
  y: { type: 'defense', kind: 'doghouse' },
  x: { type: 'remove' },
  u: { type: 'upgrade' },
};

const keyOf = (item: ShopItem) => (item.type === 'remove' || item.type === 'upgrade' ? item.type : `${item.type}:${item.kind}`);
const hotkeyOf = (item: ShopItem) => Object.entries(HOTKEYS).find(([, v]) => keyOf(v) === keyOf(item))?.[0] ?? '';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** "Range 3 · Every 2.1s · Damage 2" for a defense at a level. */
function statLine(kind: DefenseKind, level: number): string {
  const d = DEFENSES[kind];
  const st = defenseStats(kind, level);
  const bits: string[] = [];
  if (st.radius >= 1) bits.push(`Range ${st.radius.toFixed(1).replace(/\.0$/, '')}`);
  if (st.period > 0 && kind !== 'fence') bits.push(kind === 'trap' ? `Re-arms ${st.period.toFixed(1)}s` : `Every ${st.period.toFixed(1)}s`);
  if (st.damage > 0) bits.push(`Damage ${st.damage}`);
  if (d.blocks) bits.push(`Sturdiness ${st.hp}`);
  return bits.join(' · ');
}

const WEATHER_ICON: Record<string, string> = { sunny: '☀︎', rain: '☂︎', fog: '≋', snow: '❄︎' };

const APPEAL = (a: number) => (a >= 2 ? 'irresistible' : a >= 1.3 ? 'loves it' : a >= 0.8 ? 'likes it' : 'meh');

export class UI {
  selected: ShopItem | null = null;
  classic: Classic | null = null;
  previewExpand = false;
  hoverTile = -1;
  private hoverItem: ShopItem | null = null;
  private hoverButton: string | null = null;
  private memo = new Map<string, string>();
  private itemEls = new Map<string, HTMLElement>();
  private bannerTimer = 0;
  private toastTimer = 0;
  private modal: string | null = null;
  private onModalKey: ((key: string) => boolean) | null = null;

  constructor(private game: Game, private hooks: UiHooks) {
    this.buildMenubar();
    this.buildStore();
  }

  get modalOpen(): string | null {
    return this.modal;
  }

  // ------------------------------------------------------------ menubar

  private buildMenubar(): void {
    const icon = new Image();
    icon.src = dataURL(menuBunny());
    $('mb-icon').appendChild(icon);
    const bar = $('menubar');
    bar.addEventListener('mousedown', (e) => {
      const mb = (e.target as HTMLElement).closest('.mb');
      const mi = (e.target as HTMLElement).closest('.mi');
      if (mi) return;
      const open = bar.querySelector('.mb.open');
      if (mb && mb !== open) {
        open?.classList.remove('open');
        mb.classList.add('open');
      } else if (open) {
        open.classList.remove('open');
      }
      e.preventDefault();
    });
    bar.addEventListener('mouseover', (e) => {
      const mb = (e.target as HTMLElement).closest('.mb');
      const open = bar.querySelector('.mb.open');
      if (open && mb && mb !== open) {
        open.classList.remove('open');
        mb.classList.add('open');
      }
    });
    bar.addEventListener('click', (e) => {
      const mi = (e.target as HTMLElement).closest('.mi') as HTMLElement | null;
      if (!mi) return;
      bar.querySelector('.mb.open')?.classList.remove('open');
      if (mi.classList.contains('disabled')) return;
      this.menuAction(mi.dataset.action ?? '');
    });
    document.addEventListener('mousedown', (e) => {
      if (!(e.target as HTMLElement).closest('#menubar')) bar.querySelector('.mb.open')?.classList.remove('open');
    });
  }

  private menuAction(action: string): void {
    const g = this.game;
    switch (action) {
      case 'about': this.showAbout(); break;
      case 'help': this.showHelp(); break;
      case 'new': this.confirmNewGame(); break;
      case 'title': this.hooks.toTitle(); break;
      case 'pause': if (this.classic || g.phase === 'round' || g.phase === 'sundown') this.hooks.togglePause(); break;
      case 'speed': this.hooks.toggleSpeed(); break;
      case 'mute': this.hooks.toggleMute(); break;
      case 'music': this.hooks.toggleMusic(); break;
      case 'balloons': this.hooks.toggleBalloons(); break;
      case 'scores': this.showHighScores(this.modal === 'title' ? () => this.showTitle() : undefined); break;
      case 'retire': this.confirmRetire(); break;
      case 'tutorial': this.hooks.replayTutorial(); break;
    }
  }

  // ------------------------------------------------------------ store

  private buildStore(): void {
    const g = this.game;
    const store = $('store');
    store.innerHTML = `
      <div id="plan-panel" class="panel">
        <div class="money"><span class="credits" id="credits"></span><span class="day" id="day-label"></span></div>
        <div class="scroll">
        <div class="group scout"><span class="legend">Scouting Report</span><div id="scout"></div></div>
        <div class="group"><span class="legend">Seeds</span><div class="items" id="seed-items"></div></div>
        <div class="group"><span class="legend">Defenses</span><div class="items" id="def-items"></div></div>
        <div class="group"><span class="legend">Farm</span>
          <div class="items" id="tool-items"></div>
          <div class="row" style="margin-top:6px">
            <button class="btn" id="btn-expand"></button>
            <button class="btn" id="btn-sling"></button>
            <button class="btn" id="btn-repair"></button>
          </div>
        </div>
        </div>
        <div class="start"><button class="btn default" id="btn-start">Start the Day ▸</button></div>
      </div>
      <div id="classic-panel" class="panel" hidden>
        <div class="money"><span class="credits" id="cl-score"></span><span class="day">Classic Mode</span></div>
        <div style="margin-top:8px"><b>Time</b></div>
        <div class="progress sun"><div id="cl-time"></div></div>
        <div class="stats">
          <span>Combo</span><span class="v" id="cl-combo"></span>
          <span>Multiplier</span><span class="v" id="cl-mult"></span>
          <span>Accuracy</span><span class="v" id="cl-acc"></span>
          <span>Best</span><span class="v" id="cl-best"></span>
        </div>
        <div class="row" style="margin-top:10px"><button class="btn" id="btn-cl-quit">Quit to Title</button></div>
        <p class="hint">Bunnies: 10 · Jackrabbits: 25 · Chonks: 30 (three hits) · Pop-ups: 15 · <b>Golden: 100</b><br>
          Hit five in a row to double your points. Whatever you do, <b>don't hit the dog.</b></p>
      </div>
      <div id="title-panel" class="panel" hidden>
        <p style="margin-top:4px"><b>The store opens at dawn.</b></p>
        <p>Start a new farm, or pick up where you left off.</p>
        <p class="hint">Bunnies eat crops. You sell crops. Bonk accordingly.</p>
      </div>
      <div id="day-panel" class="panel" hidden>
        <div class="money"><span class="credits" id="credits2"></span><span class="day" id="day-label2"></span></div>
        <div style="margin-top:8px"><b>Daylight</b></div>
        <div class="progress sun"><div id="sunbar"></div></div>
        <div class="stats">
          <span>Bunnies on the way</span><span class="v" id="st-coming"></span>
          <span>Bunnies in the field</span><span class="v" id="st-field"></span>
          <span>Bonked</span><span class="v" id="st-kills"></span>
          <span>Crops eaten</span><span class="v" id="st-lost"></span>
          <span>Got away fed</span><span class="v" id="st-fed"></span>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="btn-pause">Pause</button>
          <button class="btn" id="btn-speed">Speed 1×</button>
        </div>
        <div class="row" style="margin-top:8px" id="skip-row" hidden>
          <button class="btn" id="btn-skip">All clear! Skip to sundown ▸▸</button>
        </div>
        <p class="hint">Click a bunny to hit it with your sling.<br>
          <span class="kbd">P</span> pause &nbsp; <span class="kbd">F</span> fast-forward &nbsp; <span class="kbd">M</span> sound</p>
      </div>`;
    const addItems = (host: HTMLElement, items: ShopItem[]) => {
      for (const item of items) {
        const el = document.createElement('div');
        el.className = 'item';
        const tool = item.type === 'remove' || item.type === 'upgrade';
        const name = item.type === 'crop' ? CROPS[item.kind].name
          : item.type === 'defense' ? DEFENSES[item.kind].name : item.type === 'remove' ? 'Dig / Sell' : 'Upgrade';
        const icon = iconURL(tool ? item.type : item.kind);
        const price = item.type === 'remove' ? 'refunds' : item.type === 'upgrade' ? 'defenses' : `${g.itemCost(item)}¢`;
        el.innerHTML = `<img src="${icon}" alt=""><span class="name">${name}</span>` +
          `<span class="cost">${price}</span><span class="hot">${hotkeyOf(item).toUpperCase()}</span>`;
        el.dataset.balloon = item.type === 'crop' ? `<b>${name}.</b> ${CROPS[item.kind].blurb}`
          : item.type === 'defense' ? `<b>${name}.</b> ${DEFENSES[item.kind].blurb}`
          : item.type === 'remove' ? '<b>Dig / Sell.</b> Click something on your plot to dig it up or sell it.'
          : '<b>Upgrade.</b> Click a defense to make it better, up to three stars.';
        el.addEventListener('click', () => {
          this.hooks.unlockAudio();
          this.select(this.selected && keyOf(this.selected) === keyOf(item) ? null : item);
        });
        el.addEventListener('mouseenter', () => { this.hoverItem = item; });
        el.addEventListener('mouseleave', () => { this.hoverItem = null; });
        host.appendChild(el);
        this.itemEls.set(keyOf(item), el);
      }
    };
    addItems($('seed-items'), CROP_ORDER.map((kind) => ({ type: 'crop', kind })));
    addItems($('def-items'), DEFENSE_ORDER.map((kind) => ({ type: 'defense', kind })));
    addItems($('tool-items'), [{ type: 'remove' }, { type: 'upgrade' }]);

    const button = (id: string, fn: () => void, hoverKey: string) => {
      const b = $<HTMLButtonElement>(id);
      b.addEventListener('click', () => {
        this.hooks.unlockAudio();
        fn();
      });
      b.addEventListener('mouseenter', () => {
        this.hoverButton = hoverKey;
        if (hoverKey === 'expand') this.previewExpand = true;
      });
      b.addEventListener('mouseleave', () => {
        this.hoverButton = null;
        this.previewExpand = false;
      });
    };
    button('btn-expand', () => { if (g.expandPlot()) this.hooks.changed(); }, 'expand');
    button('btn-sling', () => { if (g.upgradeSling()) this.hooks.changed(); }, 'sling');
    button('btn-repair', () => { if (g.repairAll()) this.hooks.changed(); }, 'repair');
    button('btn-start', () => this.hooks.startDay(), 'start');
    button('btn-pause', () => this.hooks.togglePause(), 'pause');
    button('btn-speed', () => this.hooks.toggleSpeed(), 'speed');
    button('btn-skip', () => this.hooks.skipDay(), 'skip');
    button('btn-cl-quit', () => this.hooks.quitClassic(), 'quit');
    const explain: Record<string, string> = {
      'btn-expand': 'Buy more land. Your plot grows by one tile on every side.',
      'btn-sling': 'A better sling reloads faster, then hits harder.',
      'btn-repair': 'Patch up every chewed defense at once.',
      'btn-start': 'Start the day. Crops grow and bunnies come until sundown.',
      'btn-pause': 'Freeze the action. Space or P does it too.',
      'btn-speed': 'Fast-forward the day. F does it too.',
      'btn-skip': 'No bunnies left: let the crops finish the day at high speed.',
    };
    for (const [id, text] of Object.entries(explain)) $(id).dataset.balloon = text;
    document.querySelector<HTMLElement>('.scout')!.dataset.balloon =
      'What\'s coming today: how many bunnies, what kinds, and the weather. Red arrows on the field mark their burrows.';
    $('farm-win').dataset.balloon = 'Your farm. Plant and build here in the morning; click bunnies to sling them during the day.';
    $('info-win').dataset.balloon = 'The Almanac describes whatever you point at.';
  }

  select(item: ShopItem | null): void {
    this.selected = item;
    for (const [k, el] of this.itemEls) el.classList.toggle('selected', !!item && keyOf(item) === k);
  }

  // ------------------------------------------------------------ per-frame refresh

  /** Write text only when it changed, to keep the DOM quiet. */
  private set(id: string, html: string): void {
    if (this.memo.get(id) === html) return;
    this.memo.set(id, html);
    $(id).innerHTML = html;
  }

  update(dt: number): void {
    const g = this.game;
    const planning = g.phase === 'planning';
    const day = g.phase === 'round' || g.phase === 'sundown' || g.phase === 'harvest' || g.phase === 'summary';
    const classic = this.classic;
    $('plan-panel').hidden = !planning || !!classic;
    $('day-panel').hidden = !day || !!classic;
    $('classic-panel').hidden = !classic;
    $('title-panel').hidden = planning || day || !!classic;
    if (classic) this.updateClassic(classic);
    this.set('store-title', classic ? 'Scoreboard' : planning ? 'Farm Store' : day ? 'Out in the Field' : 'Farm Store');
    this.set('farm-title', classic ? 'Bunny Killer Classic' : g.phase === 'title' ? 'Bunny Killer 4' : `Bunny Killer 4 — Day ${g.round}`);
    this.set('mb-clock', this.clockText());
    this.set('mi-mute', this.hooks.muted() ? 'Sound On' : 'Sound Off');
    this.set('mi-music', this.hooks.musicMuted() ? 'Music On' : 'Music Off');
    this.set('mi-balloons', this.hooks.balloonsOn() ? 'Hide Balloons' : 'Show Balloons');
    this.set('mi-speed', this.hooks.speed() > 1 ? 'Normal Speed' : 'Fast Forward');

    if (planning) this.updatePlanning();
    if (day) this.updateDay();
    this.updateInfo();

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) $('banner').classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) $('toast').classList.remove('show');
    }
  }

  private updateClassic(c: Classic): void {
    this.set('cl-score', `${c.score}`);
    ($('cl-time') as HTMLElement).style.width = `${Math.max(0, 1 - c.time / CLASSIC_SECONDS) * 100}%`;
    this.set('cl-combo', `${c.combo}`);
    this.set('cl-mult', `×${c.multiplier}`);
    this.set('cl-acc', c.shots ? `${Math.round(c.accuracy * 100)}%` : '—');
    this.set('cl-best', `${Math.max(this.hooks.classicBest(), c.score)}`);
  }

  private clockText(): string {
    const g = this.game;
    if (this.classic) return `Classic · ${Math.max(0, Math.ceil(CLASSIC_SECONDS - this.classic.time))}s left`;
    if (g.phase === 'title') return 'Bunny Killer 4';
    const when = `${this.calendar()} · ${WEATHER_ICON[g.weather]}`;
    switch (g.phase) {
      case 'planning': return `${when} · Dawn`;
      case 'round': {
        const mins = 6 * 60 + Math.floor((g.time / ROUND_SECONDS) * 14 * 60);
        const h = Math.floor(mins / 60);
        const m = Math.floor(mins % 60 / 15) * 15;
        const h12 = ((h + 11) % 12) + 1;
        return `${when} · ${h12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
      }
      case 'sundown': return `${when} · Sundown`;
      case 'harvest':
      case 'summary': return `${when} · Evening`;
      default: return 'Foreclosed';
    }
  }

  /** "Spring 3, Year 1" */
  private calendar(): string {
    const g = this.game;
    const dayOfSeason = ((g.round - 1) % 7) + 1;
    return `${SEASONS[g.season].name} ${dayOfSeason}, Year ${yearOf(g.round)}`;
  }

  private updatePlanning(): void {
    const g = this.game;
    this.set('credits', `¢${g.credits}`);
    this.set('day-label', this.calendar());
    for (const [k, el] of this.itemEls) {
      if (k === 'remove' || k === 'upgrade') continue;
      const [type, kind] = k.split(':');
      const cost = type === 'crop' ? CROPS[kind as keyof typeof CROPS].seedCost : DEFENSES[kind as keyof typeof DEFENSES].cost;
      el.classList.toggle('poor', g.credits < cost);
    }
    const exp = g.expandCost();
    const up = g.slingUpgradeCost();
    const rep = g.repairCost();
    this.setButton('btn-expand', exp === null ? 'Land: Max' : `Land ${exp}¢`, exp === null || g.credits < exp);
    this.setButton('btn-sling', up === null ? 'Sling: Max' : `Sling ${up}¢`, up === null || g.credits < up);
    this.setButton('btn-repair', rep === 0 ? 'Repair' : `Repair ${rep}¢`, rep === 0 || g.credits < rep);
    const counts = g.waveCounts();
    const total = g.wave.length;
    const kinds = BUNNY_ORDER.filter((k) => counts[k])
      .map((k) => `<span class="kind" title="${BUNNIES[k].name}">${spriteImg(sprites().bunnies[k].frames[0], k === 'mutant' ? 0.5 : 1)}×${counts[k]}</span>`)
      .join('');
    const breed = g.breedBonus > 0 ? `<br>${g.breedBonus} of them are babies of yesterday's well-fed escapees.` : '';
    const boss = counts.mutant ? '<br><b>Something is stirring in the crater…</b>' : '';
    const w = WEATHER[g.weather];
    const season = SEASONS[g.season];
    const firstOfSeason = (g.round - 1) % 7 === 0 && g.round > 1;
    const forecast = `<div class="forecast"><span class="wx">${WEATHER_ICON[g.weather]}</span> <b>${w.name}.</b> ` +
      `${g.weather === 'sunny' ? '' : w.blurb}${firstOfSeason || g.round === 1 ? ` <i>${season.name}: ${season.blurb}</i>` : ''}</div>`;
    this.set('scout', `${forecast}<b>${total}</b> bunnies from <b>${g.burrows.length}</b> burrows today.${breed}${boss}<div class="kinds">${kinds}</div>`);
    const noCrops = g.cropCount() === 0;
    $<HTMLButtonElement>('btn-start').disabled = noCrops;
    this.set('btn-start', noCrops ? 'Plant something first' : 'Start the Day ▸');
  }

  private setButton(id: string, label: string, disabled: boolean): void {
    this.set(id, label);
    const b = $<HTMLButtonElement>(id);
    if (b.disabled !== disabled) b.disabled = disabled;
  }

  private updateDay(): void {
    const g = this.game;
    const rs = g.roundStats;
    this.set('credits2', `¢${g.credits}`);
    this.set('day-label2', this.calendar());
    const frac = g.phase === 'round' ? Math.min(1, g.time / ROUND_SECONDS) : 1;
    ($('sunbar') as HTMLElement).style.width = `${(1 - frac) * 100}%`;
    const coming = Math.max(0, g.bunniesLeft() - g.bunnies.length);
    this.set('st-coming', `${coming}`);
    this.set('st-field', `${g.bunnies.length}`);
    this.set('st-kills', `${rs.kills}`);
    this.set('st-lost', `${rs.cropsLost}`);
    this.set('st-fed', `${rs.escapedFed}`);
    this.set('btn-pause', this.hooks.paused() ? 'Resume' : 'Pause');
    this.set('btn-speed', `Speed ${Math.min(2, this.hooks.speed())}×`);
    const clear = g.phase === 'round' && g.bunniesLeft() === 0 && this.hooks.speed() < 8;
    $('skip-row').hidden = !clear;
  }

  // ------------------------------------------------------------ almanac

  private updateInfo(): void {
    const g = this.game;
    let html = '';
    const item = this.hoverItem ?? (this.hoverTile < 0 ? this.selected : null);
    if (this.hoverButton && g.phase === 'planning') html = this.buttonInfo(this.hoverButton);
    else if (item) html = this.itemInfo(item);
    else if (this.hoverTile >= 0) html = this.tileInfo(this.hoverTile);
    if (!html) html = this.tip();
    this.set('info', html);
  }

  private itemInfo(item: ShopItem): string {
    if (item.type === 'remove') {
      return `<div class="title">Dig Up / Sell</div><p>Dig up a crop you planted today for a full refund, ` +
        `or sell a defense. Things bought today refund in full; used defenses sell for half, less wear.</p>` +
        `<p class="hint">Right-click a tile does the same.</p>`;
    }
    if (item.type === 'upgrade') {
      return `<div class="title">Upgrade</div><p>Click a defense to improve it, up to level ${MAX_LEVEL}: ` +
        `more range, faster, harder-hitting, sturdier.</p><p class="hint">Hover a defense with this tool to see the price.</p>`;
    }
    if (item.type === 'crop') {
      const c = CROPS[item.kind];
      const days = c.growTime <= ROUND_SECONDS ? '1 day' : `${Math.ceil(c.growTime / ROUND_SECONDS)} days`;
      return `<div class="title">${c.name} — ${c.seedCost}¢</div>` +
        `<div class="meta">Ripens in ${c.growTime}s (${days}) · sells ${c.sellValue}¢<br>` +
        `Toughness ${c.hp} · Bunnies: ${APPEAL(c.attract)}</div><p>${c.blurb}</p>`;
    }
    const d = DEFENSES[item.kind];
    return `<div class="title">${d.name} — ${d.cost}¢</div><div class="meta">${statLine(item.kind, 1)}</div><p>${d.blurb}</p>`;
  }

  private buttonInfo(key: string): string {
    const g = this.game;
    switch (key) {
      case 'expand': {
        const next = PLOT_LEVELS[g.plotLevel + 1];
        if (!next) return '<div class="title">Land</div><p>You own every acre there is.</p>';
        return `<div class="title">Buy Land — ${next.cost}¢</div><p>Grow your plot to ${next.size}×${next.size}. ` +
          'Everything you already have stays put.</p>';
      }
      case 'sling': {
        const next = SLING_LEVELS[g.slingLevel + 1];
        const cur = SLING_LEVELS[g.slingLevel];
        if (!next) return `<div class="title">${cur.name}</div><p>The finest sling in the county.</p>`;
        return `<div class="title">${next.name} — ${next.cost}¢</div><div class="meta">Reload ${cur.reload}s → ${next.reload}s · ` +
          `Damage ${cur.damage} → ${next.damage}</div><p>Upgrade your trusty sling.</p>`;
      }
      case 'repair':
        return `<div class="title">Repair All</div><p>Patch up every chewed defense. Costs half the price of what's missing.</p>`;
      case 'start':
        return `<div class="title">Start the Day</div><p>Crops grow while the sun is up and the bunnies come. ` +
          `At sundown you harvest everything that's ripe.</p><p class="hint"><span class="kbd">Space</span> also starts the day.</p>`;
      default:
        return '';
    }
  }

  private tileInfo(i: number): string {
    const g = this.game;
    const t = g.tiles[i];
    if (t.crop) {
      const c = CROPS[t.crop.kind];
      const pct = Math.min(100, Math.floor((t.crop.growth / c.growTime) * 100));
      const value = Math.max(1, Math.round(c.sellValue * (t.crop.hp / c.hp)));
      const status = pct >= 100 ? 'Ripe!' : `${pct}% grown`;
      const boost = g.growthMult[i] > 1 ? ' · watered' : '';
      return `<div class="title">${c.name}</div><div class="meta">${status}${boost}<br>` +
        `Health ${Math.ceil(t.crop.hp)}/${c.hp} · worth ${value}¢ when ripe</div>`;
    }
    if (t.structure) {
      const s = t.structure;
      const d = DEFENSES[s.kind];
      const st = defenseStats(s.kind, s.level);
      const hp = d.blocks ? `Sturdiness ${Math.ceil(s.hp)}/${st.hp}` : 'Armed';
      const sell = g.phase === 'planning' ? ` · sells for ${g.removeValue(i)}¢` : '';
      const next = s.level < MAX_LEVEL
        ? `<p><b>Level ${s.level + 1}</b> for ${upgradeCost(s.kind, s.level)}¢: ${statLine(s.kind, s.level + 1)}</p>`
        : '<p>Fully upgraded.</p>';
      return `<div class="title">${d.name} <span class="lv">${'★'.repeat(s.level)}</span></div>` +
        `<div class="meta">${statLine(s.kind, s.level)}<br>${hp}${sell}</div>${g.phase === 'planning' ? next : `<p>${d.blurb}</p>`}`;
    }
    if (g.phase === 'planning' && g.owns(i)) {
      return `<div class="title">Tilled Soil</div><p>Ready for seeds or a defense. (${tileX(i)}, ${tileY(i)})</p>`;
    }
    return '';
  }

  private tip(): string {
    const g = this.game;
    if (this.classic) return '<p>Lead the fast ones a little. Pop-ups duck back down after a moment, so be quick.</p>';
    switch (g.phase) {
      case 'planning':
        return this.selected
          ? '<p>Click your plot to place it. Drag to plant a row. Right-click to dig up or sell.</p>'
          : '<p>Pick seeds or a defense from the store, then click your plot.</p><p class="hint">Hover anything for details.</p>';
      case 'round':
        return '<p>Bunnies go for the tastiest crop they can reach. Bonk them before they eat their fill!</p>';
      case 'sundown':
        return '<p>Sundown! The bunnies are heading home.</p>';
      case 'harvest':
        return '<p>Harvest time. Ripe crops sell by how much of them is left.</p>';
      default:
        return '<p>Welcome back to the farm.</p>';
    }
  }

  // ------------------------------------------------------------ banner / toast

  banner(text: string, sub = '', seconds = 1.6): void {
    $('banner').innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    $('banner').classList.add('show');
    this.bannerTimer = seconds;
  }

  toast(text: string): void {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    this.toastTimer = 1.6;
  }

  // ------------------------------------------------------------ dialogs

  /** Close a side dialog (help, about, scores…). If the game is paused, go back to the Paused dialog. */
  private dismiss(): void {
    if (this.hooks.paused()) this.showPause();
    else this.closeModal();
  }

  closeModal(): void {
    this.modal = null;
    this.onModalKey = null;
    const layer = $('modal-layer');
    layer.classList.remove('open');
    layer.innerHTML = '';
  }

  /** Keyboard shortcuts for the open dialog (Enter / Escape). Returns true if handled. */
  modalKey(key: string): boolean {
    return this.onModalKey ? this.onModalKey(key) : false;
  }

  private open(name: string, html: string, actions: Record<string, () => void>, keys: Record<string, string> = {}): void {
    this.modal = name;
    const layer = $('modal-layer');
    layer.innerHTML = `<div class="dialog"><div class="inner">${html}</div></div>`;
    layer.classList.add('open');
    layer.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
      el.addEventListener('click', () => {
        this.hooks.unlockAudio();
        actions[el.dataset.act!]?.();
      });
    });
    this.onModalKey = (key) => {
      const act = keys[key];
      if (act && actions[act]) {
        actions[act]();
        return true;
      }
      return false;
    };
  }

  showTitle(): void {
    const best = this.hooks.best();
    const save = this.hooks.hasSave();
    this.open('title', `
      <div class="title-screen">
        <div id="logo-host"></div>
        <p class="tag">It's been years since the asteroid.<br>The bunnies never left… and some of them glow.</p>
        <div class="buttons">
          <button class="btn" data-act="help">How to Play</button>
          <button class="btn" data-act="scores">High Scores</button>
          <button class="btn" data-act="classic">Classic Mode</button>
          ${save ? '<button class="btn" data-act="new">New Game</button><button class="btn default" data-act="continue">Continue</button>'
            : '<button class="btn default" data-act="new">New Game</button>'}
        </div>
        ${best ? `<div class="best">Best farm: Day ${best.round} · ${best.score}¢ harvested</div>` : ''}
        <div class="credit">Bunny Killer II (1993) · Bunny Killer 3 (1994) · Modified Environments</div>
      </div>`, {
      help: () => this.showHelp(() => this.showTitle()),
      scores: () => this.showHighScores(() => this.showTitle()),
      classic: () => this.showClassicIntro(),
      new: () => (save ? this.confirmNewGame(() => this.showTitle()) : this.hooks.newGame()),
      continue: () => this.hooks.continueGame(),
    }, { Enter: save ? 'continue' : 'new' });
    $('logo-host').appendChild(makeLogo());
  }

  confirmNewGame(back?: () => void): void {
    if (!this.hooks.hasSave() || this.game.phase === 'gameover') {
      this.hooks.newGame();
      return;
    }
    this.open('confirm', `
      <div class="icon-row">${spriteImg(sprites().bunnies.mutant.frames[0], 1)}
      <div><h1>Start a new farm?</h1><p>Your current farm (Day ${this.game.round}) will be lost.</p></div></div>
      <div class="buttons"><button class="btn" data-act="cancel">Cancel</button><button class="btn default" data-act="ok">New Game</button></div>`, {
      cancel: () => (back ? back() : this.dismiss()),
      ok: () => this.hooks.newGame(),
    }, { Escape: 'cancel', Enter: 'ok' });
  }

  showHelp(back?: () => void): void {
    const resume = back ?? (() => this.dismiss());
    this.open('help', `
      <h1>How to Play</h1>
      <div class="help-cols">
        <div>
          <h2>Morning: plan</h2>
          <ul>
            <li>Buy seeds and click your plot to plant them.</li>
            <li>Buy defenses. They take up a tile too.</li>
            <li>Check the <b>Scouting Report</b> and the red arrows. That's where the bunnies will come from.</li>
          </ul>
          <h2>Day: defend</h2>
          <ul>
            <li>Crops grow while bunnies go for the tastiest one they can reach.</li>
            <li><b>Click a bunny</b> to hit it with your sling. Poof!</li>
            <li>Every bunny that gets home fed brings a friend tomorrow.</li>
          </ul>
        </div>
        <div>
          <h2>Evening: harvest</h2>
          <ul>
            <li>Ripe crops sell by how much of them is left.</li>
            <li>Unripe crops stay in the ground for tomorrow.</li>
            <li>Go broke with nothing growing and the farm is done.</li>
          </ul>
          <h2>Keys</h2>
          <ul>
            <li><span class="kbd">1</span>–<span class="kbd">6</span> seeds, <span class="kbd">Q</span>–<span class="kbd">Y</span> defenses, <span class="kbd">X</span> dig up/sell</li>
            <li><span class="kbd">Space</span> start the day / pause</li>
            <li><span class="kbd">F</span> fast-forward, <span class="kbd">M</span> sound, <span class="kbd">N</span> music</li>
            <li>Right-click digs up or sells; <span class="kbd">Esc</span> puts down the tool</li>
          </ul>
        </div>
      </div>
      <div class="buttons"><button class="btn default" data-act="ok">OK</button></div>`, { ok: resume }, { Enter: 'ok', Escape: 'ok' });
  }

  showAbout(): void {
    const back = this.modal === 'title' ? () => this.showTitle() : () => this.dismiss();
    this.open('about', `
      <div class="icon-row">${spriteImg(sprites().bunnies.common.frames[0], 3)}
      <div><h1>Bunny Killer 4</h1>
      <p>Version 0.1 (prototype)</p>
      <p>The follow-up to Bunny Killer II (1993) and Bunny Killer 3 (1994) for the Macintosh.</p>
      <p>Part farm, part tower defense, all bunny.</p></div></div>
      <div class="buttons"><button class="btn default" data-act="ok">OK</button></div>`, { ok: back }, { Enter: 'ok', Escape: 'ok' });
  }

  showPause(): void {
    this.open('pause', `
      <h1>Paused</h1><p>The bunnies are frozen mid-hop.</p>
      <div class="buttons"><button class="btn default" data-act="resume">Resume</button></div>`,
    { resume: () => this.hooks.togglePause() }, { Enter: 'resume', Escape: 'resume', p: 'resume', ' ': 'resume' });
  }

  showSummary(): void {
    const g = this.game;
    const rs = g.roundStats;
    const rows = CROP_ORDER.filter((k) => rs.harvested[k]).map((k) => {
      const h = rs.harvested[k]!;
      return `<tr><td>${spriteImg(sprites().crops[k].ripe, 1, 'vertical-align:middle')} ` +
        `${CROPS[k].name} ×${h.count}</td><td class="n">${h.value}¢</td></tr>`;
    });
    if (rs.bounty) rows.push(`<tr><td>Asteroid Buck bounty</td><td class="n">${rs.bounty}¢</td></tr>`);
    const earned = rs.harvestTotal + rs.bounty;
    const table = rows.length
      ? `<table>${rows.join('')}<tr class="total"><td>Total</td><td class="n">${earned}¢</td></tr></table>`
      : '<p>Nothing was ripe enough to sell today.</p>';
    const net = earned - rs.spent;
    const growing = g.cropCount();
    const lines = [
      `Bonked <b>${rs.kills}</b> ${rs.kills === 1 ? 'bunny' : 'bunnies'}.`,
      rs.cropsLost ? `<b>${rs.cropsLost}</b> ${rs.cropsLost === 1 ? 'crop was' : 'crops were'} eaten to the roots.` : 'Not a single crop lost!',
      rs.structuresBroken ? `<b>${rs.structuresBroken}</b> ${rs.structuresBroken === 1 ? 'defense was' : 'defenses were'} chewed to bits.` : '',
      rs.escapedFed
        ? `<b>${rs.escapedFed}</b> got away with full bellies. Expect <b>${Math.min(rs.escapedFed, BREED_CAP)}</b> extra bunnies tomorrow.`
        : 'No bunny got home with a full belly.',
      growing ? `${growing} ${growing === 1 ? 'crop is' : 'crops are'} still growing.` : '',
    ].filter(Boolean);
    this.open('summary', `
      <h1>Day ${g.round} is done</h1>
      <h2>Harvest</h2>${table}
      <p style="margin-top:8px">Spent today: ${rs.spent}¢ · Net: <b>${net >= 0 ? '+' : ''}${net}¢</b> · Bank: <b>${g.credits}¢</b></p>
      <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
      <div class="buttons"><button class="btn default" data-act="next">On to Day ${g.round + 1}</button></div>`,
    { next: () => this.hooks.nextDay() }, { Enter: 'next', ' ': 'next' });
  }

  showGameOver(rank = -1): void {
    const g = this.game;
    const days = g.round - 1;
    const headline = g.retired
      ? `<h1>You hung up your hat.</h1><p>After ${days} ${days === 1 ? 'day' : 'days'} on the farm, you retired to the porch. The bunnies throw a small party.</p>`
      : '<h1>The farm went bust.</h1><p>No crops in the ground and not enough credits for a single seed. The bunnies have won… this time.</p>';
    const placed = rank === 0 ? '<p><b>A new high score!</b></p>' : rank > 0 ? `<p>That's <b>#${rank + 1}</b> on your high score table.</p>` : '';
    this.open('gameover', `
      <div class="icon-row">${spriteImg(g.retired ? sprites().bunnies.common.frames[0] : sprites().bunnies.mutant.frames[0], g.retired ? 2 : 1.5)}
      <div>${headline}</div></div>
      <table>
        <tr><td>Days farmed</td><td class="n">${days}</td></tr>
        <tr><td>Bunnies bonked</td><td class="n">${g.stats.kills}</td></tr>
        <tr><td>Asteroid Bucks beaten</td><td class="n">${g.stats.bossesBeaten}</td></tr>
        <tr class="total"><td>Lifetime harvest (score)</td><td class="n">${g.stats.harvest}¢</td></tr>
      </table>
      ${placed}
      <div class="buttons"><button class="btn left" data-act="scores">High Scores</button><button class="btn" data-act="title">Title Screen</button><button class="btn default" data-act="new">New Game</button></div>`,
    {
      title: () => this.hooks.toTitle(),
      new: () => this.hooks.newGame(),
      scores: () => this.showHighScores(() => this.showGameOver(rank)),
    }, { Enter: 'new' });
  }

  showClassicIntro(): void {
    const best = this.hooks.classicBest();
    this.open('classic-intro', `
      <div class="icon-row">${spriteImg(sprites().bunnies.speedy.frames[4], 2)}
      <div><h1>Bunny Killer Classic</h1>
      <p>The old shooting gallery, back on the farm. Sixty seconds. Bunnies bolt across the field and pop out of burrows. Click to sling them.</p>
      <ul>
        <li>Hit five in a row for double points, ten for triple, twenty for quadruple.</li>
        <li>A miss resets your combo.</li>
        <li>Golden bunnies are worth 100.</li>
        <li><b>Don't hit the dog.</b></li>
      </ul>
      ${best ? `<p>Your best: <b>${best}</b></p>` : ''}</div></div>
      <div class="buttons"><button class="btn" data-act="back">Back</button><button class="btn default" data-act="go">Start</button></div>`, {
      back: () => this.showTitle(),
      go: () => this.hooks.startClassic(),
    }, { Enter: 'go', Escape: 'back' });
  }

  showClassicResults(c: Classic, record: boolean): void {
    const best = this.hooks.classicBest();
    this.open('classic-results', `
      <div class="icon-row">${spriteImg(sprites().golden.frames[0], 2)}
      <div><h1>Time's up!</h1>
      <table>
        <tr><td>Bunnies bonked</td><td class="n">${c.hits}</td></tr>
        <tr><td>Accuracy</td><td class="n">${Math.round(c.accuracy * 100)}%</td></tr>
        <tr><td>Best combo</td><td class="n">${c.bestCombo}</td></tr>
        <tr class="total"><td>Score</td><td class="n">${c.score}</td></tr>
      </table>
      <p>${record ? '<b>A new Classic record!</b>' : `Best: ${best}`}</p></div></div>
      <div class="buttons"><button class="btn" data-act="title">Title Screen</button><button class="btn default" data-act="again">Play Again</button></div>`, {
      title: () => this.hooks.quitClassic(),
      again: () => this.hooks.startClassic(),
    }, { Enter: 'again', Escape: 'title' });
  }

  showHighScores(back?: () => void): void {
    const list = this.hooks.scores();
    const rows = list.length
      ? list.map((e, n) => `<tr><td class="n">${n + 1}.</td><td class="n">${e.score}¢</td><td>${e.days} ${e.days === 1 ? 'day' : 'days'}` +
          `${e.retired ? ', retired' : ''}</td><td class="n">${e.kills} bonked</td><td class="n">${e.date}</td></tr>`).join('')
      : '<tr><td colspan="5"><p>No finished farms yet. Every run that ends, by bust or by retirement, lands here.</p></td></tr>';
    const done = back ?? (() => this.dismiss());
    this.open('scores', `
      <h1>High Scores</h1>
      <p>Your best farms, by lifetime harvest.</p>
      <table class="scores">${rows}</table>
      <div class="buttons"><button class="btn default" data-act="ok">OK</button></div>`, { ok: done }, { Enter: 'ok', Escape: 'ok' });
  }

  confirmRetire(): void {
    const g = this.game;
    if (g.phase !== 'planning') {
      this.toast('You can retire in the morning, before the day starts.');
      return;
    }
    this.open('retire', `
      <div class="icon-row">${spriteImg(sprites().bunnies.common.frames[0], 2)}
      <div><h1>Retire the farm?</h1><p>Your run ends here and goes on the high score table with ${g.stats.harvest}¢ harvested over ${g.round - 1} days.</p></div></div>
      <div class="buttons"><button class="btn" data-act="cancel">Keep Farming</button><button class="btn default" data-act="ok">Retire</button></div>`, {
      cancel: () => this.closeModal(),
      ok: () => this.hooks.retire(),
    }, { Escape: 'cancel', Enter: 'ok' });
  }
}

// A chunky 5x7 face for the title, in the spirit of Chicago.
const LOGO_FONT: Record<string, string[]> = {
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
};

/**
 * Draw logo lettering. Strokes are two cells wide for weight. `band` > 0 paints only the top rows,
 * which gives the letters a lighter highlight.
 */
function logoText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string, band: number): void {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text) {
    const g = LOGO_FONT[ch];
    if (!g) {
      cx += 4 * scale;
      continue;
    }
    g.forEach((row, ry) => {
      if (band > 0 && ry >= band) return;
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === '#') ctx.fillRect(cx + rx * scale, y + ry * scale, scale + Math.ceil(scale / 2), scale);
      }
    });
    cx += (g[0].length + 1.5) * scale;
  }
}

/** The title logo: pixel-font lettering over a little farm scene, drawn with the game's own sprites. */
function makeLogo(): HTMLCanvasElement {
  const W = 420;
  const H = 150;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // a dithered sky
  const sky = ['#6fbfee', '#8fd0f4', '#b3e1f8', '#d3effb'];
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < 118; y++) {
    const f = (y / 118) * 3;
    for (let x = 0; x < W; x++) {
      const k = Math.min(3, Math.floor(f + bayer[(y & 3) * 4 + (x & 3)] / 16));
      ctx.fillStyle = sky[k];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // rolling hills and the meadow
  for (let x = 0; x < W; x++) {
    const h1 = 96 + Math.sin(x / 38) * 6 + Math.sin(x / 13) * 2;
    const h2 = 108 + Math.sin(x / 27 + 2) * 4;
    ctx.fillStyle = '#7fb96a';
    ctx.fillRect(x, h1, 1, H - h1);
    ctx.fillStyle = '#5fa03c';
    ctx.fillRect(x, h2, 1, H - h2);
  }
  ctx.fillStyle = '#6fb244';
  ctx.fillRect(0, 124, W, H - 124);
  for (let x = 0; x < W; x += 3) {
    ctx.fillStyle = '#3f7a2b';
    ctx.fillRect(x + ((x * 7) % 2), 122 + ((x * 13) % 5), 1, 3);
  }
  // the asteroid, streaking in
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = k < 12 ? '#fff4c2' : k < 26 ? '#ffd08a' : '#ff9a4a';
    ctx.fillRect(398 - k * 2, 10 + k, 3, 2);
  }
  const rock = new PixelGrid(15, 15);
  rock.ellipse(7.5, 7.5, 7, 7, (x, y) => ((x * 3 + y) % 5 === 0 ? '#3a3f4a' : (x + y) % 4 === 0 ? '#6a717e' : '#555b66'));
  rock.set(5, 5, '#9dff6b');
  rock.set(8, 9, '#9dff6b');
  rock.set(9, 4, '#56d93e');
  ctx.drawImage(rock.outlined().canvas(), 392, 2);
  // lettering: a hard shadow, a dark outline, then the face with a highlight band
  const text = (t: string, x: number, y: number, scale: number, color: string, shine: string) => {
    logoText(ctx, t, x + 4, y + 4, scale, '#2a1b14', 0);
    for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      logoText(ctx, t, x + ox, y + oy, scale, '#2a1b14', 0);
    }
    logoText(ctx, t, x, y, scale, color, 0);
    logoText(ctx, t, x, y, scale, shine, 2);
  };
  text('BUNNY', 14, 10, 4, '#ffffff', '#fff4c2');
  text('KILLER', 14, 50, 4, '#ffffff', '#fff4c2');
  text('4', 170, 12, 11, '#e0457b', '#ff8fb1');
  // the cast
  const sp = sprites();
  const big = (img: Img, x: number, bottom: number) => ctx.drawImage(img, x, bottom - img.height * 2, img.width * 2, img.height * 2);
  big(sp.crops.carrot.ripe, 364, 140);
  big(sp.bunnies.fat.frames[0], 232, 142);
  big(sp.bunnies.common.frames[0], 310, 140);
  big(sp.bunnies.speedy.frames[4], 262, 84);
  return c;
}
