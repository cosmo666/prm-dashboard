export const environment = {
  production: true,
  apiBaseUrl: '/api',
  loggingEnabled: false,
  // POC compromise: seed data is committed at fixed dates (Dec 2025 – Mar 2026).
  // Anchoring `applyDefault()` and the date-preset resolver to the last day of
  // the seed range so the dashboard's default MTD/Last-N-Days landings show
  // real data instead of an empty range. When real data flows continuously
  // (post-cutover), set this back to '' to fall through to `new Date()`.
  pocToday: '2026-03-31',
};
