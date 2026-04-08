import {
  Component,
  HostListener,
  ViewChild,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FilterStore } from '../../../core/store/filter.store';
import { NavigationStore } from '../../../core/store/navigation.store';
import { ThemeService } from '../../../core/theme/theme.service';
import { AuthService } from '../../../core/auth/auth.service';
import { resolvePreset } from '../../../features/dashboard/utils/date-presets';

interface Command {
  id: string;
  label: string;
  section: string;
  keywords?: string[];
  shortcut?: string;
  icon?: string; // SVG inner markup
  run(): void;
}

/**
 * Linear-style Cmd+K / Ctrl+K command palette. Mounted once globally from
 * AppComponent. Hidden by default; listens for Cmd+K anywhere in the app.
 */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open()) {
      <div class="cp-backdrop" (click)="close()" aria-hidden="true"></div>
      <div
        class="cp-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        (click)="$event.stopPropagation()">
        <div class="cp-search">
          <svg class="cp-search__icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input
            #searchInput
            type="text"
            class="cp-search__input"
            placeholder="Type a command or search..."
            autocomplete="off"
            spellcheck="false"
            [ngModel]="query()"
            (ngModelChange)="onQueryChange($event)"
            (keydown)="onKeydown($event)" />
          <button
            type="button"
            class="cp-search__esc font-data"
            aria-label="Close command palette"
            (click)="close()">esc</button>
        </div>

        <div class="cp-divider"></div>

        <div class="cp-list" role="listbox" #listEl>
          @if (filtered().length === 0) {
            <div class="cp-empty">
              <div class="cp-empty__title">No matching commands</div>
              <div class="cp-empty__hint">Try "dashboard", "theme", or "sign out"</div>
            </div>
          } @else {
            @for (group of grouped(); track group.section) {
              <div class="cp-group">
                <div class="cp-group__head label-micro">{{ group.section }}</div>
                @for (cmd of group.items; track cmd.id) {
                  <button
                    type="button"
                    class="cp-row"
                    role="option"
                    [class.selected]="cmd.id === selectedId()"
                    [attr.data-cmd-id]="cmd.id"
                    (mouseenter)="selectById(cmd.id)"
                    (click)="run(cmd)">
                    <span class="cp-row__icon" [innerHTML]="cmd.icon || defaultIcon"></span>
                    <span class="cp-row__label">{{ cmd.label }}</span>
                    @if (cmd.shortcut) {
                      <span class="cp-row__kbd font-data">{{ cmd.shortcut }}</span>
                    }
                  </button>
                }
              </div>
            }
          }
        </div>

        <div class="cp-divider"></div>

        <div class="cp-footer">
          <span class="cp-footer__hint font-data">
            <span class="cp-kbd">↑↓</span> navigate
            <span class="cp-sep">·</span>
            <span class="cp-kbd">↵</span> run
            <span class="cp-sep">·</span>
            <span class="cp-kbd">esc</span> close
          </span>
          <span class="cp-footer__count font-data">{{ filtered().length }} commands</span>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    @keyframes cpFadeIn { from { opacity: 0; } to { opacity: 1; } }

    @keyframes cpModalIn {
      from { opacity: 0; transform: translate(-50%, -4px) scale(0.97); }
      to   { opacity: 1; transform: translate(-50%, 0)    scale(1); }
    }

    .cp-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 9998;
      animation: cpFadeIn 180ms ease;
    }

    .cp-modal {
      position: fixed;
      top: 18%;
      left: 50%;
      transform: translate(-50%, 0);
      width: 560px;
      max-width: calc(100vw - 32px);
      max-height: 60vh;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: var(--shadow-elevated);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 9999;
      animation: cpModalIn 300ms cubic-bezier(0.2, 0, 0, 1);
      font-family: var(--font-sans);
    }

    .cp-search {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
    }

    .cp-search__icon {
      color: var(--muted);
      flex-shrink: 0;
    }

    .cp-search__input {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      font-family: var(--font-sans);
      font-size: 16px;
      color: var(--ink);
      padding: 0;
    }

    .cp-search__input::placeholder {
      color: var(--muted);
    }

    .cp-search__esc {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--muted);
      font-size: 10px;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 160ms ease, border-color 160ms ease;
    }

    .cp-search__esc:hover {
      color: var(--ink);
      border-color: var(--border-strong);
    }

    .cp-divider {
      height: 1px;
      background: var(--border);
    }

    .cp-list {
      flex: 1;
      overflow-y: auto;
      padding: 6px 6px 10px;
      min-height: 0;
    }

    .cp-empty {
      padding: 32px 16px;
      text-align: center;
    }

    .cp-empty__title {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 4px;
    }

    .cp-empty__hint {
      font-size: 11px;
      color: var(--muted);
    }

    .cp-group { margin-top: 6px; }
    .cp-group:first-child { margin-top: 0; }

    .cp-group__head {
      padding: 10px 12px 6px;
      color: var(--muted);
      font-size: 10px;
    }

    .cp-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 9px 12px;
      background: transparent;
      border: none;
      border-left: 2px solid transparent;
      border-radius: 6px;
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--ink);
      cursor: pointer;
      text-align: left;
      transition: background 140ms ease, border-color 140ms ease;
    }

    .cp-row.selected {
      background: var(--surface-2);
      border-left-color: var(--accent);
    }

    .cp-row__icon {
      color: var(--muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .cp-row.selected .cp-row__icon {
      color: var(--accent-fg);
    }

    .cp-row__label {
      flex: 1;
      color: var(--ink);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cp-row.selected .cp-row__label {
      color: var(--accent-fg);
      font-weight: 500;
    }

    .cp-row__kbd {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--muted);
      font-size: 10px;
      flex-shrink: 0;
    }

    .cp-row.selected .cp-row__kbd {
      background: var(--surface);
    }

    .cp-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: var(--surface-2);
    }

    .cp-footer__hint {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 10px;
    }

    .cp-kbd {
      display: inline-flex;
      align-items: center;
      padding: 1px 5px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 3px;
      color: var(--ink);
      font-size: 10px;
    }

    .cp-sep {
      color: var(--border-strong);
    }

    .cp-footer__count {
      color: var(--muted);
      font-size: 10px;
    }

    @media (max-width: 640px) {
      .cp-modal {
        top: 8%;
        width: calc(100vw - 24px);
      }
      .cp-search__input { font-size: 15px; }
    }
  `],
})
export class CommandPaletteComponent implements AfterViewInit {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('listEl') listEl?: ElementRef<HTMLDivElement>;

  private router = inject(Router);
  private filters = inject(FilterStore);
  private nav = inject(NavigationStore);
  private theme = inject(ThemeService);
  private auth = inject(AuthService);

  readonly defaultIcon = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.2"/></svg>`;

  open = signal(false);
  query = signal('');
  selectedId = signal<string | null>(null);

  private readonly allCommands: Command[] = this.buildCommands();

  readonly filtered = computed<Command[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.allCommands;
    const terms = q.split(/\s+/).filter(Boolean);
    const matching = this.allCommands.filter((c) => {
      const hay = (c.label + ' ' + (c.keywords ?? []).join(' ')).toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    // Sort: exact label match > starts-with > includes
    return matching.sort((a, b) => this.rank(a, q) - this.rank(b, q));
  });

  readonly grouped = computed(() => {
    const groups = new Map<string, Command[]>();
    for (const cmd of this.filtered()) {
      const list = groups.get(cmd.section) ?? [];
      list.push(cmd);
      groups.set(cmd.section, list);
    }
    return Array.from(groups.entries()).map(([section, items]) => ({ section, items }));
  });

  constructor() {
    // Whenever the filtered list changes (via query typing), reset selection
    // to the first item so Enter always has something to run.
    effect(() => {
      const list = this.filtered();
      const current = this.selectedId();
      if (list.length === 0) {
        this.selectedId.set(null);
        return;
      }
      if (!current || !list.some((c) => c.id === current)) {
        this.selectedId.set(list[0].id);
      }
    }, { allowSignalWrites: true });
  }

  ngAfterViewInit(): void { /* no-op */ }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(e: KeyboardEvent): void {
    const isToggle = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
    if (isToggle) {
      e.preventDefault();
      this.toggle();
      return;
    }
    if (this.open() && e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  // Handled in-input so arrow/enter don't fire twice
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveSelection(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const id = this.selectedId();
      const cmd = this.filtered().find((c) => c.id === id);
      if (cmd) this.run(cmd);
    }
  }

  onQueryChange(value: string): void {
    this.query.set(value);
  }

  toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  show(): void {
    this.query.set('');
    this.open.set(true);
    // Focus the input after the next render
    setTimeout(() => this.searchInput?.nativeElement.focus(), 30);
  }

  close(): void {
    this.open.set(false);
  }

  selectById(id: string): void {
    this.selectedId.set(id);
  }

  run(cmd: Command): void {
    this.close();
    // Give the modal a frame to unmount before navigation/tab switch fires
    queueMicrotask(() => cmd.run());
  }

  private moveSelection(delta: number): void {
    const list = this.filtered();
    if (list.length === 0) return;
    const id = this.selectedId();
    const idx = list.findIndex((c) => c.id === id);
    let next = idx + delta;
    if (next < 0) next = list.length - 1;
    if (next >= list.length) next = 0;
    this.selectedId.set(list[next].id);
    // Scroll the newly selected row into view
    setTimeout(() => {
      const el = this.listEl?.nativeElement.querySelector(
        `[data-cmd-id="${list[next].id}"]`,
      ) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  private rank(cmd: Command, q: string): number {
    const label = cmd.label.toLowerCase();
    if (label === q) return 0;
    if (label.startsWith(q)) return 1;
    if (label.includes(q)) return 2;
    return 3;
  }

  // ----- Command definitions -----
  private buildCommands(): Command[] {
    const onDashboard = () => this.router.url.startsWith('/dashboard');
    const setPreset = (key: 'today' | 'last7' | 'mtd' | 'last30') => {
      if (!onDashboard()) {
        this.router.navigate(['/dashboard']).then(() => {
          const r = resolvePreset(key);
          this.filters.setDateRange(key, r.from, r.to);
        });
      } else {
        const r = resolvePreset(key);
        this.filters.setDateRange(key, r.from, r.to);
      }
    };

    const navAndTab = (idx: number) => {
      const go = () => this.nav.requestTab(idx);
      if (onDashboard()) {
        go();
      } else {
        this.router.navigate(['/dashboard']).then(() => {
          // Give the dashboard component a moment to initialize its effects
          setTimeout(go, 0);
        });
      }
    };

    return [
      // Navigation
      {
        id: 'nav.home',
        section: 'Navigation',
        label: 'Go to Home',
        keywords: ['home', 'tile', 'picker'],
        icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 6l5-4 5 4v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
        run: () => this.router.navigate(['/home']),
      },
      {
        id: 'nav.dashboard',
        section: 'Navigation',
        label: 'Go to Dashboard',
        keywords: ['dashboard', 'analytics', 'prm'],
        icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="4" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="8" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="2" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="7" width="4" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>`,
        run: () => this.router.navigate(['/dashboard']),
      },
      {
        id: 'nav.tab.overview',
        section: 'Navigation',
        label: 'Go to Dashboard → Overview',
        keywords: ['overview', 'kpi', 'summary'],
        run: () => navAndTab(0),
      },
      {
        id: 'nav.tab.top10',
        section: 'Navigation',
        label: 'Go to Dashboard → Top 10',
        keywords: ['top', '10', 'ranking', 'airlines'],
        run: () => navAndTab(1),
      },
      {
        id: 'nav.tab.breakup',
        section: 'Navigation',
        label: 'Go to Dashboard → Service Breakup',
        keywords: ['service', 'breakup', 'breakdown', 'pie', 'donut'],
        run: () => navAndTab(2),
      },
      {
        id: 'nav.tab.fulfillment',
        section: 'Navigation',
        label: 'Go to Dashboard → Fulfillment',
        keywords: ['fulfillment', 'sla', 'performance'],
        run: () => navAndTab(3),
      },

      // Filters
      {
        id: 'filter.today',
        section: 'Filters',
        label: 'Set date: Today',
        keywords: ['today', 'date', 'preset'],
        icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.25" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 5.5h11M4.5 1v2M9.5 1v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
        run: () => setPreset('today'),
      },
      {
        id: 'filter.last7',
        section: 'Filters',
        label: 'Set date: Last 7 Days',
        keywords: ['last', '7', 'week', 'date'],
        run: () => setPreset('last7'),
      },
      {
        id: 'filter.mtd',
        section: 'Filters',
        label: 'Set date: Month to Date',
        keywords: ['month', 'mtd', 'date'],
        run: () => setPreset('mtd'),
      },
      {
        id: 'filter.last30',
        section: 'Filters',
        label: 'Set date: Last 30 Days',
        keywords: ['last', '30', 'month', 'date'],
        run: () => setPreset('last30'),
      },
      {
        id: 'filter.clear',
        section: 'Filters',
        label: 'Clear all filters',
        keywords: ['clear', 'reset', 'filters'],
        icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
        run: () => this.filters.clearSecondary(),
      },

      // Theme
      {
        id: 'theme.toggle',
        section: 'Theme',
        label: 'Toggle theme (light / dark)',
        keywords: ['theme', 'dark', 'light', 'mode'],
        shortcut: '',
        icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 8.5A4.5 4.5 0 1 1 5.5 3a3.5 3.5 0 0 0 5.5 5.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
        run: () => this.theme.toggle(),
      },

      // Account
      {
        id: 'account.signout',
        section: 'Account',
        label: 'Sign out',
        keywords: ['logout', 'sign', 'out', 'exit'],
        icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M6 2.5H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3M9 4.5L12 7l-3 2.5M5.5 7H12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        run: () => this.auth.logout(),
      },
    ];
  }
}
