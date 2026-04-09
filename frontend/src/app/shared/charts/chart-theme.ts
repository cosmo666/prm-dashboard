// ============================================================
// Shared ECharts theme — "Operations Desk"
// Cobalt accent, warm neutrals, serif-friendly axes
// ============================================================

export const CHART_COLORS = {
  accent: '#1d4ed8',
  accentHover: '#1e40af',
  accentBg: '#eff6ff',
  ink: '#0c0c0c',
  muted: '#78716c',
  border: '#e7e5e4',
  surface: '#ffffff',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
};

/**
 * Categorical palette used for multi-series charts.
 * Muted, desaturated — designed to work at small sizes without vibrating.
 */
export const CHART_PALETTE = [
  '#1d4ed8', // cobalt
  '#0d9488', // teal
  '#d97706', // amber
  '#7c3aed', // plum
  '#059669', // emerald
  '#be185d', // rose
  '#0369a1', // sky
  '#ca8a04', // mustard
  '#9333ea', // violet
  '#15803d', // green
];

const FONT_SANS = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';

/**
 * Base ECharts option fragment applied to every chart for consistent typography,
 * tooltip styling, grid spacing, and axis appearance.
 * Merge this into each chart's options using deep merge or spread.
 */
export const CHART_BASE = {
  color: CHART_PALETTE,
  textStyle: {
    fontFamily: FONT_SANS,
    fontSize: 11,
    color: CHART_COLORS.ink,
  },
  grid: {
    left: 48,
    right: 24,
    top: 24,
    bottom: 40,
    containLabel: true,
  },
  tooltip: {
    backgroundColor: CHART_COLORS.ink,
    borderColor: CHART_COLORS.ink,
    borderWidth: 0,
    padding: [8, 12],
    textStyle: {
      fontFamily: FONT_SANS,
      fontSize: 12,
      color: '#fafaf7',
    },
    extraCssText: 'border-radius: 6px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);',
    axisPointer: {
      lineStyle: { color: CHART_COLORS.border, width: 1, type: 'dashed' },
      shadowStyle: { color: 'rgba(12, 12, 12, 0.04)' },
    },
  },
  legend: {
    textStyle: {
      fontFamily: FONT_SANS,
      fontSize: 11,
      color: CHART_COLORS.muted,
    },
    inactiveColor: '#d6d3d1',
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 14,
    icon: 'roundRect',
    top: 0,
    left: 0,
    selectedMode: 'multiple' as const,
  },
};

/** Standardized category axis styling (horizontal bars, x-axis labels). */
export const CHART_CATEGORY_AXIS = {
  type: 'category' as const,
  axisLine: { show: true, lineStyle: { color: CHART_COLORS.border } },
  axisTick: { show: false },
  axisLabel: {
    color: CHART_COLORS.muted,
    fontFamily: FONT_MONO,
    fontSize: 10,
  },
  splitLine: { show: false },
};

/** Standardized value axis styling (numeric y-axis). */
export const CHART_VALUE_AXIS = {
  type: 'value' as const,
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: {
    color: CHART_COLORS.muted,
    fontFamily: FONT_MONO,
    fontSize: 10,
  },
  splitLine: {
    show: true,
    lineStyle: { color: CHART_COLORS.border, type: 'dashed' as const },
  },
};
