import { Component, Input, Output, EventEmitter, forwardRef, HostListener, ElementRef, ViewChild, OnInit, OnDestroy, NgZone } from '@angular/core';
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
export class DropdownComponent implements ControlValueAccessor, OnInit, OnDestroy {
  @Input() label = '';
  @Input() placeholder = 'Select...';
  @Input() options: DropdownOption[] = [];
  @Input() items: any[] = [];
  @Input() bindLabel = 'label';
  @Input() bindValue = 'value';
  @Input() required = false;
  @Input() disabled = false;
  @Input() errorMsg = '';
  /** Optional minimum width (px) for the dropdown panel. Useful for long labels. */
  @Input() menuMinWidth = 0;
  /** When true, shows a "+ Add new" row at the bottom of the menu so the user
   *  can create a missing master value inline without leaving the form. */
  @Input() allowAdd = false;
  /** Word shown in the add row, e.g. addTypeLabel="Country" → "+ Add new Country". */
  @Input() addTypeLabel = '';
  /** Emits the current search text when the user clicks the add row. */
  @Output() addNew = new EventEmitter<string>();

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  value: any = null;
  open = false;
  touched = false;
  searchText = '';
  menuStyle: { [key: string]: string } = {};

  onChange = (_: any) => {};
  onTouched = () => {};

  constructor(private el: ElementRef, private ngZone: NgZone) {}

  private readonly closeOnDocMousedown = (e: MouseEvent) => {
    if (!this.el.nativeElement.contains(e.target as Node)) {
      this.ngZone.run(() => { this.open = false; });
    }
  };

  /** Scroll events from inner containers don't bubble to window, so listen in the
   *  capture phase to keep the fixed-position menu glued to its trigger. */
  private readonly repositionOnScroll = (e: Event) => {
    if (!this.open) return;
    // Scrolling the menu's own option list must not move the menu.
    const target = e.target as Node;
    const menu: HTMLElement | null = this.el.nativeElement.querySelector('.dd-menu');
    if (menu && (menu === target || menu.contains(target))) return;
    this.ngZone.run(() => this.positionMenu());
  };

  ngOnInit(): void {
    document.addEventListener('mousedown', this.closeOnDocMousedown, true);
    document.addEventListener('scroll', this.repositionOnScroll, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousedown', this.closeOnDocMousedown, true);
    document.removeEventListener('scroll', this.repositionOnScroll, true);
  }

  get resolvedOptions(): DropdownOption[] {
    if (this.items.length) {
      return this.items.map(item => ({
        label: String(item[this.bindLabel] ?? ''),
        value: item[this.bindValue] ?? null
      }));
    }
    return this.options;
  }

  get selectedLabel(): string {
    return this.resolvedOptions.find(o => this.sameValue(o.value, this.value))?.label ?? '';
  }

  get filteredOptions(): DropdownOption[] {
    const q = this.searchText.trim().toLowerCase();
    if (!q) return this.resolvedOptions;
    return this.resolvedOptions.filter(o => o.label.toLowerCase().includes(q));
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

  /**
   * Keyboard behaviour for the focused trigger, so the control works from Tab like a native select:
   *   Enter / Space / ArrowDown / ArrowUp  → open (and focus the search box)
   *   Escape                               → close
   *   Tab                                  → left alone, so focus moves to the next field
   */
  onTriggerKeydown(e: KeyboardEvent): void {
    if (this.disabled) return;

    if (e.key === 'Escape') {
      if (this.open) { this.open = false; e.stopPropagation(); }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // Enter would otherwise submit the surrounding form; Space would scroll the page.
      e.preventDefault();
      if (!this.open) this.toggle();
      else setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 0);
    }
  }

  /** Viewport region the trigger is actually visible in — the viewport intersected
   *  with every scrollable/clipping ancestor. Keeps the menu from drifting over a
   *  sticky header or outside its scroll container. */
  private visibleClipRect(el: HTMLElement): { top: number; bottom: number } {
    let top = 0;
    let bottom = window.innerHeight;
    let node = el.parentElement;
    while (node && node !== document.body) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') {
        const b = node.getBoundingClientRect();
        top = Math.max(top, b.top);
        bottom = Math.min(bottom, b.bottom);
      }
      node = node.parentElement;
    }
    return { top, bottom };
  }

  /** Calculate fixed position so the menu escapes overflow:hidden parents */
  positionMenu(): void {
    const trigger: HTMLElement = this.el.nativeElement.querySelector('.dd-trigger');
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();

    // Trigger scrolled out of its container (e.g. behind the sticky header) —
    // don't leave the menu floating on its own over the navbar.
    const clip = this.visibleClipRect(trigger);
    if (r.bottom <= clip.top || r.top >= clip.bottom) {
      this.open = false;
      return;
    }

    const menuH = 188;
    const spaceBelow = clip.bottom - r.bottom;
    const spaceAbove = r.top - clip.top;
    const openUp = spaceBelow < menuH + 8 && spaceAbove > menuH;

    // Widen the panel when requested, but keep it inside the viewport.
    const desiredWidth = this.menuMinWidth > 0 ? Math.max(r.width, this.menuMinWidth) : r.width;
    const maxRight = window.innerWidth - 8;
    const left = (r.left + desiredWidth > maxRight) ? Math.max(8, maxRight - desiredWidth) : r.left;

    this.menuStyle = {
      position: 'fixed',
      left:  `${left}px`,
      width: `${desiredWidth}px`,
      zIndex: '9999',
      ...(openUp
        ? { bottom: `${window.innerHeight - r.top + 2}px`, top: 'auto' }
        : { top: `${r.bottom + 2}px`, bottom: 'auto' })
    };
  }

  select(opt: DropdownOption, e?: MouseEvent): void {
    e?.preventDefault();
    this.value = opt.value;
    this.onChange(opt.value);
    this.open = false;
  }

  clear(e: MouseEvent): void {
    e.stopPropagation();
    this.value = null;
    this.onChange(null);
  }

  /** User clicked the "+ Add new" row — hand the typed text back to the parent. */
  triggerAdd(e?: Event): void {
    e?.preventDefault();
    e?.stopPropagation();
    this.addNew.emit(this.searchText.trim());
    this.open = false;
  }

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
