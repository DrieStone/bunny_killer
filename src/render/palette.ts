// Fur colors for each bunny, sampled from the sprites; used for the poof of fur.
import type { BunnyKind } from '../config';

export const BUNNY_COLORS: Record<BunnyKind, { fur: string; light: string; dark: string }> = {
  common: { fur: '#9c6b4c', light: '#c89872', dark: '#5e3d2b' },
  speedy: { fur: '#d9c8a4', light: '#f2e6cc', dark: '#a8966f' },
  digger: { fur: '#7d8591', light: '#aab1bb', dark: '#4e545e' },
  fat: { fur: '#f2bc7a', light: '#fef7db', dark: '#c98a40' },
  kit: { fur: '#c8966a', light: '#f0d8b8', dark: '#8a5a3a' },
  pothead: { fur: '#9c6b4c', light: '#cdd4de', dark: '#5e3d2b' },
  leaper: { fur: '#c8743c', light: '#f0b890', dark: '#7a3a18' },
  bandit: { fur: '#8a7a6a', light: '#c8bcb0', dark: '#2a2630' },
  snowhare: { fur: '#e8f0ff', light: '#ffffff', dark: '#a8b8d0' },
  ninja: { fur: '#3a3d4c', light: '#e8403a', dark: '#1d1f28' },
  queen: { fur: '#c2a8ee', light: '#f1e8ff', dark: '#ffce3a' },
  mutant: { fur: '#4fd13a', light: '#b8ff8a', dark: '#1f6e1c' },
};
