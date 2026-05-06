/**
 * Resolves the tenant's primary color at chart-build time.
 *
 * echarts 4.9.0 cannot read CSS custom properties directly — chart options
 * must hold a literal color string. We read `--app-primary` off `:root`
 * (set by AppComponent from `TenantStore.tenant$.primaryColor`) and pass
 * the hex/oklch string straight into series options. SSR / non-browser
 * contexts get the design-default `#2563EB`.
 */
export function resolvePrimary(): string {
  if (typeof document === 'undefined') { return '#2563EB'; }
  const v = getComputedStyle(document.documentElement).getPropertyValue('--app-primary').trim();
  return v || '#2563EB';
}
