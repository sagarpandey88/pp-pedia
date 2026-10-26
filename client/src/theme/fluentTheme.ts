import { createDarkTheme, BrandVariants, Theme } from '@fluentui/react-components';

/**
 * Microsoft Power Platform Brand Ramp (Purple / Indigo foundation)
 * #742774 is the standard Power Apps / Power Platform maker studio purple.
 */
export const powerPlatformBrandRamp: BrandVariants = {
  10: '#07020a',
  20: '#1b0a24',
  30: '#2b0d39',
  40: '#3a0f4e',
  50: '#4a1163',
  60: '#5a1378',
  70: '#6a158e',
  80: '#742774',
  90: '#893289',
  100: '#9e3e9e',
  110: '#b44cb4',
  120: '#c75fc7',
  130: '#d976d9',
  140: '#e891e8',
  150: '#f4aff4',
  160: '#fbd0fb',
};

export const powerPlatformDarkTheme: Theme = {
  ...createDarkTheme(powerPlatformBrandRamp),
  fontFamilyBase: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
  colorNeutralBackground1: '#090d16',
  colorNeutralBackground2: '#0f172a',
  colorNeutralBackground3: '#1e293b',
  colorBrandBackground: '#742774',
  colorBrandBackgroundHover: '#893289',
  colorBrandBackgroundPressed: '#5a1378',
};

