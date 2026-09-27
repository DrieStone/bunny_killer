// Fur colors for each bunny, sampled from the sprites; used for the poof of fur.
import type { BunnyKind } from '../config';

export const BUNNY_COLORS: Record<BunnyKind, { fur: string; light: string; dark: string }> = {
  common: { fur: '#9c6b4c', light: '#c89872', dark: '#5e3d2b' },
  speedy: { fur: '#d9c8a4', light: '#f2e6cc', dark: '#a8966f' },
  digger: { fur: '#7d8591', light: '#aab1bb', dark: '#4e545e' },
  fat: { fur: '#f2bc7a', light: '#fef7db', dark: '#c98a40' },
  mutant: { fur: '#4fd13a', light: '#b8ff8a', dark: '#1f6e1c' },
};
