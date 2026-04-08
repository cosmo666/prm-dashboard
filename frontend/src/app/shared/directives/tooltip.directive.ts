import {
  Directive,
  ElementRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  Renderer2,
} from '@angular/core';

/**
 * Lightweight tooltip directive that renders a styled tooltip above (or in a
 * chosen direction from) the host element on hover/focus. Follows the
 * Operations Desk aesthetic — dark ink background, mono-caps label text.
 *
 * Usage:
 *   <button appTooltip="Sign out">...</button>
 *   <div [appTooltip]="label" tooltipPosition="bottom">...</div>
 */
@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnDestroy {
  appTooltip = input.required<string>();
  tooltipPosition = input<'top' | 'bottom' | 'left' | 'right'>('top');
  tooltipDelay = input<number>(350);

  private host = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);

  private tooltipEl: HTMLElement | null = null;
  private showTimer: any = null;

  @HostListener('mouseenter')
  @HostListener('focus')
  onEnter(): void {
    this.cancelTimer();
    this.showTimer = setTimeout(() => this.show(), this.tooltipDelay());
  }

  @HostListener('mouseleave')
  @HostListener('blur')
  onLeave(): void {
    this.cancelTimer();
    this.hide();
  }

  ngOnDestroy(): void {
    this.cancelTimer();
    this.hide();
  }

  private show(): void {
    const text = this.appTooltip();
    if (!text) return;

    const el = this.renderer.createElement('div') as HTMLElement;
    this.renderer.addClass(el, 'app-tooltip');
    this.renderer.setAttribute(el, 'role', 'tooltip');
    this.renderer.setAttribute(el, 'aria-hidden', 'false');
    el.textContent = text;
    this.renderer.appendChild(document.body, el);
    this.tooltipEl = el;

    this.position(el);

    // Trigger mount animation on next frame
    requestAnimationFrame(() => {
      if (this.tooltipEl) {
        this.renderer.addClass(this.tooltipEl, 'app-tooltip--visible');
      }
    });
  }

  private position(el: HTMLElement): void {
    const hostRect = this.host.nativeElement.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();
    const offset = 8;
    let top = 0;
    let left = 0;

    switch (this.tooltipPosition()) {
      case 'bottom':
        top = hostRect.bottom + offset;
        left = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
        break;
      case 'left':
        top = hostRect.top + hostRect.height / 2 - tipRect.height / 2;
        left = hostRect.left - tipRect.width - offset;
        break;
      case 'right':
        top = hostRect.top + hostRect.height / 2 - tipRect.height / 2;
        left = hostRect.right + offset;
        break;
      case 'top':
      default:
        top = hostRect.top - tipRect.height - offset;
        left = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
    }

    // Clamp inside viewport with an 8px margin
    const margin = 8;
    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
    top = Math.max(margin, top);

    this.renderer.setStyle(el, 'top', `${top + window.scrollY}px`);
    this.renderer.setStyle(el, 'left', `${left + window.scrollX}px`);
  }

  private hide(): void {
    if (this.tooltipEl) {
      const el = this.tooltipEl;
      this.tooltipEl = null;
      this.renderer.removeClass(el, 'app-tooltip--visible');
      // Delay removal until the fade-out finishes
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 140);
    }
  }

  private cancelTimer(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }
}
