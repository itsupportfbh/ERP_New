import { Component, Input, forwardRef, HostListener, ElementRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DropdownOption } from '../dropdown/dropdown.component';

@Component({
  selector: 'erp-multiselect',
  standalone: false,
  templateUrl: './multiselect-dropdown.component.html',
  styleUrls: ['./multiselect-dropdown.component.scss'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MultiselectDropdownComponent),
    multi: true
  }]
})
export class MultiselectDropdownComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = 'Select...';
  @Input() options: DropdownOption[] = [];
  @Input() required = false;
  @Input() disabled = false;
  @Input() errorMsg = '';

  selected: any[] = [];
  open = false;
  touched = false;
  search = '';
  menuStyle: { [key: string]: string } = {};

  onChange = (_: any) => {};
  onTouched = () => {};

  constructor(private el: ElementRef) {}

  get filteredOptions(): DropdownOption[] {
    const q = this.search.toLowerCase();
    return this.options.filter(o => o.label.toLowerCase().includes(q));
  }

  get displayText(): string {
    if (!this.selected.length) return '';
    if (this.selected.length <= 2)
      return this.selected.map(v => this.options.find(o => this.sameValue(o.value, v))?.label).join(', ');
    return `${this.selected.length} selected`;
  }

  toggle(): void {
    if (this.disabled) return;
    this.open = !this.open;
    this.touched = true;
    this.onTouched();
    if (this.open) this.positionMenu();
  }

  positionMenu(): void {
    const trigger: HTMLElement = this.el.nativeElement.querySelector('.dd-trigger');
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const menuH = 230;
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

  isSelected(val: any): boolean { return this.selected.some(v => this.sameValue(v, val)); }

  toggleOption(opt: DropdownOption): void {
    const idx = this.selected.findIndex(v => this.sameValue(v, opt.value));
    if (idx >= 0) this.selected.splice(idx, 1);
    else this.selected.push(opt.value);
    this.onChange([...this.selected]);
  }

  clearAll(e: MouseEvent): void {
    e.stopPropagation();
    this.selected = [];
    this.onChange([]);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event): void {
    if (!this.el.nativeElement.contains(e.target)) { this.open = false; this.search = ''; }
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewChange(): void { if (this.open) this.positionMenu(); }

  writeValue(val: any[]): void { this.selected = val ? [...val] : []; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; }

  private sameValue(a: any, b: any): boolean {
    return String(a ?? '') === String(b ?? '');
  }
}
