import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { DataTableComponent } from './components/data-table/data-table.component';
import { InputFieldComponent } from './components/input-field/input-field.component';
import { DropdownComponent } from './components/dropdown/dropdown.component';
import { MultiselectDropdownComponent } from './components/multiselect-dropdown/multiselect-dropdown.component';
import { SwitchToggleComponent } from './components/switch-toggle/switch-toggle.component';
import { PagerComponent } from './components/pager/pager.component';
import { MasterPopupComponent } from './components/master-popup/master-popup.component';
import { ClickOutsideDirective } from './directives/click-outside.directive';

const COMPONENTS = [
  DataTableComponent,
  InputFieldComponent,
  DropdownComponent,
  MultiselectDropdownComponent,
  SwitchToggleComponent,
  PagerComponent,
  MasterPopupComponent,
  ClickOutsideDirective,
];

@NgModule({
  declarations: COMPONENTS,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  exports: [...COMPONENTS, CommonModule, FormsModule, ReactiveFormsModule],
})
export class SharedModule {}
