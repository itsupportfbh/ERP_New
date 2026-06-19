import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
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

// Purchase
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

const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'app',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '',                              redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',                     component: DashboardComponent  },
      { path: 'sales-order',                   component: SalesOrderComponent },
      { path: 'sales-order/new',               component: NewOrderComponent   },
      { path: 'inventory',                     component: InventoryComponent  },
      { path: 'business-partners',             component: BusinessPartnersComponent },
      { path: 'business-partners/:type/:id',   component: PartnerFormComponent   },
      { path: 'user-access/new',               component: UserAccessComponent     },
      { path: 'user-access/:id',               component: UserAccessComponent     },
      { path: 'demo',                          component: DemoComponent       },

      // ── Purchase ────────────────────────────────────────
      { path: 'purchase/requests',             component: PurchaseRequestListComponent },
      { path: 'purchase/requests/new',         component: PurchaseRequestFormComponent },
      { path: 'purchase/requests/:id',         component: PurchaseRequestFormComponent },

      { path: 'purchase/orders',               component: PurchaseOrderListComponent },
      { path: 'purchase/orders/new',           component: PurchaseOrderFormComponent },
      { path: 'purchase/orders/:id',           component: PurchaseOrderFormComponent },

      { path: 'purchase/rfq',                  component: RfqListComponent },
      { path: 'purchase/rfq/new',              component: RfqFormComponent },
      { path: 'purchase/rfq/:id',              component: RfqFormComponent },

      { path: 'purchase/grn',                  component: GrnListComponent },
      { path: 'purchase/grn/new',              component: GrnFormComponent },
      { path: 'purchase/grn/:id',              component: GrnFormComponent },

      { path: 'purchase/supplier-invoice',     component: SupplierInvoiceListComponent },
      { path: 'purchase/supplier-invoice/new', component: SupplierInvoiceFormComponent },
      { path: 'purchase/supplier-invoice/:id', component: SupplierInvoiceFormComponent },

      { path: 'purchase/debit-note',           component: DebitNoteListComponent },
      { path: 'purchase/debit-note/new',       component: DebitNoteFormComponent },
      { path: 'purchase/debit-note/:id',       component: DebitNoteFormComponent },

      { path: 'purchase/scorecard',            component: SupplierScorecardComponent },
      { path: 'purchase/three-way-match',      component: ThreeWayMatchComponent },
    ]
  },
  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
