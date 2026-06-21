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

// Master module components
import { ApprovalLevelComponent } from './pages/master/approval-level/approval-level.component';
import { BankComponent } from './pages/master/bank/bank.component';
import { BinComponent } from './pages/master/bin/bin.component';
import { CategoryComponent } from './pages/master/category/category.component';
import { CitiesComponent } from './pages/master/cities/cities.component';
import { CostingMethodComponent } from './pages/master/costing-method/costing-method.component';
import { CompanyComponent } from './pages/master/company/company.component';
import { CountriesComponent } from './pages/master/countries/countries.component';
import { CurrencyComponent } from './pages/master/currency/currency.component';
import { CustomerGroupsComponent } from './pages/master/customer-groups/customer-groups.component';
import { DepartmentComponent } from './pages/master/department/department.component';
import { DriverComponent } from './pages/master/driver/driver.component';
import { ExchangeRateComponent } from './pages/master/exchange-rate/exchange-rate.component';
import { FlagIssueComponent } from './pages/master/flag-issue/flag-issue.component';
import { IncotermsComponent } from './pages/master/incoterms/incoterms.component';
import { ItemTypeComponent } from './pages/master/item-type/item-type.component';
import { LocationComponent } from './pages/master/location/location.component';
import { ItemSetComponent } from './pages/master/item-set/item-set.component';
import { PaymentTermsComponent } from './pages/master/payment-terms/payment-terms.component';
import { RecurringComponent } from './pages/master/recurring/recurring.component';
import { ServiceComponent } from './pages/master/service/service.component';
import { StatesComponent } from './pages/master/states/states.component';
import { StockIssueComponent } from './pages/master/stock-issue/stock-issue.component';
import { StrategyComponent } from './pages/master/strategy/strategy.component';
import { SupplierGroupsComponent } from './pages/master/supplier-groups/supplier-groups.component';
import { TaxcodeComponent } from './pages/master/taxcode/taxcode.component';
import { UomComponent } from './pages/master/uom/uom.component';
import { UomConversionComponent } from './pages/master/uom-conversion/uom-conversion.component';
import { VehicleComponent } from './pages/master/vehicle/vehicle.component';
import { WarehouseComponent } from './pages/master/warehouse/warehouse.component';     

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

       // Master routes
      { path: 'master/approval-level',  component: ApprovalLevelComponent  },
      { path: 'master/bank-list',       component: BankComponent            },
      { path: 'master/bin',             component: BinComponent             },
      { path: 'master/catagory',        component: CategoryComponent        },
      { path: 'master/cities',          component: CitiesComponent          },
      { path: 'master/coastingmethod',  component: CostingMethodComponent   },
      { path: 'master/companyList',     component: CompanyComponent         },
      { path: 'master/countries',       component: CountriesComponent       },
      { path: 'master/currency',        component: CurrencyComponent        },
      { path: 'master/customergroups',  component: CustomerGroupsComponent  },
      { path: 'master/department',      component: DepartmentComponent      },
      { path: 'master/driver',          component: DriverComponent          },
      { path: 'master/exchangerate',    component: ExchangeRateComponent    },
      { path: 'master/flagIssue',       component: FlagIssueComponent       },
      { path: 'master/incoterms',       component: IncotermsComponent       },
      { path: 'master/itemType',        component: ItemTypeComponent        },
      { path: 'master/location',        component: LocationComponent        },
      { path: 'master/itemSet',         component: ItemSetComponent         },
      { path: 'master/paymentTerms',    component: PaymentTermsComponent    },
      { path: 'master/recurring',       component: RecurringComponent       },
      { path: 'master/service',         component: ServiceComponent         },
      { path: 'master/states',          component: StatesComponent          },
      { path: 'master/stockIssue',      component: StockIssueComponent      },
      { path: 'master/strategy',        component: StrategyComponent        },
      { path: 'master/suppliergroups',  component: SupplierGroupsComponent  },
      { path: 'master/taxcode',         component: TaxcodeComponent         },
      { path: 'master/uom',             component: UomComponent             },
      { path: 'master/uomconversion',   component: UomConversionComponent   },
      { path: 'master/vehicle',         component: VehicleComponent         },
      { path: 'master/warehouse',       component: WarehouseComponent       },
    ]
  },
  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
