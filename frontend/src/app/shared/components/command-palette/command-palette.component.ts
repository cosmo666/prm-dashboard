import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FilterStore, DatePreset } from 'src/app/core/store/filter.store';
import { NavigationStore } from 'src/app/core/store/navigation.store';
import { ThemeService } from 'src/app/core/theme/theme.service';
import { AuthService } from 'src/app/core/auth/auth.service';
import { resolvePreset } from 'src/app/features/dashboard/utils/date-presets';

interface Command {
  id: string;
  label: string;
  section: string;
  keywords?: string[];
  shortcut?: string;
  icon?: string;
  run(): void;
}

// queueMicrotask is widely available (Chromium 71+, Node 12+, Firefox 69+),
// but in Karma's older Chrome we play it safe with a setTimeout fallback.
// tslint:disable-next-line: no-any
const _queueMicrotask: (fn: () => void) => void =
  typeof (window as any).queueMicrotask === 'function'
    ? (window as any).queueMicrotask.bind(window)
    : (fn: () => void) => setTimeout(fn, 0);

@Component({
  selector: 'app-command-palette',
  templateUrl: './command-palette.component.html',
  styleUrls: ['./command-palette.component.scss'],
})
export class CommandPaletteComponent {
  @ViewChild('searchInput', { static: false }) searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('listEl',      { static: false }) listEl!: ElementRef<HTMLDivElement>;

  isOpen = false;
  query = '';
  selectedId: string | null = null;

  // Default icon used for any command that doesn't ship its own SVG.
  // Inlined as a string so [innerHTML] can render it without DomSanitizer.
  readonly defaultIcon =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.2"/>' +
    '</svg>';

  private readonly allCommands: Command[];

  constructor(
    private router: Router,
    private filters: FilterStore,
    private navStore: NavigationStore,
    private theme: ThemeService,
    private auth: AuthService,
  ) {
    this.allCommands = this.buildCommands();
  }

  /**
   * Filtered + sorted commands for the current query. Re-evaluated
   * on every CD cycle while the palette is open. Cheap enough at ~14
   * commands that we don't bother memoising.
   */
  get filtered(): Command[] {
    const q = this.query.trim().toLowerCase();
    if (!q) { return this.allCommands; }
    const terms = q.split(/\s+/).filter(t => t.length > 0);
    const matching = this.allCommands.filter(c => {
      const hay = (c.label + ' ' + (c.keywords || []).join(' ')).toLowerCase();
      for (const t of terms) {
        if (hay.indexOf(t) < 0) { return false; }
      }
      return true;
    });
    return matching.sort((a, b) => this.rank(a, q) - this.rank(b, q));
  }

  /** Group filtered commands by section, preserving insertion order. */
  get grouped(): Array<{ section: string; items: Command[] }> {
    const order: string[] = [];
    const buckets: { [section: string]: Command[] } = {};
    for (const cmd of this.filtered) {
      if (!buckets[cmd.section]) { buckets[cmd.section] = []; order.push(cmd.section); }
      buckets[cmd.section].push(cmd);
    }
    return order.map(section => ({ section, items: buckets[section] }));
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(e: KeyboardEvent): void {
    const isToggle = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
    if (isToggle) {
      e.preventDefault();
      this.toggle();
      return;
    }
    if (this.isOpen && e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  /** Handled in-input so arrow/enter don't bubble to the global listener. */
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveSelection(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = this.filtered.filter(c => c.id === this.selectedId)[0];
      if (cmd) { this.run(cmd); }
    }
  }

  /**
   * ngModelChange handler; resets the selection to the first hit each
   * time the filtered list changes (so Enter always has a target).
   */
  onQueryChange(value: string): void {
    this.query = value;
    const list = this.filtered;
    if (list.length === 0) {
      this.selectedId = null;
    } else {
      const stillVisible = list.filter(c => c.id === this.selectedId).length > 0;
      if (!stillVisible) { this.selectedId = list[0].id; }
    }
  }

  toggle(): void { if (this.isOpen) { this.close(); } else { this.show(); } }

  show(): void {
    this.query = '';
    this.isOpen = true;
    if (this.allCommands.length > 0) { this.selectedId = this.allCommands[0].id; }
    setTimeout(() => {
      if (this.searchInput) { this.searchInput.nativeElement.focus(); }
    }, 30);
  }

  close(): void { this.isOpen = false; }

  selectById(id: string): void { this.selectedId = id; }

  /**
   * Run a command. Always close the palette FIRST, then defer the
   * command to the next microtask so the modal has a frame to unmount
   * before navigation/tab-switch fires (otherwise the previous
   * dashboard renders one frame on top of itself, looks janky).
   */
  run(cmd: Command): void {
    this.close();
    _queueMicrotask(() => cmd.run());
  }

  private moveSelection(delta: number): void {
    const list = this.filtered;
    if (list.length === 0) { return; }
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === this.selectedId) { idx = i; break; }
    }
    let next = idx + delta;
    if (next < 0) { next = list.length - 1; }
    if (next >= list.length) { next = 0; }
    this.selectedId = list[next].id;
    setTimeout(() => {
      if (!this.listEl) { return; }
      const sel = '[data-cmd-id="' + list[next].id + '"]';
      // tslint:disable-next-line: no-any
      const el = this.listEl.nativeElement.querySelector(sel) as any;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    }, 0);
  }

  /**
   * Sort key — exact match wins, then prefix, then substring. Same
   * scheme as main; kept simple over a fuzzy/Levenshtein scorer.
   */
  private rank(cmd: Command, q: string): number {
    const label = cmd.label.toLowerCase();
    if (label === q) { return 0; }
    if (label.indexOf(q) === 0) { return 1; }
    if (label.indexOf(q) >= 0) { return 2; }
    return 3;
  }

  private buildCommands(): Command[] {
    const onDashboard = () => this.router.url.indexOf('/dashboard') === 0;
    const setPreset = (key: DatePreset) => {
      const apply = () => {
        const r = resolvePreset(key);
        this.filters.setDateRange(key, r.from, r.to);
      };
      if (onDashboard()) {
        apply();
      } else {
        this.router.navigate(['/dashboard']).then(apply);
      }
    };
    const navAndTab = (idx: number) => {
      const go = () => this.navStore.requestTab(idx);
      if (onDashboard()) {
        go();
      } else {
        // After navigating to /dashboard, give the dashboard component
        // a microtask to subscribe to requestedTab$ before we fire.
        this.router.navigate(['/dashboard']).then(() => setTimeout(go, 0));
      }
    };
    return [
      // Navigation
      { id: 'nav.home',            section: 'Navigation', label: 'Go to Home',
        keywords: ['home', 'tile', 'picker'],
        run: () => this.router.navigate(['/home']) },
      { id: 'nav.dashboard',       section: 'Navigation', label: 'Go to Dashboard',
        keywords: ['dashboard', 'analytics', 'prm'],
        run: () => this.router.navigate(['/dashboard']) },
      { id: 'nav.tab.overview',    section: 'Navigation', label: 'Dashboard → Overview',
        keywords: ['overview', 'kpi', 'summary'],
        run: () => navAndTab(0) },
      { id: 'nav.tab.top10',       section: 'Navigation', label: 'Dashboard → Top 10',
        keywords: ['top', 'ranking', 'airlines', 'agents'],
        run: () => navAndTab(1) },
      { id: 'nav.tab.breakup',     section: 'Navigation', label: 'Dashboard → Service Breakup',
        keywords: ['service', 'breakup', 'sankey'],
        run: () => navAndTab(2) },
      { id: 'nav.tab.fulfillment', section: 'Navigation', label: 'Dashboard → Fulfillment',
        keywords: ['fulfillment', 'sla', 'walkup'],
        run: () => navAndTab(3) },
      { id: 'nav.tab.insights',    section: 'Navigation', label: 'Dashboard → Insights',
        keywords: ['insights', 'duration', 'patterns'],
        run: () => navAndTab(4) },

      // Filters
      { id: 'filter.today',  section: 'Filters', label: 'Set date: Today',
        keywords: ['today', 'date', 'range'],
        run: () => setPreset('today') },
      { id: 'filter.last7',  section: 'Filters', label: 'Set date: Last 7 Days',
        keywords: ['last', '7', 'week'],
        run: () => setPreset('last7') },
      { id: 'filter.mtd',    section: 'Filters', label: 'Set date: Month to Date',
        keywords: ['month', 'mtd', 'current'],
        run: () => setPreset('mtd') },
      { id: 'filter.last30', section: 'Filters', label: 'Set date: Last 30 Days',
        keywords: ['last', '30', 'month'],
        run: () => setPreset('last30') },
      { id: 'filter.clear',  section: 'Filters', label: 'Clear secondary filters',
        keywords: ['clear', 'reset', 'remove'],
        run: () => this.filters.clearSecondary() },

      // Theme + account
      { id: 'theme.toggle',    section: 'Theme',   label: 'Toggle theme (light / dark)',
        keywords: ['theme', 'dark', 'light', 'mode'],
        run: () => this.theme.toggle() },
      { id: 'account.signout', section: 'Account', label: 'Sign out',
        keywords: ['logout', 'signout', 'exit'],
        run: () => this.auth.logout() },
    ];
  }
}
