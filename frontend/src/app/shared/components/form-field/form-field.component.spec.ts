import { Component, ViewChild } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { FormFieldComponent } from './form-field.component';

@Component({
  template: `
    <app-form-field [label]="label" [hint]="hint" [error]="error">
      <input pInputText [(ngModel)]="value">
    </app-form-field>
  `,
})
class HostComponent {
  label = 'Email';
  hint: string | undefined;
  error: string | undefined;
  value = '';
  @ViewChild(FormFieldComponent, { static: true }) field!: FormFieldComponent;
}

describe('FormFieldComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, InputTextModule],
      declarations: [FormFieldComponent, HostComponent],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the label', () => {
    const labelEl = fixture.nativeElement.querySelector('.field-label');
    expect(labelEl.textContent.trim()).toBe('Email');
  });

  it('idle state: no .is-focused, no .has-value, no .has-error', () => {
    const root = fixture.nativeElement.querySelector('.app-form-field');
    expect(root.classList.contains('is-focused')).toBe(false);
    expect(root.classList.contains('has-value')).toBe(false);
    expect(root.classList.contains('has-error')).toBe(false);
  });

  it('adds .has-value when value changes', () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'a@b.com';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const root = fixture.nativeElement.querySelector('.app-form-field');
    expect(root.classList.contains('has-value')).toBe(true);
  });

  it('renders a hint when hint is set', () => {
    host.hint = 'We never share emails';
    fixture.detectChanges();
    const hintEl = fixture.nativeElement.querySelector('.field-hint');
    expect(hintEl.textContent.trim()).toBe('We never share emails');
  });

  it('renders an error and adds .has-error class when error is set', () => {
    host.error = 'Required';
    fixture.detectChanges();
    const root = fixture.nativeElement.querySelector('.app-form-field');
    expect(root.classList.contains('has-error')).toBe(true);
    const errEl = fixture.nativeElement.querySelector('.field-error');
    expect(errEl.textContent.trim()).toBe('Required');
  });
});
