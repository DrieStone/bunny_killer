// The System 7 chrome around the farm: menubar, Farm Store, Almanac, and dialogs.
import {
  ANGER, BREED_CAP, BUNNIES, BUNNY_ORDER, CAP_RETRY, COMBO_TEXT, DAILY, CROP_ORDER, cropPlural, CROPS, type CropKind, DEFENSE_ORDER, DEFENSES,
  defenseStats, FARM, FARM_ORDER, type FarmUpgrade, firstRound, fruitsPerDay, HYBRID_GROWTH, HYBRID_LEVELS, HYBRID_VALUE, hybridCost,
  EVENTS, lotPrice, MARKET, MAX_LEVEL, type Mode, MODES, PERKS, SMOKE_BOMB, PROJECT, ripenDays, ROUND_SECONDS, SEASONS, TILL_COST, type Unlock, UNLOCK_RULE,
  unlockName, upgradeCost, WEAPON_LEVELS, WEAPON_ORDER, type WeaponKind, WEAPONS, weaponStats, WEATHER, yearOf,
} from '../config';
import type { Game } from '../game';
import { dataURL, farmIcon, farmMiniMap, iconURL, menuBunny, merchantCart, repairIcon, spriteImg, trophyIcon, weaponIcon } from '../render/icons';
import { PixelGrid } from '../render/pixels';
import { type Img, sprites } from '../render/sprites';
import { type Classic, CLASSIC_SECONDS } from '../classic';
import type { DailyResult, Guide, ScoreEntry } from '../save';
import { ACHIEVEMENTS, type Achievement } from '../achievements';
import type { ShopItem } from '../types';
import type { DefenseKind } from '../config';
import { FARMS, idx, inCrater, lotOfTile, MAP_ORDER, type MapKind, tileX, tileY } from '../world';

export interface UiHooks {
  newGame(mode?: Mode, map?: MapKind): void;
  lastFarm(): MapKind;
  hardOpen(): boolean; // Hard Mode opens once you've sealed the crater
  continueGame(): void;
  toTitle(): void;
  startDay(): void;
  nextDay(): void;
  togglePause(): void;
  toggleSpeed(): void;
  skipDay(): void;
  autoSkip(): boolean; // skip by itself whenever it's all clear
  setAutoSkip(on: boolean): void;
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
  keepFarming(): void;
  newDaily(): void;
  replayIntro(): void;
  achievements(): Record<string, string>;
  guide(): Guide;
  daily(): { key: string; number: number; map: MapKind; best: DailyResult | null; resumable: boolean };
}

/** Planning hotkeys: seeds on 1-9 and 0, defenses on Q W E R T Y and A S D, then the two tools. */
export const HOTKEYS: Record<string, ShopItem> = {
  ...Object.fromEntries(CROP_ORDER.map((kind, n) => ['1234567890'[n], { type: 'crop', kind }])),
  ...Object.fromEntries(DEFENSE_ORDER.map((kind, n) => ['qwertyasd'[n], { type: 'defense', kind }])),
  x: { type: 'remove' },
  u: { type: 'upgrade' },
  h: { type: 'till' },
  l: { type: 'land' },
  b: { type: 'smoke' },
};

const isTool = (item: ShopItem): item is Extract<ShopItem, { type: 'remove' | 'upgrade' | 'till' | 'land' | 'smoke' }> =>
  item.type === 'remove' || item.type === 'upgrade' || item.type === 'till' || item.type === 'land' || item.type === 'smoke';
const TOOL_NAMES = { remove: 'Dig / Sell', upgrade: 'Upgrade', till: 'Hoe', land: 'Buy Land', smoke: 'Smoke Bomb' };

type Tab = 'seeds' | 'defense' | 'weapons' | 'lab' | 'farm';
const TABS: [Tab, string][] = [['seeds', 'Seeds'], ['defense', 'Defense'], ['weapons', 'Weapons'], ['lab', 'Lab'], ['farm', 'Farm']];

/** "★★★☆☆" */
const stars = (level: number, max: number) => '★'.repeat(level) + '☆'.repeat(Math.max(0, max - level));

/** What a weapon does at a level, in a line. */
function weaponLine(kind: WeaponKind, level: number): string {
  const st = weaponStats(kind, Math.max(1, level));
  const bits: string[] = [];
  if (kind === 'hose') bits.push(`Spray ${st.radius.toFixed(1)}`, st.damage ? `${st.damage}/s` : 'no damage');
  else {
    bits.push(`Reload ${st.reload.toFixed(2).replace(/0$/, '')}s`, `Dmg ${st.damage}`);
    if (WEAPONS[kind].splash) bits.push(`Splash ${st.radius.toFixed(1)}`);
    if (st.spread) bits.push(`Spread ${st.spread.toFixed(2)}`);
  }
  return bits.join(' · ');
}

const keyOf = (item: ShopItem) => (isTool(item) ? item.type : `${item.type}:${item.kind}`);
const hotkeyOf = (item: ShopItem) => Object.entries(HOTKEYS).find(([, v]) => keyOf(v) === keyOf(item))?.[0] ?? '';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** "Range 3 · Every 2.1s · Damage 2" for a defense at a level. */
function statLine(kind: DefenseKind, level: number): string {
  const d = DEFENSES[kind];
  const st = defenseStats(kind, level);
  const bits: string[] = [];
  if (st.radius >= 1) bits.push(`${kind === 'decoy' ? 'Pulls from' : 'Range'} ${st.radius.toFixed(1).replace(/\.0$/, '')}`);
  if (st.period > 0 && kind !== 'fence') bits.push(kind === 'trap' ? `Re-arms ${st.period.toFixed(1)}s` : `Every ${st.period.toFixed(1)}s`);
  if (st.damage > 0) bits.push(`Damage ${st.damage}`);
  if (d.blocks) bits.push(`Sturdiness ${st.hp}`);
  if (kind === 'decoy') bits.push(`Lasts ${st.hp} bites`);
  if (st.shock > 0) bits.push(`Zaps ${st.shock}/s`);
  return bits.join(' · ');
}

const WEATHER_ICON: Record<string, string> = { sunny: '☀︎', rain: '☂︎', fog: '≋', snow: '❄︎' };

/** One line for today's event, for the Scouting Report. */
function eventLine(g: Game): string {
  const e = g.event!;
  switch (e.kind) {
    case 'fair': return `<b>County Fair:</b> ${cropPlural(e.crop!)} sell ×${EVENTS.fairMult} tonight!`;
    case 'hail': return g.farm.greenhouse ? '<b>Hail</b> coming; the greenhouse covers the crops.' : '<b>Hail</b> coming: rough on crops, easy shots.';
    case 'drought': return '<b>Drought:</b> only watered crops grow full speed.';
    case 'merchant': return '<b>A merchant</b> is by the farm: click the cart!';
  }
}

const plural = (name: string) => (name.endsWith('y') && !name.endsWith('ey') ? `${name.slice(0, -1)}ies` : `${name}s`);

const APPEAL = (a: number) => (a >= 2 ? 'irresistible' : a >= 1.3 ? 'loves it' : a >= 0.8 ? 'likes it' : 'meh');

const unlockOf = (item: ShopItem): Unlock | null =>
  item.type === 'crop' || item.type === 'defense' ? item.kind : item.type === 'upgrade' ? 'upgrade2'
    : item.type === 'land' || item.type === 'smoke' ? item.type : null;

/** A goal short enough for a store shelf: "Day 3", "50 bonks", "Earn 1,000¢", "Beat a Buck". */
function goalShort(what: Unlock): string {
  const r = UNLOCK_RULE[what];
  if (!r) return '';
  switch (r.goal) {
    case 'day': return `Day ${r.n}`;
    case 'bonks': return `${r.n} bonks`;
    case 'harvest': return `Earn ${r.n.toLocaleString('en-US')}¢`;
    case 'bucks': return r.n === 1 ? 'Beat a Buck' : `Beat ${r.n} Bucks`;
  }
}

const money = (n: number) => `${Math.round(n).toLocaleString('en-US')}¢`;

export class UI {
  selected: ShopItem | null = null;
  classic: Classic | null = null;
  hoverTile = -1;
  private hoverItem: ShopItem | null = null;
  private hoverButton: string | null = null;
  private memo = new Map<string, string>();
  private itemEls = new Map<string, HTMLElement>();
  private items = new Map<string, ShopItem>();
  private tab: Tab = 'seeds';
  private hoverRow: string | null = null; // a weapon, lab or farm row under the mouse
  private bannerTimer = 0;
  private toastTimer = 0;
  private modal: string | null = null;
  private onModalKey: ((key: string) => boolean) | null = null;
  private awards: Achievement[] = []; // waiting to pop up
  private awardTimer = 0;
  private clearShown = false; // the all-clear box is up
  private clearDismissed = false; // "Keep Watching": not again today

  constructor(private game: Game, private hooks: UiHooks) {
    this.buildMenubar();
    this.buildStore();
    this.buildAllClear();
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
      case 'intro': this.hooks.replayIntro(); break;
      case 'autoskip': this.hooks.setAutoSkip(!this.hooks.autoSkip()); break;
      case 'daily': this.showDailyIntro(this.modal === 'title' ? () => this.showTitle() : undefined); break;
      case 'guide': this.showGuide(this.modal === 'title' ? () => this.showTitle() : undefined); break;
      case 'achievements': this.showAchievements(this.modal === 'title' ? () => this.showTitle() : undefined); break;
    }
  }

  // ------------------------------------------------------------ store

  private buildStore(): void {
    const g = this.game;
    const store = $('store');
    store.innerHTML = `
      <div id="plan-panel" class="panel">
        <div class="money"><span class="credits" id="credits"></span><span class="day" id="day-label"></span></div>
        <button class="btn crater" id="btn-project"></button>
        <div class="group scout"><span class="legend">Scouting Report</span><div id="scout"></div></div>
        <div class="tabs" id="store-tabs">${TABS.map(([t, label]) => `<button class="tab" data-tab="${t}">${label}<i></i></button>`).join('')}</div>
        <div class="scroll tabbox">
          <div class="page" data-page="seeds"><div class="order-note" id="order-note" hidden></div>
            <div class="items" id="seed-items"></div><div class="items tools" id="seed-tools"></div></div>
          <div class="page" data-page="defense"><div class="items" id="def-items"></div><div class="items tools" id="tool-items"></div></div>
          <div class="page" data-page="weapons"><div id="weapon-rows"></div>
            <p class="hint">During the day, <span class="kbd">1</span>–<span class="kbd">5</span> or the mouse wheel switch weapons.</p></div>
          <div class="page" data-page="lab"><p class="note" id="lab-note"></p><div class="items" id="lab-items"></div></div>
          <div class="page" data-page="farm">
            <div class="items tools first" id="farm-tools"></div>
            <div id="farm-rows"></div>
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
        <div style="margin-top:8px"><b id="sun-label">Daylight</b></div>
        <div class="progress sun"><div id="sunbar"></div></div>
        <div class="weapon-bar" id="weapon-bar"></div>
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
        <p class="hint">Click a bunny to fire. Hit a dirt mound to startle a Burrower out.<br>
          <span class="kbd">1</span>–<span class="kbd">5</span> weapons &nbsp; <span class="kbd">P</span> pause &nbsp; <span class="kbd">F</span> speed &nbsp; <span class="kbd">M</span> sound</p>
      </div>`;
    const addItems = (host: HTMLElement, items: ShopItem[]) => {
      for (const item of items) {
        const el = document.createElement('div');
        el.className = 'item';
        const name = item.type === 'crop' ? CROPS[item.kind].name : item.type === 'defense' ? DEFENSES[item.kind].name : TOOL_NAMES[item.type];
        const icon = iconURL(isTool(item) ? item.type : item.kind);
        const price = item.type === 'remove' ? 'refunds' : item.type === 'upgrade' ? 'defenses' : `${g.itemCost(item)}¢`;
        el.innerHTML = `<img src="${icon}" alt=""><span class="name">${name}</span>` +
          `<span class="cost">${price}</span><span class="hot">${hotkeyOf(item).toUpperCase()}</span><span class="badge">NEW</span>` +
          (item.type === 'crop' ? '<span class="days"></span>' : '');
        el.dataset.balloon = item.type === 'crop' ? `<b>${name}.</b> ${CROPS[item.kind].blurb}`
          : item.type === 'defense' ? `<b>${name}.</b> ${DEFENSES[item.kind].blurb}`
          : item.type === 'remove' ? '<b>Dig / Sell.</b> Click something on your land to dig it up or sell it.'
          : item.type === 'till' ? '<b>Hoe.</b> Till your grass into a seedbed. Crops only grow in tilled soil. Drag to till a row.'
          : item.type === 'land' ? '<b>Buy Land.</b> Click a lot for sale to buy it, or drag across several. It comes as grass: till it to plant, or build on it.'
          : item.type === 'smoke' ? '<b>Smoke Bomb.</b> Throw it into the crater and an Asteroid Buck comes out today. Beat it to move the Crater Project along sooner.'
          : `<b>Upgrade.</b> Click a defense to make it better, up to ${MAX_LEVEL} stars.`;
        el.addEventListener('click', () => {
          this.hooks.unlockAudio();
          this.pick(item);
        });
        el.addEventListener('mouseenter', () => { this.hoverItem = item; });
        el.addEventListener('mouseleave', () => { this.hoverItem = null; });
        host.appendChild(el);
        this.itemEls.set(keyOf(item), el);
        this.items.set(keyOf(item), item);
      }
    };
    addItems($('seed-items'), CROP_ORDER.map((kind) => ({ type: 'crop', kind })));
    addItems($('def-items'), DEFENSE_ORDER.map((kind) => ({ type: 'defense', kind })));
    addItems($('tool-items'), [{ type: 'remove' }, { type: 'upgrade' }]);
    // Repair All sits with the other defense tools, but it works right away: nothing to click on the field
    const repair = document.createElement('div');
    repair.className = 'item';
    repair.id = 'repair-cell';
    repair.innerHTML = `<img src="${dataURL(repairIcon())}" alt=""><span class="name">Repair All</span><span class="cost"></span>`;
    repair.dataset.balloon = '<b>Repair All.</b> Patch up every chewed defense at once.';
    repair.addEventListener('click', () => {
      this.hooks.unlockAudio();
      if (g.repairAll()) this.hooks.changed();
    });
    repair.addEventListener('mouseenter', () => { this.hoverButton = 'repair'; });
    repair.addEventListener('mouseleave', () => { this.hoverButton = null; });
    $('tool-items').appendChild(repair);
    addItems($('seed-tools'), [{ type: 'till' }]);
    addItems($('farm-tools'), [{ type: 'land' }, { type: 'smoke' }]);
    this.buildShopRows();
    WEAPON_ORDER.forEach((k, n) => {
      const b = document.createElement('button');
      b.className = 'wpn';
      b.dataset.weapon = k;
      b.innerHTML = `<img src="${dataURL(weaponIcon(k))}" alt=""><span class="key">${n + 1}</span><span class="cd"></span>`;
      b.dataset.balloon = `<b>${WEAPONS[k].name}.</b> ${WEAPONS[k].blurb}`;
      b.addEventListener('click', () => {
        this.hooks.unlockAudio();
        this.game.selectWeapon(k);
      });
      b.addEventListener('mouseenter', () => { this.hoverRow = `weapon:${k}`; });
      b.addEventListener('mouseleave', () => { this.hoverRow = null; });
      $('weapon-bar').appendChild(b);
    });
    $('store-tabs').addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('.tab')?.dataset.tab as Tab | undefined;
      if (t) this.showTab(t);
    });
    this.showTab('seeds');

    const button = (id: string, fn: () => void, hoverKey: string) => {
      const b = $<HTMLButtonElement>(id);
      b.addEventListener('click', () => {
        this.hooks.unlockAudio();
        fn();
      });
      b.addEventListener('mouseenter', () => {
        this.hoverButton = hoverKey;
      });
      b.addEventListener('mouseleave', () => {
        this.hoverButton = null;
      });
    };
    button('btn-project', () => this.fundProject(), 'project');
    $('order-note').addEventListener('mouseenter', () => { this.hoverButton = 'order'; });
    $('order-note').addEventListener('mouseleave', () => { this.hoverButton = null; });
    button('btn-start', () => this.hooks.startDay(), 'start');
    button('btn-pause', () => this.hooks.togglePause(), 'pause');
    button('btn-speed', () => this.hooks.toggleSpeed(), 'speed');
    button('btn-skip', () => this.hooks.skipDay(), 'skip');
    button('btn-cl-quit', () => this.hooks.quitClassic(), 'quit');
    const explain: Record<string, string> = {
      'btn-project': 'The Crater Project: seal the crater to win. Three stages, each opened by beating Asteroid Bucks.',
      'btn-start': 'Start the day. Crops grow and bunnies come until sundown.',
      'btn-pause': 'Freeze the action. Space or P does it too.',
      'btn-speed': 'Speed up the day: 1×, 2×, then 4×. F does it too.',
      'btn-skip': 'No bunnies left: let the crops finish the day at high speed.',
    };
    for (const [id, text] of Object.entries(explain)) $(id).dataset.balloon = text;
    document.querySelector<HTMLElement>('.scout')!.dataset.balloon =
      'What\'s coming today: how many bunnies, what kinds, and the weather. Tags on the burrows around the field show how many come out of each.';
    $('farm-win').dataset.balloon = 'Your farm. Plant and build here in the morning; click bunnies to sling them during the day.';
    $('info-win').dataset.balloon = 'The Almanac describes whatever you point at.';
  }

  // ------------------------------------------------------------ all clear

  /** The box over the farm once the day's bunnies are dealt with: skip to sundown, or keep watching. */
  private buildAllClear(): void {
    $('ac-skip').addEventListener('click', () => {
      this.hooks.unlockAudio();
      this.hooks.skipDay();
    });
    $('ac-stay').addEventListener('click', () => { this.clearDismissed = true; });
    $<HTMLInputElement>('ac-always').addEventListener('change', (e) => this.hooks.setAutoSkip((e.target as HTMLInputElement).checked));
  }

  /** While the all-clear box is up, Enter skips and Escape keeps watching. Returns true if handled. */
  allClearKey(key: string): boolean {
    if (!this.clearShown) return false;
    if (key === 'Enter') this.hooks.skipDay();
    else if (key === 'Escape') this.clearDismissed = true;
    else return false;
    return true;
  }

  private updateAllClear(): void {
    const g = this.game;
    if (g.phase !== 'round') this.clearDismissed = false;
    const offer = !this.classic && g.allClear() && this.hooks.speed() < 8 && !this.clearDismissed && !this.hooks.autoSkip() &&
      !this.hooks.paused();
    if (offer !== this.clearShown) {
      this.clearShown = offer;
      $('all-clear').hidden = !offer;
      $<HTMLInputElement>('ac-always').checked = this.hooks.autoSkip();
    }
    if (offer) {
      const n = g.bunnies.filter((b) => !b.dead && !b.gone).length;
      this.set('ac-text', (n ? `No more bunnies are coming, and the last ${n === 1 ? 'one is' : `${n} are`} heading home.`
        : 'Every bunny today has been dealt with.') + ' Skip ahead to sundown? Your crops grow just the same.');
    }
    const check = $('mi-autoskip');
    if (check.classList.contains('checked') !== this.hooks.autoSkip()) check.classList.toggle('checked');
  }

  select(item: ShopItem | null): void {
    this.selected = item;
    for (const [k, el] of this.itemEls) el.classList.toggle('selected', !!item && keyOf(item) === k);
    if (item) this.showTab(item.type === 'crop' || item.type === 'till' ? 'seeds' : item.type === 'land' || item.type === 'smoke' ? 'farm' : 'defense');
  }

  showTab(t: Tab): void {
    this.tab = t;
    document.querySelectorAll<HTMLElement>('#store-tabs .tab').forEach((el) => el.classList.toggle('on', el.dataset.tab === t));
    document.querySelectorAll<HTMLElement>('#plan-panel .page').forEach((el) => { el.hidden = el.dataset.page !== t; });
  }

  /** The weapon shop, the Seed Lab, and the farm upgrades: one row (or card) each. */
  private buildShopRows(): void {
    const g = this.game;
    const row = (host: HTMLElement, key: string, icon: string, name: string, onBuy: () => boolean) => {
      const el = document.createElement('div');
      el.className = 'shoprow';
      el.innerHTML = `<img src="${icon}" alt=""><div class="info"><span class="name">${name}</span> <span class="lv"></span>` +
        `<div class="desc"></div></div><button class="btn buy"></button><span class="badge">NEW</span>`;
      el.querySelector('.buy')!.addEventListener('click', () => {
        this.hooks.unlockAudio();
        if (onBuy()) this.hooks.changed();
      });
      el.addEventListener('mouseenter', () => { this.hoverRow = key; });
      el.addEventListener('mouseleave', () => { this.hoverRow = null; });
      el.dataset.key = key;
      host.appendChild(el);
    };
    for (const k of WEAPON_ORDER) row($('weapon-rows'), `weapon:${k}`, dataURL(weaponIcon(k)), WEAPONS[k].name, () => g.buyWeapon(k));
    for (const k of FARM_ORDER) row($('farm-rows'), `farm:${k}`, dataURL(farmIcon(k)), FARM[k].name, () => g.buyFarm(k));
    // the Seed Lab: a card per crop, like the seed shelf
    for (const k of CROP_ORDER) {
      const el = document.createElement('div');
      el.className = 'item lab';
      el.innerHTML = `<img src="${iconURL(k)}" alt=""><span class="name">${CROPS[k].name}</span><span class="cost"></span>`;
      el.addEventListener('click', () => {
        this.hooks.unlockAudio();
        if (g.breed(k)) this.hooks.changed();
      });
      el.addEventListener('mouseenter', () => { this.hoverRow = `lab:${k}`; });
      el.addEventListener('mouseleave', () => { this.hoverRow = null; });
      el.dataset.key = `lab:${k}`;
      $('lab-items').appendChild(el);
    }
  }

  /** Keep the weapon, lab and farm rows' prices, levels and locks current. */
  private updateShopRows(): void {
    const g = this.game;
    const fresh = new Set<string>(g.newUnlocks);
    const visible = (t: Tab) => this.tab === t;
    const setRow = (key: string, level: string, desc: string, price: string, can: boolean, locked: boolean, isNew: boolean) => {
      const el = document.querySelector<HTMLElement>(`.shoprow[data-key="${key}"]`)!;
      el.classList.toggle('locked', locked);
      el.classList.toggle('new', isNew);
      this.set(`${key}-lv`, level, el.querySelector<HTMLElement>('.lv')!);
      this.set(`${key}-desc`, desc, el.querySelector<HTMLElement>('.desc')!);
      this.set(`${key}-buy`, price, el.querySelector<HTMLElement>('.buy')!);
      const b = el.querySelector<HTMLButtonElement>('.buy')!;
      if (b.disabled !== !can) b.disabled = !can;
    };
    for (const k of visible('weapons') ? WEAPON_ORDER : []) {
      const level = g.weapons[k];
      const lock = k === 'sling' ? null : g.lockReason(k);
      const price = g.weaponPrice(k);
      const label = lock ? goalShort(k as Unlock) : price === null ? 'Max' : `${level ? '▲' : 'Buy'} ${money(price)}`;
      const inHand = level > 0 && g.weapon === k ? ' · <b>in hand</b>' : '';
      setRow(`weapon:${k}`, level ? stars(level, WEAPON_LEVELS) : '', `${weaponLine(k, level || 1)}${inHand}`, label,
        g.weaponProblem(k) === null, !!lock, fresh.has(k));
    }
    for (const k of visible('farm') ? FARM_ORDER : []) {
      const level = g.farm[k];
      const lock = g.lockReason(k);
      const price = g.farmPrice(k);
      const max = FARM[k].costs.length;
      setRow(`farm:${k}`, max > 1 ? stars(level, max) : level ? '✓' : '', FARM[k].blurb,
        lock ? goalShort(k) : price === null ? 'Done' : money(price), g.farmProblem(k) === null, !!lock, fresh.has(k));
    }
    const labLock = g.lockReason('lab');
    this.set('lab-note', labLock ? `<b>Locked.</b> ${labLock}` :
      `Breed a better strain: each level grows ${Math.round(HYBRID_GROWTH * 100)}% faster and sells ${Math.round(HYBRID_VALUE * 100)}% higher.`);
    for (const k of visible('lab') ? CROP_ORDER : []) {
      const el = document.querySelector<HTMLElement>(`.item.lab[data-key="lab:${k}"]`)!;
      const lock = labLock ?? g.lockReason(k);
      const price = hybridCost(k, g.hybrid[k]);
      el.classList.toggle('locked', !!lock);
      el.classList.toggle('poor', !lock && price !== null && g.credits < price);
      const text = lock ? (labLock ? stars(0, HYBRID_LEVELS) : goalShort(k)) : `${stars(g.hybrid[k], HYBRID_LEVELS)} ${price === null ? 'max' : money(price)}`;
      this.set(`lab:${k}-cost`, text, el.querySelector<HTMLElement>('.cost')!);
    }
    // a dot on any tab with something new in it today
    const tabNew: Record<Tab, boolean> = {
      seeds: CROP_ORDER.some((k) => fresh.has(k)),
      defense: DEFENSE_ORDER.some((k) => fresh.has(k)) || [...fresh].some((u) => u.startsWith('upgrade')),
      weapons: WEAPON_ORDER.some((k) => fresh.has(k)),
      lab: fresh.has('lab'),
      farm: FARM_ORDER.some((k) => fresh.has(k)) || fresh.has('land') || fresh.has('smoke'),
    };
    document.querySelectorAll<HTMLElement>('#store-tabs .tab').forEach((el) => el.classList.toggle('new', tabNew[el.dataset.tab as Tab]));
  }

  /** Pick up a store item, or put it back down if it's already in hand. Locked items say what opens them. */
  pick(item: ShopItem): void {
    const lock = this.game.itemLock(item);
    if (lock) {
      this.game.emit({ t: 'error', msg: lock });
      return;
    }
    this.select(this.selected && keyOf(this.selected) === keyOf(item) ? null : item);
  }

  private fundProject(): void {
    const g = this.game;
    const problem = g.projectProblem();
    if (problem) {
      g.emit({ t: 'error', msg: problem });
      return;
    }
    if (g.project < PROJECT.length - 1) {
      if (g.fundProject()) {
        this.hooks.changed();
        this.banner(PROJECT[g.project - 1].name, 'The crater rumbles. It did not like that.', 2.2);
      }
      return;
    }
    this.confirmCap();
  }

  // ------------------------------------------------------------ per-frame refresh

  /** Write text only when it changed, to keep the DOM quiet. */
  private set(id: string, html: string, el: HTMLElement = $(id)): void {
    if (this.memo.get(id) === html) return;
    this.memo.set(id, html);
    el.innerHTML = html;
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
    this.set('farm-title', classic ? 'Bunny Killer Classic' : g.phase === 'title' ? 'Bunny Killer 4'
      : g.daily ? `Bunny Killer 4 — Daily #${g.dailyNumber} · Day ${g.round} of ${DAILY.days}`
        : `Bunny Killer 4 — Day ${g.round}${g.mode === 'hard' ? ' (Hard)' : ''}`);
    this.set('mb-clock', this.clockText());
    this.set('mi-mute', this.hooks.muted() ? 'Sound On' : 'Sound Off');
    this.set('mi-music', this.hooks.musicMuted() ? 'Music On' : 'Music Off');
    this.set('mi-balloons', this.hooks.balloonsOn() ? 'Hide Balloons' : 'Show Balloons');
    const spd = this.hooks.speed();
    this.set('mi-speed', spd === 1 ? 'Fast Forward (2×)' : spd === 2 ? 'Faster (4×)' : 'Normal Speed');

    this.updateAllClear();
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
    if (this.awardTimer > 0 && (this.awardTimer -= dt) <= 0) this.nextAward();
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
        const start = g.lastNight ? 20 : 6; // The Last Night runs 8 PM to 6 AM
        const mins = (start * 60 + Math.floor((g.time / ROUND_SECONDS) * (g.lastNight ? 10 : 14) * 60)) % (24 * 60);
        const h = Math.floor(mins / 60);
        const m = Math.floor(mins % 60 / 15) * 15;
        const h12 = ((h + 11) % 12) + 1;
        return `${when} · ${h12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
      }
      case 'sundown': return `${when} · ${g.lastNight ? 'Dawn' : 'Sundown'}`;
      case 'harvest':
      case 'summary': return `${when} · Evening`;
      case 'victory': return 'Crater sealed';
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
      const item = this.items.get(k)!;
      const what = unlockOf(item);
      const locked = !!g.itemLock(item);
      el.classList.toggle('locked', locked);
      el.classList.toggle('new', !!what && g.newUnlocks.includes(what));
      const idle = item.type === 'smoke' && !locked && !!g.smokeProblem();
      el.classList.toggle('poor', idle || (!locked && g.credits < g.itemCost(item) && item.type !== 'remove' && item.type !== 'upgrade'));
      let price = item.type === 'remove' ? 'refunds' : item.type === 'upgrade' ? 'defenses'
        : item.type === 'till' ? `${TILL_COST}¢ a tile` : item.type === 'land' ? `${g.itemCost(item)}¢ a lot` : `${g.itemCost(item)}¢`;
      if (locked && what) price = goalShort(what);
      else if (item.type === 'smoke' && g.smoked) price = 'smoking…';
      else if (item.type === 'smoke' && (g.isBossDay() || g.lastNight)) price = 'Buck today';
      else if (item.type === 'crop') {
        const trend = g.priceTrend(item.kind);
        const arrow = trend >= 1.08 ? '↑' : trend <= 0.92 ? '↓' : '';
        price = `${g.itemCost(item)}¢ <span class="sell">▸${Math.round(g.cropPrice(item.kind))}¢${arrow}</span>`;
      }
      this.set(`${k}-cost`, price, el.querySelector<HTMLElement>('.cost')!);
      if (item.type === 'crop') this.updateDays(k, el, locked ? null : item.kind);
    }
    const rep = g.repairCost();
    const cell = $('repair-cell');
    cell.classList.toggle('locked', rep === 0);
    cell.classList.toggle('poor', rep > 0 && g.credits < rep);
    this.set('repair-cost', rep === 0 ? 'all fixed' : `${rep}¢ for ${g.chewedCount()}`, cell.querySelector<HTMLElement>('.cost')!);
    this.updateProject();
    this.updateShopRows();
    const counts = g.waveCounts();
    const total = g.waveTotal();
    const kinds = BUNNY_ORDER.filter((k) => counts[k])
      .map((k) => `<span class="kind" title="${BUNNIES[k].name}">${spriteImg(sprites().bunnies[k].frames[0], k === 'mutant' ? 0.5 : 1)}×${counts[k]}</span>`)
      .join('');
    const breed = g.breedBonus > 0 ? ` ${g.breedBonus} are babies of yesterday's escapees.` : '';
    const boss = g.lastNight ? '' : counts.mutant
      ? `<br><b>${g.smoked ? 'You smoked an Asteroid Buck out of the crater!' : 'An Asteroid Buck is climbing out of the crater today!'}</b>` : '';
    const fromCrater = g.project * ANGER.craterBunnies;
    // only the newest arrival gets introduced, so the report stays short
    const met = (k: (typeof BUNNY_ORDER)[number]) => BUNNIES[k].boss && g.stats.bossesBeaten > 0; // a smoked-out Buck isn't news
    const newest = BUNNY_ORDER.filter((k) => counts[k] && k !== 'common' && !met(k) && g.round - firstRound(k, g.mode) < 3)
      .sort((a, b) => firstRound(b, g.mode) - firstRound(a, g.mode))[0];
    const newcomers = newest ? `<div class="newcomer"><b>New: ${BUNNIES[newest].name}.</b> ${BUNNIES[newest].blurb}</div>` : '';
    const night = g.lastNight
      ? `<div class="alarm"><b>THE LAST NIGHT.</b> ${g.lastNightBucks} Asteroid Bucks climb out of the crater tonight. ` +
        'Bonk every one before dawn and the crater is sealed for good.</div>' : '';
    const w = WEATHER[g.weather];
    const season = SEASONS[g.season];
    const firstOfSeason = (g.round - 1) % 7 === 0 && g.round > 1;
    // today's event takes the weather's line (the weather's own blurb can wait)
    const forecast = `<div class="forecast"><span class="wx">${WEATHER_ICON[g.weather]}</span> <b>${w.name}.</b> ` +
      `${g.event ? eventLine(g) : g.weather === 'sunny' ? '' : w.blurb}` +
      `${firstOfSeason || g.round === 1 ? ` <i>${season.name}: ${season.blurb}</i>` : ''}</div>`;
    const where = fromCrater > 0 ? `${g.burrows.length} burrows and the crater` : `${g.burrows.length} burrows`;
    this.set('scout', `${night}${forecast}<b>${total}</b> bunnies from ${where}.` +
      `${breed}${boss}<div class="kinds">${kinds}</div>${newcomers}`);
    // the County Fair's crop, picked out on the shelf
    const fair = g.event?.kind === 'fair' ? g.event.crop : undefined;
    for (const k of CROP_ORDER) {
      const cell = this.itemEls.get(`crop:${k}`);
      if (cell && cell.classList.contains('fair') !== (fair === k)) cell.classList.toggle('fair');
    }
    // an order from town, pinned at the top of the Seeds tab, with its seed picked out on the shelf
    const o = g.order;
    const note = $('order-note');
    if (note.hidden !== !o) note.hidden = !o;
    if (o) {
      this.set('order-note', `<b>Order:</b> ${o.want} ${cropPlural(o.kind, o.want)} by ${o.due === g.round ? 'tonight' : `Day ${o.due}`} ` +
        `<span class="got">· ${o.got}/${o.want} ·</span> <b>+${o.bonus}¢</b>`);
    }
    for (const k of CROP_ORDER) {
      const cell = this.itemEls.get(`crop:${k}`);
      if (cell && cell.classList.contains('ordered') !== (o?.kind === k)) cell.classList.toggle('ordered');
    }
    const noCrops = g.cropCount() === 0;
    const cheapest = Math.min(...CROP_ORDER.filter((k) => g.isUnlocked(k)).map((k) => CROPS[k].seedCost));
    const broke = noCrops && g.credits < cheapest;
    $<HTMLButtonElement>('btn-start').disabled = noCrops;
    this.set('btn-start', broke ? 'Sell a defense to buy seeds' : noCrops ? 'Plant something first'
      : g.lastNight ? 'Begin the Last Night ▸' : 'Start the Day ▸');
  }

  /**
   * The corner of a seed on the shelf: how many days it takes today ("2d"), or how many fruit a day ("×2"), when
   * that's worth knowing. Green when growing fast has bought a day or a fruit; red when the weather costs one.
   */
  private updateDays(key: string, el: HTMLElement, kind: CropKind | null): void {
    let text = '';
    let cls = 'days';
    if (kind) {
      const speed = this.game.growthToday(kind);
      const days = ripenDays(kind, speed);
      const normal = ripenDays(kind);
      const fruit = fruitsPerDay(kind, speed);
      if (fruit > 1) {
        text = `×${fruit}`;
        cls += ' up';
      } else if (days > 1 || days !== normal) {
        text = `${days}d`;
        if (days !== normal) cls += days < normal ? ' up' : ' down';
      }
    }
    const tag = el.querySelector<HTMLElement>('.days')!;
    if (tag.className !== cls) tag.className = cls;
    this.set(`${key}-days`, text, tag);
  }

  /** The Crater Project button: how far along it is, and what the next stage needs. */
  private updateProject(): void {
    const g = this.game;
    const stage = PROJECT[g.project];
    const pips = PROJECT.map((_, n) => `<span class="pip${n < g.project ? ' done' : ''}"></span>`).join('');
    let label: string;
    if (g.lastNight) label = '<b>The Last Night</b> · tonight';
    else if (!stage) label = '<b>Sealed</b>';
    else if (g.stats.bossesBeaten < stage.bucks) {
      label = `<b>${stage.name}</b> · Bucks ${g.stats.bossesBeaten}/${stage.bucks}`;
    } else label = `<b>${stage.name}</b> · ${money(g.projectCost() ?? 0)}`;
    this.set('btn-project', `<span class="pips">${pips}</span>${label}`);
    const b = $<HTMLButtonElement>('btn-project');
    b.classList.toggle('ready', g.projectProblem() === null);
    b.classList.toggle('night', g.lastNight);
  }

  private updateDay(): void {
    const g = this.game;
    const rs = g.roundStats;
    this.set('credits2', `¢${g.credits}`);
    this.set('day-label2', this.calendar());
    this.set('sun-label', g.lastNight ? 'Until dawn' : 'Daylight');
    const frac = g.phase === 'round' ? Math.min(1, g.time / ROUND_SECONDS) : 1;
    ($('sunbar') as HTMLElement).style.width = `${(1 - frac) * 100}%`;
    const coming = Math.max(0, g.bunniesLeft() - g.bunnies.length);
    this.set('st-coming', `${coming}`);
    this.set('st-field', `${g.bunnies.length}`);
    this.set('st-kills', `${rs.kills}`);
    this.set('st-lost', `${rs.cropsLost}`);
    this.set('st-fed', `${rs.escapedFed}`);
    const cd = g.reloadFrac();
    document.querySelectorAll<HTMLElement>('#weapon-bar .wpn').forEach((el) => {
      const k = el.dataset.weapon as WeaponKind;
      el.hidden = g.weapons[k] <= 0;
      el.classList.toggle('on', g.weapon === k);
      const bar = el.querySelector<HTMLElement>('.cd')!;
      const h = `${Math.round((g.weapon === k ? cd : 0) * 100)}%`;
      if (bar.style.height !== h) bar.style.height = h;
    });
    this.set('btn-pause', this.hooks.paused() ? 'Resume' : 'Pause');
    this.set('btn-speed', this.hooks.speed() >= 8 ? 'Skipping ▸▸' : `Speed ${this.hooks.speed()}×`);
    // after "Keep Watching", the skip is still here
    $('skip-row').hidden = !(g.allClear() && this.hooks.speed() < 8 && !this.clearShown);
  }

  // ------------------------------------------------------------ almanac

  private updateInfo(): void {
    const g = this.game;
    let html = '';
    const item = this.hoverItem ?? (this.hoverTile < 0 ? this.selected : null);
    if (this.hoverRow) html = this.rowInfo(this.hoverRow);
    else if (this.hoverButton && g.phase === 'planning') html = this.buttonInfo(this.hoverButton);
    else if (item) html = this.itemInfo(item);
    else if (this.hoverTile >= 0) html = this.tileInfo(this.hoverTile);
    if (!html) html = this.tip();
    this.set('info', html);
  }

  private itemInfo(item: ShopItem): string {
    const g = this.game;
    const lock = g.phase === 'planning' ? g.itemLock(item) : null;
    const locked = lock ? `<p class="lock"><b>Locked.</b> ${lock}</p>` : '';
    if (item.type === 'till') {
      return `<div class="title">Hoe — ${TILL_COST}¢ a tile</div><p>Till grass on your land into a seedbed. Crops only grow in tilled soil; ` +
        'defenses go anywhere on your land.</p><p class="hint">Drag to till a whole row.</p>';
    }
    if (item.type === 'land') {
      const owned = g.lots.filter(Boolean).length;
      return `<div class="title">Buy Land — ${lotPrice(g.lotsBought)}¢</div>${locked}<p>Click any lot for sale (outlined) to buy it: ` +
        `2 by 2 tiles of grass. Drag to buy a strip. Each lot costs a little more than the last.</p>` +
        `<p class="hint">You own ${owned} of ${g.lots.length} lots.</p>`;
    }
    if (item.type === 'smoke') {
      const now = lock ? '' : g.smoked ? 'The crater is smoking: a Buck comes out today.'
        : g.smokeProblem() ?? 'Pick it, then click the crater.';
      return `<div class="title">Smoke Bomb — ${SMOKE_BOMB}¢</div>${locked}<p>Throw it into the crater in the morning and an ` +
        'Asteroid Buck climbs out today, whatever the calendar says. Beat it and it counts toward the Crater Project, ' +
        'like any Buck. One a day.</p>' + (now ? `<p class="hint">${now}</p>` : '');
    }
    if (item.type === 'remove') {
      return `<div class="title">Dig Up / Sell</div><p>Dig up a crop you planted today for a full refund, ` +
        `or sell a defense. Things bought today refund in full; used defenses sell for half, less wear.</p>` +
        `<p class="hint">Right-click a tile does the same.</p>`;
    }
    if (item.type === 'upgrade') {
      const three = g.lockReason('upgrade3');
      const hint = lock ? '' : three ?? 'Hover a defense with this tool to see the price.';
      return `<div class="title">Upgrade</div>${locked}<p>Click a defense to improve it, up to level ${MAX_LEVEL}: ` +
        `more range, faster, harder-hitting, sturdier.</p>${hint ? `<p class="hint">${hint}</p>` : ''}`;
    }
    if (item.type === 'crop') {
      const c = CROPS[item.kind];
      const pct = Math.round(g.priceTrend(item.kind) * 100);
      const speed = g.growthToday(item.kind);
      const days = ripenDays(item.kind, speed);
      const normal = ripenDays(item.kind);
      const faster = (need: number) => `Grow it ${Math.max(1, Math.ceil((need / speed - 1) * 100))}% faster`;
      const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
      let grows: string;
      let hint: string;
      if (c.regrow) {
        const fruit = fruitsPerDay(item.kind, speed);
        grows = `Fruits ${times(fruit)} a day${fruit > 1 ? ' today' : ''}, ${c.harvests} in all${days > 1 ? `, the first in ${days} days` : ''}`;
        hint = `${faster(((fruit + 1) * c.regrow) / ROUND_SECONDS)} and it fruits ${times(fruit + 1)} a day.`;
      } else {
        grows = `Ripens in ${days} ${days === 1 ? 'day' : 'days'}${days !== normal ? ` today (normally ${normal})` : ''}`;
        hint = days > 1 ? `${faster(c.growTime / (ROUND_SECONDS * (days - 1)))} and it ripens in ${days - 1 === 1 ? 'a day' : `${days - 1} days`}.`
          : 'Ripe within the day, so faster won\'t help.';
      }
      return `<div class="title">${c.name} — ${c.seedCost}¢</div>${locked}` +
        `<div class="meta">${grows} · Sells ${Math.round(g.cropPrice(item.kind))}¢ tonight` +
        `${pct === 100 ? '' : ` (${pct}%)`} · Toughness ${c.hp} · Bunnies: ${APPEAL(c.attract)}</div>` +
        `<p>${c.blurb}</p>${this.marketNote(item.kind)}${lock ? '' : `<p class="hint">${hint}</p>`}`;
    }
    const d = DEFENSES[item.kind];
    const combo = COMBO_TEXT[item.kind];
    return `<div class="title">${d.name} — ${d.cost}¢</div>${locked}<div class="meta">${statLine(item.kind, 1)}</div><p>${d.blurb}</p>` +
      (combo && !lock ? `<p class="hint">★ ${combo}</p>` : '');
  }

  /** Almanac text for a weapon, farm upgrade, or Seed Lab strain. */
  private rowInfo(key: string): string {
    const g = this.game;
    const [type, kind] = key.split(':');
    const lockLine = (lock: string | null) => (lock ? `<p class="lock"><b>Locked.</b> ${lock}</p>` : '');
    if (type === 'weapon') {
      const k = kind as WeaponKind;
      const w = WEAPONS[k];
      const level = g.weapons[k];
      const lock = k === 'sling' ? null : g.lockReason(k);
      const price = g.weaponPrice(k);
      const next = price === null ? '<p>As good as it gets.</p>'
        : `<p><b>${level ? `Level ${level + 1}` : 'Buy it'}</b> for ${money(price)}${level ? `: ${weaponLine(k, level + 1)}` : ''}</p>`;
      return `<div class="title">${w.name} <span class="lv">${stars(level, WEAPON_LEVELS)}</span></div>${lockLine(lock)}` +
        `${level ? `<div class="meta">${weaponLine(k, level)}${w.hold ? ' · hold to fire' : ''}</div>` : ''}<p>${w.blurb}</p>${lock ? '' : next}`;
    }
    if (type === 'farm') {
      const k = kind as FarmUpgrade;
      const f = FARM[k];
      const price = g.farmPrice(k);
      const max = f.costs.length;
      return `<div class="title">${f.name}${max > 1 ? ` <span class="lv">${stars(g.farm[k], max)}</span>` : ''}</div>${lockLine(g.lockReason(k))}` +
        `<p>${f.blurb}</p><p>${price === null ? 'Done.' : `<b>${money(price)}</b>`}</p>`;
    }
    const k = kind as CropKind;
    const level = g.hybrid[k];
    const price = hybridCost(k, level);
    const now = level ? `Now: grows ${Math.round(HYBRID_GROWTH * 100 * level)}% faster, sells ${Math.round(HYBRID_VALUE * 100 * level)}% higher.` : '';
    return `<div class="title">${CROPS[k].name} strain <span class="lv">${stars(level, HYBRID_LEVELS)}</span></div>` +
      `${lockLine(g.lockReason('lab') ?? g.lockReason(k))}<p>${now} Every ${CROPS[k].name.toLowerCase()} you grow gets the better strain.</p>` +
      `<p>${price === null ? 'The best strain there is.' : `Next level: <b>${money(price)}</b>`}</p>`;
  }

  /** Only when it matters: the market is still full of a crop from recent harvests. */
  private marketNote(kind: CropKind): string {
    const g = this.game;
    const days = g.wanted[kind];
    if (days > 0) {
      return `<p class="hint">Nobody's sold ${cropPlural(kind)} in town for ${days === 1 ? 'a day' : `${days} days`}: ` +
        `+${Math.round(g.demand(kind) * 100)}% tonight.</p>`;
    }
    const room = Math.max(0, Math.floor(MARKET.glut - g.glut[kind]));
    if (room >= MARKET.glut) return '';
    return `<p class="hint">Still a glut from last time: about ${room} more sell at full price tonight.</p>`;
  }

  private buttonInfo(key: string): string {
    const g = this.game;
    switch (key) {
      case 'project': {
        const steps = PROJECT.map((st, n) => `<li${n < g.project ? ' class="done"' : ''}><b>${st.name}</b> ${money(st.cost)} · ` +
          `${st.bucks === 1 ? '1 Buck' : `${st.bucks} Bucks`}</li>`).join('');
        const problem = g.projectProblem();
        let note = g.lastNight ? 'Tonight: bonk every Buck before dawn.' : problem && problem !== 'Not enough credits.' ? problem : '';
        const needBucks = !g.lastNight && g.project < PROJECT.length && g.stats.bossesBeaten < PROJECT[g.project].bucks;
        if (needBucks && g.isUnlocked('smoke')) {
          note = `${g.stats.bossesBeaten} of ${PROJECT[g.project].bucks} Bucks beaten. Smoke one out: <span class="kbd">B</span>`;
        }
        return `<div class="title">The Crater Project</div><p>Seal the crater to win. Each stage angers it; the last starts The Last Night.</p>` +
          `<ol class="steps">${steps}</ol>${note ? `<p class="hint">${note}</p>` : ''}`;
      }
      case 'order': {
        const o = g.order;
        if (!o) return '';
        const left = o.due - g.round;
        return `<div class="title">Order from town</div><p>${o.who} wants ${o.want} ${cropPlural(o.kind, o.want)} by ` +
          `${left === 0 ? 'tonight' : `Day ${o.due}`}, and will pay a <b>${o.bonus}¢</b> bonus on top of the market price.</p>` +
          `<p class="hint">${o.got} so far. Every one you harvest counts, ${left === 0 ? 'tonight only' : `through ${left === 1 ? 'tomorrow' : `Day ${o.due}`}`}. ` +
          'Let it go and nothing bad happens.</p>';
      }
      case 'repair': {
        const rep = g.repairCost();
        const n = g.chewedCount();
        return `<div class="title">Repair All${rep ? ` — ${rep}¢` : ''}</div><p>Bunnies gnaw through defenses in their way, and ` +
          'Asteroid Bucks chew through anything. A chewed defense shows a bar over it; at zero it\'s gone. This patches every ' +
          `one up at once, for half the cost of the damage.</p><p class="hint">${n ? `${n} ${n === 1 ? 'defense is' : 'defenses are'} ` +
          'chewed right now.' : 'Nothing is chewed right now.'}</p>`;
      }
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
    const burrow = g.burrows.findIndex((b) => idx(b.x, b.y) === i);
    if (burrow >= 0 && (g.phase === 'planning' || g.phase === 'round')) {
      const left = g.burrowCounts()[burrow];
      const kinds = BUNNY_ORDER.map((k) => [k, g.burrowKinds(burrow)[k] ?? 0] as const).filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${n === 1 ? BUNNIES[k].name : plural(BUNNIES[k].name)}`);
      const when = g.phase === 'planning' ? `will come out of here today` : `still to come out of here`;
      return `<div class="title">Burrow</div><p><b>${left}</b> ${left === 1 ? 'bunny' : 'bunnies'} ${when}` +
        `${g.phase === 'planning' && kinds.length ? `: ${kinds.join(', ')}` : ''}.</p>` +
        '<p class="hint">They head for the tastiest crop they can reach. Defenses near their path meet them first.</p>';
    }
    if (t.crop) {
      const c = CROPS[t.crop.kind];
      const pct = Math.min(100, Math.floor((t.crop.growth / c.growTime) * 100));
      const value = Math.max(1, Math.round(g.cropPrice(t.crop.kind) * (t.crop.hp / c.hp)));
      const fruit = g.ripeFruit(t.crop);
      let status = fruit > 1 ? `Ripe! ${fruit} ready` : 'Ripe!';
      if (!fruit) {
        // at this tile's speed, counting whatever daylight is left today
        const speed = g.tileGrowth(i, t.crop.kind);
        const today = g.phase === 'planning' ? ROUND_SECONDS : g.phase === 'round' ? Math.max(0, ROUND_SECONDS - g.time) : 0;
        const left = c.growTime - t.crop.growth - today * speed;
        const days = left <= 0 ? 0 : Math.ceil(left / (ROUND_SECONDS * speed) - 1e-9);
        status = `${pct}% grown · ${days === 0 ? (g.phase === 'round' ? 'ripe by sundown' : 'ripe tonight')
          : days === 1 ? 'ripe tomorrow' : `ripe in ${days} days`}`;
      }
      const boost = g.sprinklerGrowth(i) > 1 ? ' · watered' : '';
      return `<div class="title">${c.name}</div><div class="meta">${status}${boost}<br>` +
        `Health ${Math.ceil(t.crop.hp)}/${c.hp} · worth ${value}¢${fruit > 1 ? ' each' : ''} at today's prices</div>`;
    }
    if (t.structure) {
      const s = t.structure;
      const d = DEFENSES[s.kind];
      const st = defenseStats(s.kind, s.level);
      const hp = d.blocks ? `Sturdiness ${Math.ceil(s.hp)}/${st.hp}` : 'Armed';
      const sell = g.phase === 'planning' ? ` · sells for ${g.removeValue(i)}¢` : '';
      const perk = PERKS[s.kind];
      const perkNext = perk && perk.level === s.level + 1 ? ` · ${perk.text}` : '';
      const next = s.level < MAX_LEVEL
        ? `<p><b>Level ${s.level + 1}</b> for ${upgradeCost(s.kind, s.level)}¢: ${statLine(s.kind, s.level + 1)}${perkNext}</p>`
        : '<p>Fully upgraded.</p>';
      return `<div class="title">${d.name} <span class="lv">${'★'.repeat(s.level)}</span></div>` +
        `<div class="meta">${statLine(s.kind, s.level)}<br>${hp}${sell}</div>${g.phase === 'planning' ? next : `<p>${d.blurb}</p>`}`;
    }
    if (g.phase !== 'planning') return '';
    if (g.owns(i)) {
      return g.tilled[i]
        ? '<div class="title">Tilled Soil</div><p>Ready for seeds, or a defense.</p>'
        : `<div class="title">Your Grass</div><p>Build a defense here, or till it (the hoe, <span class="kbd">H</span>) for ${TILL_COST}¢ to plant.</p>`;
    }
    if (inCrater(i)) {
      const bomb = g.smoked ? '<p><b>It\'s smoking.</b> An Asteroid Buck comes out today.</p>'
        : g.isUnlocked('smoke') ? '<p class="hint">Throw a Smoke Bomb in (<span class="kbd">B</span>) and a Buck comes out today.</p>' : '';
      return `<div class="title">The Crater</div><p>Where the asteroid hit, and where the Asteroid Bucks come from.</p>${bomb}`;
    }
    if (lotOfTile(i) >= 0) {
      return `<div class="title">Land for Sale</div><p>This lot is ${lotPrice(g.lotsBought)}¢. ` +
        'Use <b>Buy Land</b> (<span class="kbd">L</span>, in the Farm tab) and click it.</p>';
    }
    return `<div class="title">Wild Country</div><p>Nobody's selling this. It's where the bunnies live. (${tileX(i)}, ${tileY(i)})</p>`;
  }

  private tip(): string {
    const g = this.game;
    if (this.classic) return '<p>Lead the fast ones a little. Pop-ups duck back down after a moment, so be quick.</p>';
    switch (g.phase) {
      case 'planning':
        if (g.cropCount() === 0 && g.credits < Math.min(...CROP_ORDER.filter((k) => g.isUnlocked(k)).map((k) => CROPS[k].seedCost))) {
          return '<p><b>Out of seed money.</b> Right-click a defense on your land to sell it, then plant with what it brings.</p>';
        }
        return this.selected
          ? '<p>Click your land to place it. Drag to plant a row. Right-click to dig up or sell.</p>'
          : '<p>Pick seeds or a defense from the store, then click your land. The dark land isn\'t yours yet.</p><p class="hint">Hover anything for details.</p>';
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
    const hard = this.hooks.hardOpen() ? '<button class="btn" data-act="hard">Hard Mode</button>' : '';
    this.open('title', `
      <div class="title-screen">
        <div id="logo-host"></div>
        <p class="tag">It's been years since the asteroid.<br>The bunnies never left… and some of them glow.</p>
        <div class="buttons">
          <button class="btn" data-act="help">How to Play</button>
          <button class="btn" data-act="scores">High Scores</button>
          <button class="btn" data-act="classic">Classic Mode</button>
          <button class="btn" data-act="daily">Daily Farm</button>
          ${save ? `<button class="btn" data-act="new">New Game</button>${hard}<button class="btn default" data-act="continue">Continue</button>`
            : `${hard}<button class="btn default" data-act="new">New Game</button>`}
        </div>
        <div class="links"><a data-act="achievements">Achievements</a> · <a data-act="guide">Bunny Guide</a></div>
        ${best ? `<div class="best">Best farm: Day ${best.round} · ${best.score}¢ harvested</div>` : ''}
        <div class="credit">Bunny Killer II (1993) · Bunny Killer 3 (1994) · Modified Environments</div>
      </div>`, {
      help: () => this.showHelp(() => this.showTitle()),
      scores: () => this.showHighScores(() => this.showTitle()),
      classic: () => this.showClassicIntro(),
      new: () => this.chooseFarm('normal', () => this.showTitle()),
      hard: () => this.showHardIntro(() => this.showTitle()),
      daily: () => this.showDailyIntro(() => this.showTitle()),
      achievements: () => this.showAchievements(() => this.showTitle()),
      guide: () => this.showGuide(() => this.showTitle()),
      continue: () => this.hooks.continueGame(),
    }, { Enter: save ? 'continue' : 'new' });
    $('logo-host').appendChild(makeLogo());
  }

  /** Game › New Game…: pick a farm, same difficulty as the one you're on. */
  confirmNewGame(back?: () => void, mode: Mode = this.game.mode): void {
    this.chooseFarm(mode, back);
  }

  /** Pick which farm to start on. Enter takes the one you played last. */
  chooseFarm(mode: Mode, back?: () => void): void {
    const last = this.hooks.lastFarm();
    const cards = MAP_ORDER.map((k) => `<button class="farm-card${k === last ? ' last' : ''}" data-act="farm:${k}">` +
      `<img src="${dataURL(farmMiniMap(k))}" alt=""><b>${FARMS[k].name}</b><span>${FARMS[k].blurb}</span></button>`).join('');
    const again = () => this.chooseFarm(mode, back);
    const actions: Record<string, () => void> = { back: () => (back ? back() : this.dismiss()) };
    for (const k of MAP_ORDER) actions[`farm:${k}`] = () => this.startFarm(mode, k, again);
    this.open('farms', `<h1>${mode === 'hard' ? 'Hard Mode: pick a farm' : 'Pick a farm'}</h1>` +
      `<div class="farm-cards">${cards}</div><div class="buttons"><button class="btn" data-act="back">Back</button></div>`,
    actions, { Escape: 'back', Enter: `farm:${last}` });
  }

  /** Start on a farm, after making sure the player means to give up the one in progress. */
  private startFarm(mode: Mode, map: MapKind, back: () => void): void {
    const g = this.game;
    if (!this.hooks.hasSave() || g.phase === 'gameover' || g.phase === 'victory') {
      this.hooks.newGame(mode, map);
      return;
    }
    const day = g.phase === 'title' ? '' : ` (Day ${g.round})`;
    this.open('confirm', `
      <div class="icon-row">${spriteImg(sprites().bunnies.mutant.frames[0], 1)}
      <div><h1>Start over on ${FARMS[map].name}${mode === 'hard' ? ' in Hard Mode' : ''}?</h1><p>Your current farm${day} will be lost.</p></div></div>
      <div class="buttons"><button class="btn" data-act="cancel">Cancel</button><button class="btn default" data-act="ok">New Game</button></div>`, {
      cancel: back,
      ok: () => this.hooks.newGame(mode, map),
    }, { Escape: 'cancel', Enter: 'ok' });
  }

  showHelp(back?: () => void): void {
    const resume = back ?? (() => this.dismiss());
    this.open('help', `
      <h1>How to Play</h1>
      <p><b>The goal:</b> save the farm by sealing the crater the bunnies keep coming out of. Fund the three stages of the
      <b>Crater Project</b> in the Farm Store. Each stage opens up after you beat an Asteroid Buck, which comes on the last day
      of every season, or throw a <b>Smoke Bomb</b> into the crater to bring one out today. The last stage starts
      <b>The Last Night</b>: bonk every Buck before dawn to win. Do it once and <b>Hard Mode</b> opens on the title screen.</p>
      <div class="help-cols">
        <div>
          <h2>Morning: plan</h2>
          <ul>
            <li>Buy seeds and click your tilled soil to plant them.</li>
            <li>Buy defenses. They go anywhere on your land, grass or soil.</li>
            <li>Buy more land a lot at a time (Farm tab, <span class="kbd">L</span>). It comes as grass: till it with the hoe (<span class="kbd">H</span>) before you plant.</li>
            <li>Check the <b>Scouting Report</b>, and the burrows around the edge of the field. Each one's tag says how many bunnies will come out of it.</li>
          </ul>
          <h2>Day: defend</h2>
          <ul>
            <li>Crops grow while bunnies go for the tastiest one they can reach.</li>
            <li><b>Click a bunny</b> to fire. Poof! Buy more weapons in the store's Weapons tab; switch with <span class="kbd">1</span>–<span class="kbd">5</span>.</li>
            <li>Burrowers pop up now and then. Hit them then, or hit their mound to startle them out.</li>
            <li>Every bunny that gets home fed brings a friend tomorrow.</li>
            <li>Once they're all dealt with, <b>All clear!</b> lets you skip to sundown (<span class="kbd">Enter</span>).</li>
          </ul>
        </div>
        <div>
          <h2>Evening: harvest</h2>
          <ul>
            <li>Ripe crops sell by how much of them is left, at <b>today's market price</b> (shown in the store).</li>
            <li>Sell too many of one crop in an evening and the price sags. Mix it up.</li>
            <li>Unripe crops stay in the ground for tomorrow.</li>
            <li>Growing faster pays when a crop ripens a day sooner or fruits twice a day. Green tags on the seeds show it.</li>
            <li>New seeds, defenses, weapons and upgrades unlock as you play. The Seed Lab and farm upgrades make crops grow faster and sell higher.</li>
            <li>Go broke with nothing growing and the farm is done.</li>
          </ul>
          <h2>Keys</h2>
          <ul>
            <li><span class="kbd">1</span>–<span class="kbd">0</span> seeds, <span class="kbd">Q</span>–<span class="kbd">Y</span> and <span class="kbd">A</span> <span class="kbd">S</span> <span class="kbd">D</span> defenses, <span class="kbd">H</span> hoe, <span class="kbd">L</span> buy land, <span class="kbd">X</span> dig up/sell, <span class="kbd">U</span> upgrade, <span class="kbd">B</span> smoke bomb</li>
            <li><span class="kbd">Space</span> start the day / pause</li>
            <li><span class="kbd">F</span> speed (1×, 2×, 4×), <span class="kbd">M</span> sound, <span class="kbd">N</span> music</li>
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
      <p>Version 0.4 (prototype)</p>
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
        `${CROPS[k].name} ×${h.count} <span class="each">at ${Math.round(h.value / h.count)}¢</span></td><td class="n">${h.value}¢</td></tr>`;
    });
    // crops that flooded the market tonight
    const flooded = CROP_ORDER.filter((k) => rs.harvested[k] && (rs.market[k] ?? 1) < SEASONS[g.season].sell * g.market[k] * 0.95);
    if (rs.bounty) rows.push(`<tr><td>Asteroid Buck bounty</td><td class="n">${rs.bounty}¢</td></tr>`);
    if (rs.prizeCash) rows.push(`<tr><td>Golden bunny</td><td class="n">${rs.prizeCash}¢</td></tr>`);
    if (rs.orderPaid) rows.push(`<tr><td>Order bonus</td><td class="n">${rs.orderPaid}¢</td></tr>`);
    const earned = rs.harvestTotal + rs.bounty + rs.prizeCash + rs.orderPaid;
    const table = rows.length
      ? `<table>${rows.join('')}<tr class="total"><td>Total</td><td class="n">${earned}¢</td></tr></table>`
      : '<p>Nothing was ripe enough to sell today.</p>';
    const net = earned - rs.spent;
    const growing = g.cropCount();
    const chewed = g.chewedCount();
    const lines = [
      `Bonked <b>${rs.kills}</b> ${rs.kills === 1 ? 'bunny' : 'bunnies'}.`,
      rs.prize && !rs.prizeCash ? `You caught the golden bunny! ${rs.prize}` : '',
      rs.orderNote,
      rs.fairSold ? `The County Fair bought <b>${rs.fairSold}</b> ${cropPlural(g.event!.crop!, rs.fairSold)} at triple price!` : '',
      g.event?.kind === 'hail' ? (rs.hailHit ? `Hail battered <b>${rs.hailHit}</b> ${rs.hailHit === 1 ? 'crop' : 'crops'}.`
        : 'Hail rattled the greenhouse, but the crops were fine.') : '',
      rs.cropsLost ? `<b>${rs.cropsLost}</b> ${rs.cropsLost === 1 ? 'crop was' : 'crops were'} lost${rs.cropsStolen ? `, ${rs.cropsStolen} of them carried off by Bandits` : ''}.` : 'Not a single crop lost!',
      rs.structuresBroken ? `<b>${rs.structuresBroken}</b> ${rs.structuresBroken === 1 ? 'defense was' : 'defenses were'} chewed to bits.` : '',
      chewed ? `<b>${chewed}</b> ${chewed === 1 ? 'defense is' : 'defenses are'} chewed up. <b>Repair All</b> (Defense tab) fixes ` +
        `${chewed === 1 ? 'it' : 'them'} for ${g.repairCost()}¢.` : '',
      rs.escapedFed
        ? `<b>${rs.escapedFed}</b> got away with full bellies. Expect <b>${Math.min(rs.escapedFed, BREED_CAP)}</b> extra bunnies tomorrow.`
        : 'No bunny got home with a full belly.',
      growing ? `${growing} ${growing === 1 ? 'crop is' : 'crops are'} still growing.` : '',
      flooded.length ? `So many ${flooded.map((k) => cropPlural(k)).join(' and ')} flooded the market ` +
        'that the last ones sold cheap. Mixing crops keeps prices up.' : '',
    ].filter(Boolean);
    const soon = g.nightResult ? [] : g.pendingUnlocks();
    const unlocks = soon.length
      ? `<p class="unlocks">New at the store tomorrow: ${soon.map((u) => `<b>${unlockName(u)}</b>`).join(', ')}!</p>` : '';
    let head = `<h1>Day ${g.round} is done</h1>`;
    let next = g.daily && g.round >= DAILY.days ? 'See how you did ▸' : `On to Day ${g.round + 1}`;
    if (g.nightResult === 'sealed') {
      head = `<div class="icon-row">${spriteImg(sprites().bunnies.mutant.frames[0], 1)}<div><h1>The crater is sealed!</h1>` +
        '<p>The last Asteroid Buck went down just before dawn, and the cap slid home with a <i>clunk</i>. The glow is gone.</p></div></div>';
      next = 'Dawn ▸';
    } else if (g.nightResult === 'cracked') {
      const got = g.lastNightBucks - rs.bucks;
      head = `<div class="icon-row">${spriteImg(sprites().bunnies.mutant.frames[0], 1)}<div><h1>The cap cracked!</h1>` +
        `<p>${got === 1 ? 'One Asteroid Buck' : `${got} Asteroid Bucks`} made it through the night, and the crater blew the lid clean off. ` +
        `Putting it back costs ${Math.round(CAP_RETRY * 100)}%: ${money(g.projectCost() ?? 0)}. Try again when you're ready.</p></div></div>`;
    }
    this.open('summary', `
      ${head}
      <h2>Harvest</h2>${table}
      <p style="margin-top:8px">Spent today: ${rs.spent}¢ · Net: <b>${net >= 0 ? '+' : ''}${net}¢</b> · Bank: <b>${g.credits}¢</b></p>
      <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>${unlocks}
      <div class="buttons"><button class="btn default" data-act="next">${next}</button></div>`,
    { next: () => this.hooks.nextDay() }, { Enter: 'next', ' ': 'next' });
  }

  /** The last stage starts The Last Night today, so make sure the player means it. */
  private confirmCap(): void {
    const g = this.game;
    this.open('cap', `
      <div class="icon-row">${spriteImg(sprites().bunnies.mutant.frames[0], 1)}
      <div><h1>Cap the crater today?</h1>
      <p>This starts <b>The Last Night</b>: today's bunnies come at night, with <b>${g.lastNightBucks} Asteroid Bucks</b> among them.</p>
      <p>Bonk every Buck before dawn and the crater is sealed: you win. If even one gets away, the cap cracks, and putting it back costs half again.</p>
      <p class="hint">You can still plant and build after paying ${money(g.projectCost() ?? 0)}.</p></div></div>
      <div class="buttons"><button class="btn" data-act="cancel">Not Yet</button><button class="btn default" data-act="ok">Cap It</button></div>`, {
      cancel: () => this.closeModal(),
      ok: () => {
        this.closeModal();
        if (g.fundProject()) {
          this.hooks.changed();
          this.banner('The Last Night', 'Bonk every Asteroid Buck before dawn', 2.6);
        }
      },
    }, { Escape: 'cancel', Enter: 'ok' });
  }

  showVictory(rank = -1): void {
    const g = this.game;
    const hard = g.mode === 'hard';
    const placed = rank === 0 ? '<p><b>A new high score!</b></p>' : rank > 0 ? `<p>That's <b>#${rank + 1}</b> on your high score table.</p>` : '';
    const next = hard
      ? '<p class="unlocks"><b>You beat Hard Mode.</b> The crater never stood a chance.</p>'
      : '<p class="unlocks"><b>Hard Mode is open!</b> More bunnies, tougher ones, Ninjas in the first year, and four Bucks on the Last Night.</p>';
    this.open('victory', `
      <div class="icon-row">${spriteImg(sprites().bunnies.common.frames[0], 3)}
      <div><h1>You saved the farm${hard ? ', the hard way' : ''}.</h1>
      <p>The crater is capped, the glow is gone, and there won't be any more Asteroid Bucks. It took <b>${g.round}</b> days.</p>
      <p>The bunnies are still bunnies. But now they're just bunnies.</p></div></div>
      <table>
        <tr><td>Days to seal the crater</td><td class="n">${g.round}</td></tr>
        <tr><td>Bunnies bonked</td><td class="n">${g.stats.kills}</td></tr>
        <tr><td>Asteroid Bucks beaten</td><td class="n">${g.stats.bossesBeaten}</td></tr>
        <tr class="total"><td>Lifetime harvest</td><td class="n">${g.stats.harvest}¢</td></tr>
      </table>
      ${placed}${next}
      <div class="buttons"><button class="btn left" data-act="scores">High Scores</button><button class="btn" data-act="title">Title</button>
        <button class="btn" data-act="keep">Keep Farming</button>
        ${hard ? '<button class="btn default" data-act="hard">New Game</button>'
          : '<button class="btn" data-act="new">New Game</button><button class="btn default" data-act="hard">Hard Mode ▸</button>'}</div>`,
    {
      keep: () => this.hooks.keepFarming(),
      title: () => this.hooks.toTitle(),
      new: () => this.chooseFarm('normal', () => this.showVictory(rank)),
      hard: () => this.chooseFarm('hard', () => this.showVictory(rank)),
      scores: () => this.showHighScores(() => this.showVictory(rank)),
    }, { Enter: 'hard' });
  }

  showGameOver(rank = -1): void {
    const g = this.game;
    const days = g.round - 1;
    const kept = g.sealed ? `<p>You sealed the crater on day ${g.stats.sealedOn} and farmed on to day ${days}. ` +
      `${g.retired ? 'Not a bad life.' : 'The bunnies had the last word after all.'}</p>` : '';
    const headline = kept ? `<h1>${g.retired ? 'You hung up your hat.' : 'The farm went bust.'}</h1>${kept}` : g.retired
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
      new: () => this.chooseFarm(g.mode, () => this.showGameOver(rank)),
      scores: () => this.showHighScores(() => this.showGameOver(rank)),
    }, { Enter: 'new' });
  }

  /** The travelling merchant's cart: a few deals, today only. */
  showMerchant(): void {
    const g = this.game;
    const offers = g.event?.kind === 'merchant' ? g.event.offers ?? [] : [];
    const rows = offers.map((o) => {
      const problem = g.offerProblem(o.id);
      const sold = g.eventBought.includes(o.id);
      return `<tr><td><b>${o.name}</b><br><span class="each">${o.text}</span></td><td class="n">${money(o.price)}</td>` +
        `<td><button class="btn" data-act="buy:${o.id}"${problem ? ' disabled' : ''}>${sold ? 'Sold' : 'Buy'}</button></td></tr>`;
    }).join('');
    const actions: Record<string, () => void> = { ok: () => this.closeModal() };
    for (const o of offers) {
      actions[`buy:${o.id}`] = () => {
        if (g.buyOffer(o.id)) this.hooks.changed();
        this.showMerchant();
      };
    }
    this.open('merchant', `
      <div class="icon-row"><img src="${dataURL(merchantCart())}" alt="" style="width:84px;height:54px">
      <div><h1>The Travelling Merchant</h1><p>"Finest goods from over the hill! Today only, friend. I'm gone when the day starts."</p></div></div>
      <table class="offers">${rows || '<tr><td>The cart is empty.</td></tr>'}</table>
      <p class="hint">You have ${money(g.credits)}.</p>
      <div class="buttons"><button class="btn default" data-act="ok">Done</button></div>`, actions, { Enter: 'ok', Escape: 'ok' });
  }

  /** An achievement, popped up in the corner of the farm (one at a time). */
  award(a: Achievement): void {
    this.awards.push(a);
    if (this.awardTimer <= 0) this.nextAward();
  }

  private nextAward(): void {
    const a = this.awards.shift();
    const el = $('award');
    if (!a) {
      el.classList.remove('show');
      return;
    }
    el.innerHTML = `<img src="${dataURL(trophyIcon())}" alt=""><div><small>Achievement</small><b>${a.name}</b><span>${a.text}</span></div>`;
    el.classList.add('show');
    this.awardTimer = 3.4;
  }

  showAchievements(back?: () => void): void {
    const have = this.hooks.achievements();
    const n = ACHIEVEMENTS.filter((a) => have[a.id]).length;
    const cells = ACHIEVEMENTS.map((a) => `<div class="trophy${have[a.id] ? ' got' : ''}"><img src="${dataURL(trophyIcon())}" alt="">` +
      `<div><b>${a.name}</b><span>${a.text}</span>${have[a.id] ? `<i>${have[a.id]}</i>` : ''}</div></div>`).join('');
    this.open('achievements', `<h1>Achievements</h1><p>${n} of ${ACHIEVEMENTS.length}. They count across every farm you play.</p>` +
      `<div class="trophies">${cells}</div><div class="buttons"><button class="btn default" data-act="ok">OK</button></div>`,
    { ok: back ?? (() => this.dismiss()) }, { Enter: 'ok', Escape: 'ok' });
  }

  /** Every kind of bunny: what it does, and how many you've bonked (on every farm). Ones you haven't met are shadows. */
  showGuide(back?: () => void): void {
    const guide = this.hooks.guide();
    const cells = BUNNY_ORDER.map((k) => {
      const d = BUNNIES[k];
      const met = guide.seen.includes(k) || (guide.bonked[k] ?? 0) > 0;
      const art = spriteImg(sprites().bunnies[k].frames[0], k === 'mutant' ? 0.75 : k === 'queen' || k === 'fat' ? 1 : 1.5);
      return `<div class="bunny${met ? '' : ' unmet'}"><div class="pic">${art}</div><div>` +
        (met ? `<b>${d.name}</b><span class="stat">Toughness ${d.hp} · Speed ${d.speed}</span><span>${d.blurb}</span>` +
          `<i>Bonked: ${(guide.bonked[k] ?? 0).toLocaleString('en-US')}</i>`
          : '<b>???</b><span>Not seen yet. Keep farming.</span>') + '</div></div>';
    }).join('');
    const met = BUNNY_ORDER.filter((k) => guide.seen.includes(k) || (guide.bonked[k] ?? 0) > 0).length;
    this.open('guide', `<h1>Bunny Guide</h1><p>${met} of ${BUNNY_ORDER.length} met. Bonks count across every farm.</p>` +
      `<div class="guide">${cells}</div><div class="buttons"><button class="btn default" data-act="ok">OK</button></div>`,
    { ok: back ?? (() => this.dismiss()) }, { Enter: 'ok', Escape: 'ok' });
  }

  /** Today's Daily Farm: what it is, and your best so far today. */
  showDailyIntro(back?: () => void): void {
    const d = this.hooks.daily();
    const done = back ?? (() => this.dismiss());
    const best = d.best ? `<p>Your best today: <b>${money(d.best.score)}</b> harvested.</p>` : '';
    this.open('daily', `
      <div class="icon-row"><img src="${dataURL(farmMiniMap(d.map))}" alt="" style="width:132px;height:96px;image-rendering:pixelated;border:1px solid #000">
      <div><h1>Daily Farm #${d.number}</h1>
      <p><b>${FARMS[d.map].name}</b>, ${d.key}. Everybody playing today gets the same farm, the same weather, and the same
      bunnies. You have <b>${DAILY.days} days</b>: how much can you harvest?</p>${best}</div></div>
      <div class="buttons"><button class="btn" data-act="back">Back</button><button class="btn default" data-act="go">${d.resumable ? 'Resume ▸' : 'Play ▸'}</button></div>`, {
      back: done,
      go: () => this.hooks.newDaily(),
    }, { Enter: 'go', Escape: 'back' });
  }

  /** The end of a Daily Farm: the score, today's best, and a line to share. */
  showDailyResults(r: DailyResult, fresh: boolean): void {
    const g = this.game;
    const d = this.hooks.daily();
    const best = d.best ?? r;
    const bust = r.days < DAILY.days;
    const share = [
      `Bunny Killer 4 · Daily #${g.dailyNumber} · ${FARMS[g.map].name}`,
      `🥕 ${r.score.toLocaleString('en-US')}¢ harvested in ${r.days} ${r.days === 1 ? 'day' : 'days'}${bust ? ' (went bust)' : ''}`,
      `🐰 ${r.kills} bonked · ✨ ${r.golden} golden · 📋 ${r.orders} ${r.orders === 1 ? 'order' : 'orders'}`,
    ].join('\n');
    this.open('daily-done', `
      <h1>Daily Farm #${g.dailyNumber}: ${bust ? 'the farm went bust' : 'done!'}</h1>
      <table>
        <tr><td>Harvested (your score)</td><td class="n">${money(r.score)}</td></tr>
        <tr><td>Bunnies bonked</td><td class="n">${r.kills}</td></tr>
        <tr><td>Golden bunnies</td><td class="n">${r.golden}</td></tr>
        <tr><td>Orders filled</td><td class="n">${r.orders}</td></tr>
        <tr class="total"><td>${fresh ? 'A new best for today!' : 'Your best today'}</td><td class="n">${money(best.score)}</td></tr>
      </table>
      <p>Share it:</p><pre class="share" id="share-text">${esc(share)}</pre>
      <div class="buttons"><button class="btn left" data-act="copy" id="btn-copy">Copy</button><button class="btn" data-act="title">Title Screen</button>
        <button class="btn default" data-act="again">Play Again</button></div>`, {
      copy: () => {
        const done = () => { $('btn-copy').textContent = 'Copied!'; };
        navigator.clipboard?.writeText(share).then(done, () => this.copyByHand(share, done)) ?? this.copyByHand(share, done);
      },
      title: () => this.hooks.toTitle(),
      again: () => this.hooks.newDaily(),
    }, { Enter: 'again', Escape: 'title' });
  }

  /** Older browsers (and some pages opened from disk): copy through a hidden text box. */
  private copyByHand(text: string, done: () => void): void {
    const box = document.createElement('textarea');
    box.value = text;
    document.body.appendChild(box);
    box.select();
    try {
      if (document.execCommand('copy')) done();
    } finally {
      box.remove();
    }
  }

  /** What Hard Mode changes, before you commit to it. */
  showHardIntro(back: () => void): void {
    this.open('hard-intro', `
      <div class="icon-row">${spriteImg(sprites().bunnies.ninja.frames[0], 2)}
      <div><h1>Hard Mode</h1>
      <p>${MODES.hard.blurb}</p>
      <p>Prices, crops and the Crater Project stay the same. You'll just have to earn it.</p></div></div>
      <div class="buttons"><button class="btn" data-act="back">Back</button><button class="btn default" data-act="go">Start</button></div>`, {
      back,
      go: () => this.chooseFarm('hard', () => this.showHardIntro(back)),
    }, { Enter: 'go', Escape: 'back' });
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
      ? list.map((e, n) => `<tr${e.sealed ? ' class="sealed"' : ''}><td class="n">${n + 1}.</td><td class="n">${e.score}¢</td>` +
          `<td>${e.sealed ? `<b>Sealed the crater</b> in ${e.days} days${e.endless ? `, farmed on to day ${e.endless}` : ''}`
            : `${e.days} ${e.days === 1 ? 'day' : 'days'}${e.retired ? ', retired' : ''}`}` +
          `${e.hard ? ' <span class="hard">HARD</span>' : ''}` +
          `</td><td class="n">${e.kills} bonked</td><td class="n">${e.date}</td></tr>`).join('')
      : '<tr><td colspan="5"><p>No finished farms yet. Every run that ends, by sealing the crater, going bust, or retiring, lands here.</p></td></tr>';
    const done = back ?? (() => this.dismiss());
    this.open('scores', `
      <h1>High Scores</h1>
      <p>Farms that sealed the crater come first, Hard Mode ahead, fastest on top. The rest rank by lifetime harvest.</p>
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
