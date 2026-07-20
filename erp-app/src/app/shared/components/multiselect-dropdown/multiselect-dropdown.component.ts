import { Component, Input, forwardRef, HostListener, ElementRef, OnInit, OnDestroy, NgZone } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DropdownOption } from '../dropdown/dropdown.component';
import { rankSearchResults } from '../../utils/search-ranking';

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
export class MultiselectDropdownComponent implements ControlValueAccessor, OnInit, OnDestroy {
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

  constructor(private el: ElementRef, private ngZone: NgZone) {}

  private readonly closeOnDocMousedown = (e: MouseEvent) => {
    if (!this.el.nativeElement.contains(e.target as Node)) {
      this.ngZone.run(() => { this.open = false; this.search = ''; });
    }
  };

  ngOnInit(): void {
    document.addEventListener('mousedown', this.closeOnDocMousedown, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousedown', this.closeOnDocMousedown, true);
  }

  get filteredOptions(): DropdownOption[] {
    return rankSearchResults(this.options, this.search, option => option.label);
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

  /** Open/close from the keyboard so the control is usable once Tab lands on it; Tab itself is left
   *  alone so focus continues to the next field. */
  onTriggerKeydown(e: KeyboardEvent): void {
    if (this.disabled) return;

    if (e.key === 'Escape') {
      if (this.open) { this.open = false; e.stopPropagation(); }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.toggle();
    }
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

  toggleOption(opt: DropdownOption, e?: MouseEvent): void {
    e?.preventDefault();
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
