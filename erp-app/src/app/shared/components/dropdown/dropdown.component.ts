import { Component, Input, forwardRef, HostListener, ElementRef, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface DropdownOption { label: string; value: any; }

@Component({
  selector: 'erp-dropdown',
  standalone: false,
  templateUrl: './dropdown.component.html',
  styleUrls: ['./dropdown.component.scss'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => DropdownComponent),
    multi: true
  }]
})
export class DropdownComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = 'Select...';
  @Input() options: DropdownOption[] = [];
  @Input() required = false;
  @Input() disabled = false;
  @Input() errorMsg = '';

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  value: any = null;
  open = false;
  touched = false;
  searchText = '';
  menuStyle: { [key: string]: string } = {};

  onChange = (_: any) => {};
  onTouched = () => {};

  constructor(private el: ElementRef) {}

  get selectedLabel(): string {
    return this.options.find(o => this.sameValue(o.value, this.value))?.label ?? '';
  }

  get filteredOptions(): DropdownOption[] {
    const q = this.searchText.trim().toLowerCase();
    if (!q) return this.options;
    return this.options.filter(o => o.label.toLowerCase().includes(q));
  }

  toggle(): void {
    if (this.disabled) return;
    this.open = !this.open;
    this.touched = true;
    this.onTouched();
    if (this.open) {
      this.searchText = '';
      this.positionMenu();
      setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 30);
    }
  }

  /** Calculate fixed position so the menu escapes overflow:hidden parents */
  positionMenu(): void {
    const trigger: HTMLElement = this.el.nativeElement.querySelector('.dd-trigger');
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const menuH = 188;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH + 8 && r.top > menuH;

    this.menuStyle = {
      position: 'fixed',
      left:  `${r.left}px`,
      width: `${r.width}px`,
      zIndex: '9999',
      ...(openUp
        ? { bottom: `${window.innerHeight - r.top + 2}px`, top: 'auto' }
        : { top: `${r.bottom + 2}px`, bottom: 'auto' })
    };
  }

  select(opt: DropdownOption): void {
    this.value = opt.value;
    this.onChange(opt.value);
    this.open = false;
  }

  clear(e: MouseEvent): void {
    e.stopPropagation();
    this.value = null;
    this.onChange(null);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event): void {
    if (!this.el.nativeElement.contains(e.target)) this.open = false;
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewChange(): void { if (this.open) this.positionMenu(); }

  writeValue(val: any): void { this.value = val ?? null; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; }

  sameValue(a: any, b: any): boolean {
    return String(a ?? '') === String(b ?? '');
  }
}
