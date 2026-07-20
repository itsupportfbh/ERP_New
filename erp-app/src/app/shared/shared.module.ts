import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { DataTableComponent } from './components/data-table/data-table.component';
import { InputFieldComponent } from './components/input-field/input-field.component';
import { DropdownComponent } from './components/dropdown/dropdown.component';
import { MultiselectDropdownComponent } from './components/multiselect-dropdown/multiselect-dropdown.component';
import { SwitchToggleComponent } from './components/switch-toggle/switch-toggle.component';
import { PagerComponent } from './components/pager/pager.component';
import { DocViewModalComponent } from './components/doc-view-modal/doc-view-modal.component';
import { MasterPopupComponent } from './components/master-popup/master-popup.component';
import { QuickAddModalComponent } from './components/quick-add-modal/quick-add-modal.component';
import { GuideComponent } from './components/guide/guide.component';
import { GuidedJourneyComponent } from './components/guided-journey/guided-journey.component';
import { MoneyPipe } from './pipes/money.pipe';
import { TaxNamePipe } from './pipes/tax-name.pipe';
import { ButtonPermissionDirective } from './directives/button-permission.directive';


const COMPONENTS = [
  DataTableComponent,
  InputFieldComponent,
  DropdownComponent,
  MultiselectDropdownComponent,
  SwitchToggleComponent,
  PagerComponent,
  DocViewModalComponent,
  MasterPopupComponent,
  QuickAddModalComponent,
  GuideComponent,
  GuidedJourneyComponent,
];

const PIPES = [
  MoneyPipe,
  TaxNamePipe,
];

@NgModule({
  declarations: [...COMPONENTS, ButtonPermissionDirective],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ...PIPES],
  exports: [...COMPONENTS, ...PIPES, ButtonPermissionDirective, CommonModule, FormsModule, ReactiveFormsModule],
  // CommonModule, FormsModule, ReactiveFormsModule are both imported and exported so consumers get them transitively
})
export class SharedModule {}
