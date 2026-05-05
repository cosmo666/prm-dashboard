import {
  Component, Input, AfterContentInit, OnDestroy, ElementRef, HostBinding,
} from '@angular/core';
import { Subject, fromEvent, merge } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-form-field',
  templateUrl: './form-field.component.html',
  styleUrls: ['./form-field.component.scss'],
})
export class FormFieldComponent implements AfterContentInit, OnDestroy {
  @Input() label = '';
  @Input() hint: string | undefined;
  @Input() error: string | undefined;

  @HostBinding('class.app-form-field') readonly hostClass = true;
  @HostBinding('class.is-focused') focused = false;
  @HostBinding('class.has-value') hasValue = false;
  @HostBinding('class.has-error') get hasError(): boolean { return !!this.error; }

  private destroy$ = new Subject<void>();

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterContentInit(): void {
    const inputEl = this.host.nativeElement.querySelector(
      'input, textarea, select, .p-dropdown, .p-multiselect, .p-calendar'
    ) as HTMLElement | null;
    if (!inputEl) { return; }

    merge(
      fromEvent(inputEl, 'focus'),
      fromEvent(inputEl, 'focusin'),
    ).pipe(takeUntil(this.destroy$)).subscribe(() => { this.focused = true; });

    merge(
      fromEvent(inputEl, 'blur'),
      fromEvent(inputEl, 'focusout'),
    ).pipe(takeUntil(this.destroy$)).subscribe(() => { this.focused = false; });

    fromEvent(inputEl, 'input').pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.hasValue = this.readValue(inputEl);
    });
    // Initial value check (after content init, ngModel may have populated already)
    setTimeout(() => { this.hasValue = this.readValue(inputEl); }, 0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private readValue(el: HTMLElement): boolean {
    const input = el as HTMLInputElement;
    if (typeof input.value === 'string') { return input.value.length > 0; }
    return false;
  }
}
