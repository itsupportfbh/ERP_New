import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { SharedModule } from './shared/shared.module';

import { LoginComponent } from './pages/login/login.component';
import { LayoutComponent } from './layout/layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { SalesOrderComponent } from './pages/sales-order/sales-order.component';
import { NewOrderComponent } from './pages/sales-order/new-order/new-order.component';
import { InventoryComponent } from './pages/inventory/inventory.component';
import { DemoComponent } from './pages/demo/demo.component';
import { BusinessPartnersComponent } from './pages/business-partners/business-partners.component';
import { PartnerFormComponent } from './pages/business-partners/partner-form/partner-form.component';
import { UserAccessComponent } from './pages/user-access/user-access.component';

// ── Purchase module ───────────────────────────────────
import { PurchaseRequestListComponent } from './pages/purchase/purchase-request/purchase-request-list.component';
import { PurchaseRequestFormComponent } from './pages/purchase/purchase-request/purchase-request-form.component';
import { PurchaseOrderListComponent } from './pages/purchase/purchase-order/purchase-order-list.component';
import { PurchaseOrderFormComponent } from './pages/purchase/purchase-order/purchase-order-form.component';
import { RfqListComponent } from './pages/purchase/rfq/rfq-list.component';
import { RfqFormComponent } from './pages/purchase/rfq/rfq-form.component';
import { GrnListComponent } from './pages/purchase/grn/grn-list.component';
import { GrnFormComponent } from './pages/purchase/grn/grn-form.component';
import { SupplierInvoiceListComponent } from './pages/purchase/supplier-invoice/supplier-invoice-list.component';
import { SupplierInvoiceFormComponent } from './pages/purchase/supplier-invoice/supplier-invoice-form.component';
import { DebitNoteListComponent } from './pages/purchase/debit-note/debit-note-list.component';
import { DebitNoteFormComponent } from './pages/purchase/debit-note/debit-note-form.component';
import { SupplierScorecardComponent } from './pages/purchase/supplier-scorecard/supplier-scorecard.component';
import { ThreeWayMatchComponent } from './pages/purchase/three-way-match/three-way-match.component';

@NgModule({
  declarations: [
    App,
    LoginComponent,
    LayoutComponent,
    DashboardComponent,
    SalesOrderComponent,
    NewOrderComponent,
    InventoryComponent,
    DemoComponent,
    BusinessPartnersComponent,
    PartnerFormComponent,
    UserAccessComponent,
    // Purchase
    PurchaseRequestListComponent,
    PurchaseRequestFormComponent,
    PurchaseOrderListComponent,
    PurchaseOrderFormComponent,
    RfqListComponent,
    RfqFormComponent,
    GrnListComponent,
    GrnFormComponent,
    SupplierInvoiceListComponent,
    SupplierInvoiceFormComponent,
    DebitNoteListComponent,
    DebitNoteFormComponent,
    SupplierScorecardComponent,
    ThreeWayMatchComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    SharedModule,
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([jwtInterceptor]))
  ],
  bootstrap: [App]
})
export class AppModule {}
