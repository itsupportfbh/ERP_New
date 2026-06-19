import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'erp-input',
  standalone: false,
  templateUrl: './input-field.component.html',
  styleUrls: ['./input-field.component.scss'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => InputFieldComponent),
    multi: true
  }]
})
export class InputFieldComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() type: 'text' | 'number' | 'email' | 'date' | 'password' = 'text';
  @Input() required = false;
  @Input() disabled = false;
  @Input() errorMsg = '';

  value = '';
  touched = false;

  onChange = (_: any) => {};
  onTouched = () => {};

  onInput(val: string): void {
    this.value = val;
    this.onChange(val);
  }

  onBlur(): void {
    this.touched = true;
    this.onTouched();
  }

  writeValue(val: any): void { this.value = val ?? ''; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }
}
