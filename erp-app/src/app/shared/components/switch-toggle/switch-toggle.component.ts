import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'erp-switch',
  standalone: false,
  templateUrl: './switch-toggle.component.html',
  styleUrls: ['./switch-toggle.component.scss'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => SwitchToggleComponent),
    multi: true
  }]
})
export class SwitchToggleComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() onLabel = 'Yes';
  @Input() offLabel = 'No';
  @Input() disabled = false;

  checked = false;
  onChange = (_: any) => {};
  onTouched = () => {};

  toggle(): void {
    if (!this.disabled) {
      this.checked = !this.checked;
      this.onChange(this.checked);
      this.onTouched();
    }
  }

  writeValue(val: any): void { this.checked = !!val; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; }
}
