// ============================================================
// Shared ECharts theme — Angular-17-parity look for the worktree.
// Dark tooltip card, top-left small legend, dashed crosshair
// axisPointer with axis-label badges, value-axis split lines.
// ============================================================
//
// echarts options can't read CSS custom properties at runtime, so the
// constants below are a parallel ramp that mirrors the project's
// --app-* tokens. Keep these in sync with _material-tokens.scss if the
// design ramp ever shifts.

export const CHART_COLORS = {
  ink: '#0F172A',           // --app-text
  inkOn: '#F8FAFC',         // text on dark surfaces
  muted: '#64748B',         // --app-text-muted
  faint: '#94A3B8',         // --app-text-faint
  border: '#E2E8F0',        // --app-border
  borderStrong: '#CBD5E1',  // --app-border-strong
  surface: '#FFFFFF',
  bgMuted: '#F1F5F9',
};

const FONT_SANS = '"Fira Sans", -apple-system, BlinkMacSystemFont, sans-serif';
const FONT_MONO = '"Fira Code", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Dark tooltip card. Slate-900 background, white-ish text, 11px font.
 * Spread into each chart's `tooltip` config alongside that chart's
 * trigger / formatter / axisPointer overrides.
 */
export const CHART_TOOLTIP = {
  backgroundColor: CHART_COLORS.ink,
  borderColor: CHART_COLORS.ink,
  borderWidth: 0,
  padding: [8, 12] as [number, number],
  textStyle: {
    fontFamily: FONT_SANS,
    fontSize: 11,
    color: CHART_COLORS.inkOn,
  },
  extraCssText: 'border-radius: 6px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);',
};

/**
 * Crosshair axis pointer. Vertical + horizontal dashed lines snap to
 * the cursor; small dark label badges show the x and y axis values
 * exactly where the cross intersects the axes. Used on line / bar /
 * horizontal-bar charts so a hover surfaces the precise (x, y) value
 * pair without forcing the user to read the chart edges.
 */
export const CROSS_AXIS_POINTER = {
  type: 'cross' as const,
  crossStyle: {
    color: CHART_COLORS.borderStrong,
    type: 'dashed' as const,
    width: 1,
  },
  lineStyle: {
    color: CHART_COLORS.borderStrong,
    type: 'dashed' as const,
    width: 1,
  },
  label: {
    backgroundColor: CHART_COLORS.ink,
    color: CHART_COLORS.inkOn,
    fontFamily: FONT_MONO,
    fontSize: 10,
    padding: [3, 6, 3, 6] as [number, number, number, number],
    borderRadius: 3,
  },
};

/**
 * Top-left small legend. Chip-style colored squares (8x8) with muted
 * label text, ~14px gap between entries. Anchored to the chart's
 * top-left corner so it reads as part of the chart frame rather than
 * floating chrome on the right.
 */
export const CHART_LEGEND_TOP_LEFT = {
  left: 0,
  top: 0,
  type: 'plain' as const,
  itemWidth: 8,
  itemHeight: 8,
  itemGap: 14,
  icon: 'roundRect' as const,
  textStyle: {
    fontFamily: FONT_SANS,
    fontSize: 11,
    color: CHART_COLORS.muted,
  },
  inactiveColor: CHART_COLORS.faint,
};

/**
 * Value axis with horizontal dashed split lines — the "y-axis grid"
 * that makes column charts readable at a glance. Tick labels rendered
 * in monospace 10px so they don't compete with category labels.
 */
export const VALUE_AXIS_WITH_GRID = {
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

/**
 * Category axis. The axis line is the only horizontal rule; no split
 * lines (those belong on the value axis), no ticks. Labels in mono.
 */
export const CATEGORY_AXIS = {
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
