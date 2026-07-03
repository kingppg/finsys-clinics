import { DcTheme } from './types';
import { darkExecutive } from './darkExecutive';

export type { DcTheme, DcThemeTokens } from './types';

// Theme registry — add future themes here and they automatically become
// available to the (upcoming) theme picker in Clinic Config.
export const THEMES: Record<string, DcTheme> = {
  [darkExecutive.id]: darkExecutive,
};

export const DEFAULT_THEME_ID = darkExecutive.id;

export function getTheme(id?: string | null): DcTheme {
  return (id && THEMES[id]) || THEMES[DEFAULT_THEME_ID];
}
