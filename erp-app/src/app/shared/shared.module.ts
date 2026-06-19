import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { DataTableComponent } from './components/data-table/data-table.component';
import { InputFieldComponent } from './components/input-field/input-field.component';
import { DropdownComponent } from './components/dropdown/dropdown.component';
import { MultiselectDropdownComponent } from './components/multiselect-dropdown/multiselect-dropdown.component';
import { SwitchToggleComponent } from './components/switch-toggle/switch-toggle.component';
import { PagerComponent } from './components/pager/pager.component';

const COMPONENTS = [
  DataTableComponent,
  InputFieldComponent,
  DropdownComponent,
  MultiselectDropdownComponent,
  SwitchToggleComponent,
  PagerComponent,
];

@NgModule({
  declarations: COMPONENTS,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  exports: [...COMPONENTS, CommonModule, FormsModule, ReactiveFormsModule],
  // CommonModule, FormsModule, ReactiveFormsModule are both imported and exported so consumers get them transitively
})
export class SharedModule {}
