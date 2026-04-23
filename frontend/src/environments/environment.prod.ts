export const environment = {
  production: true,
  apiBaseUrl: '/api',
  defaultTenantSlug: '',
  tenantConfigPath: '/api/tenants/config',
  // Empty string means "use real current date". date-presets.ts checks for
  // empty and falls back to `new Date()`. The 2026-03-31 override in
  // environment.ts keeps the dev build anchored to the seed data's last
  // date so charts have something to show.
  pocToday: '',
};
