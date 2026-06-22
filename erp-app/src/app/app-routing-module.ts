import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { ForgotPasswordComponent } from './pages/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './pages/auth/reset-password/reset-password.component';
import { ChangePasswordComponent } from './pages/auth/change-password/change-password.component';
import { LayoutComponent } from './layout/layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { SalesOrderComponent } from './pages/sales-order/sales-order.component';
import { NewOrderComponent } from './pages/sales-order/new-order/new-order.component';
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
import { FinanceDashboardComponent } from './pages/finance/finance-dashboard.component';
import { FinanceWorkspaceComponent } from './pages/finance/finance-workspace.component';
import { FinanceJournalFormComponent } from './pages/finance/finance-journal-form.component';
import { FinanceApComponent } from './pages/finance/finance-ap.component';
import { FinanceArComponent } from './pages/finance/finance-ar.component';
import { FinanceGstComponent } from './pages/finance/finance-gst.component';
import { FinanceCoaComponent } from './pages/finance/finance-coa.component';
import { FinanceLedgerComponent } from './pages/finance/finance-ledger.component';
import { FinanceTrialBalanceComponent } from './pages/finance/finance-trial-balance.component';
import { FinancePlComponent } from './pages/finance/finance-pl.component';
import { FinanceBsComponent } from './pages/finance/finance-bs.component';
import { MobileReceivingComponent } from './pages/purchase/mobile-receiving/mobile-receiving.component';
import { DepartmentMenuAccessComponent } from './pages/master/department-menu-access/department-menu-access.component';
// Sales
import { QuotationListComponent } from './pages/sales/quotation/quotation-list.component';
import { QuotationFormComponent } from './pages/sales/quotation/quotation-form.component';
import { ReportComponent } from './pages/sales/reports/report.component';
import { ReportDeliveryNoteComponent } from './pages/sales/reports/report-delivery-note.component';
import { SalesOrderListComponent } from './pages/sales/sales-order/sales-order-list.component';
import { SalesOrderFormComponent } from './pages/sales/sales-order/sales-order-form.component';
import { PickingListComponent } from './pages/sales/picking/picking-list.component';
import { PickingFormComponent } from './pages/sales/picking/picking-form.component';
import { DeliveryOrderListComponent } from './pages/sales/delivery-order/delivery-order-list.component';
import { DeliveryOrderFormComponent } from './pages/sales/delivery-order/delivery-order-form.component';
import { SalesInvoiceListComponent } from './pages/sales/sales-invoice/sales-invoice-list.component';
import { SalesInvoiceFormComponent } from './pages/sales/sales-invoice/sales-invoice-form.component';
import { CreditNoteListComponent } from './pages/sales/credit-note/credit-note-list.component';
import { CreditNoteFormComponent } from './pages/sales/credit-note/credit-note-form.component';

// Recipe
import { RecipeMasterListComponent } from './pages/recipe/recipe-master/recipe-master-list.component';
import { RecipeMasterFormComponent } from './pages/recipe/recipe-master/recipe-master-form.component';
import { ProductionPlanningListComponent } from './pages/recipe/production-planning/production-planning-list.component';
import { ProductionPlanningFormComponent } from './pages/recipe/production-planning/production-planning-form.component';
import { BatchProductionListComponent } from './pages/recipe/batch-production/batch-production-list.component';
import { BatchProductionFormComponent } from './pages/recipe/batch-production/batch-production-form.component';
const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login',            component: LoginComponent },
  { path: 'forgot-password',  component: ForgotPasswordComponent },
  { path: 'reset-password',   component: ResetPasswordComponent },
  { path: 'financial', redirectTo: '/app/financial/dashboard', pathMatch: 'full' },
  { path: 'financial/:page', redirectTo: '/app/financial/:page' },
  { path: 'financial/:page/:id', redirectTo: '/app/financial/:page/:id' },
  { path: 'purchase', redirectTo: '/app/purchase/requests', pathMatch: 'full' },
  { path: 'purchase/:page', redirectTo: '/app/purchase/:page' },
  { path: 'purchase/:page/:id', redirectTo: '/app/purchase/:page/:id' },
  {
    path: 'app',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '',                              redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'change-password',               component: ChangePasswordComponent },
      { path: 'dashboard',                     component: DashboardComponent  },
      { path: 'sales-order',                   component: SalesOrderComponent },
      { path: 'sales-order/new',               component: NewOrderComponent   },
      {
        path: 'inventory',
        loadChildren: () => import('./main/inventory.module').then(m => m.InventoryModule)
      },
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
      { path: 'purchase/mobile-receiving',     component: MobileReceivingComponent },
      { path: 'purchase/Create-PurchaseRequest', component: PurchaseRequestFormComponent },
      { path: 'purchase/Edit-PurchaseRequest/:id', component: PurchaseRequestFormComponent },
      { path: 'purchase/list-PurchaseRequest', component: PurchaseRequestListComponent },
      { path: 'purchase/list-Purchasegoodreceipt', component: GrnListComponent },
      { path: 'purchase/createpurchasegoodreceipt', component: GrnFormComponent },
      { path: 'purchase/edit-purchasegoodreceipt/:id', component: GrnFormComponent },
      { path: 'purchase/list-purchaseorder', component: PurchaseOrderListComponent },
      { path: 'purchase/create-purchaseorder', component: PurchaseOrderFormComponent },
      { path: 'purchase/edit-purchaseorder/:id', component: PurchaseOrderFormComponent },
      { path: 'purchase/Create-SupplierInvoice', component: SupplierInvoiceFormComponent },
      { path: 'purchase/Edit-SupplierInvoice/:id', component: SupplierInvoiceFormComponent },
      { path: 'purchase/list-SupplierInvoice', component: SupplierInvoiceListComponent },
      { path: 'purchase/mobilereceiving', component: MobileReceivingComponent },
      { path: 'purchase/supplier-scorecard', component: SupplierScorecardComponent },
      { path: 'purchase/list-debitnote', component: DebitNoteListComponent },
      { path: 'purchase/create-debitnote', component: DebitNoteFormComponent },
      { path: 'purchase/edit-debitnote/:id', component: DebitNoteFormComponent },
      { path: 'finance',                        component: FinanceDashboardComponent },
      // ── Dedicated finance components (must be before catch-all finance/:section) ──
      { path: 'finance/chart-of-accounts',    component: FinanceCoaComponent },
      { path: 'finance/general-ledger',       component: FinanceLedgerComponent },
      { path: 'finance/trial-balance',        component: FinanceTrialBalanceComponent },
      { path: 'finance/profit-loss',          component: FinancePlComponent },
      { path: 'finance/balance-sheet',        component: FinanceBsComponent },
      { path: 'finance/accounts-payable',     component: FinanceApComponent },
      { path: 'finance/ap-aging',             component: FinanceApComponent },
      { path: 'finance/ap-advance',           component: FinanceApComponent },
      { path: 'finance/ar',                   component: FinanceArComponent },
      { path: 'finance/ar-invoices',          component: FinanceArComponent },
      { path: 'finance/receipts',             component: FinanceArComponent },
      { path: 'finance/ar-advance',           component: FinanceArComponent },
      { path: 'finance/ar-aging',             component: FinanceArComponent },
      { path: 'finance/tax-gst',              component: FinanceGstComponent },
      { path: 'finance/gst-return',           component: FinanceGstComponent },
      { path: 'finance/gst-report',           component: FinanceGstComponent },
      { path: 'finance/create-journal',       component: FinanceJournalFormComponent },
      { path: 'finance/:section',             component: FinanceWorkspaceComponent },
      { path: 'financial/dashboard',           component: FinanceDashboardComponent },
      { path: 'financial/ChartOfAccount',      component: FinanceCoaComponent },
      { path: 'financial/journal',             component: FinanceWorkspaceComponent, data: { section: 'journal' } },
      { path: 'financial/create-journal',      component: FinanceJournalFormComponent },
      { path: 'financial/tax-gst',             component: FinanceGstComponent },
      { path: 'financial/Gst-report',          component: FinanceGstComponent },
      { path: 'financial/AccountPayable',      component: FinanceApComponent },
      { path: 'financial/ap-aging',            component: FinanceApComponent },
      { path: 'financial/ap-advance',          component: FinanceApComponent },
      { path: 'financial/AR',                  component: FinanceArComponent },
      { path: 'financial/AR-invoice',          component: FinanceArComponent },
      { path: 'financial/AR-invoice-create',   component: FinanceArComponent },
      { path: 'financial/AR-receipt',          component: FinanceArComponent },
      { path: 'financial/AR-receipt-create',   component: FinanceArComponent },
      { path: 'financial/AR-receipt-edit/:id', component: FinanceArComponent },
      { path: 'financial/ar-advance',          component: FinanceArComponent },
      { path: 'financial/aging',               component: FinanceArComponent },
      { path: 'financial/ledger',              component: FinanceLedgerComponent },
      { path: 'financial/Period-close',        component: FinanceWorkspaceComponent, data: { section: 'period-close' } },
      { path: 'financial/Invoice-email',       component: FinanceWorkspaceComponent, data: { section: 'invoice-email' } },
      { path: 'financial/report',              component: FinanceTrialBalanceComponent },
      { path: 'financial/profitloss',          component: FinancePlComponent },
      { path: 'financial/balance-sheet',       component: FinanceBsComponent },
      { path: 'financial/finance-report',      component: FinanceWorkspaceComponent, data: { section: 'reports' } },
      { path: 'financial/daybook',             component: FinanceWorkspaceComponent, data: { section: 'daybook' } },
      { path: 'financial/forecast',            component: FinanceWorkspaceComponent, data: { section: 'collection-forecast' } },
      { path: 'financial/opening-balance',     component: FinanceWorkspaceComponent, data: { section: 'opening-balance' } },
      { path: 'financial/year-close',          component: FinanceWorkspaceComponent, data: { section: 'year-end-close' } },
      { path: 'financial/bank-reconciliation', component: FinanceWorkspaceComponent, data: { section: 'bank-reconciliation' } },
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
      {path: 'master/department-menu-access', component: DepartmentMenuAccessComponent },
      { path: 'master/driver',          component: DriverComponent          },
      { path: 'master/exchangerate',    component: ExchangeRateComponent    },
      { path: 'master/flagIssue',       component: FlagIssueComponent       },
      { path: 'master/incoterms',       component: IncotermsComponent       },
      { path: 'master/itemType',        component: ItemTypeComponent       },
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

            // ── Sales ───────────────────────────────────────────
      { path: 'sales/quotations',              component: QuotationListComponent },
      { path: 'sales/quotations/new',          component: QuotationFormComponent },
      { path: 'sales/quotations/:id',          component: QuotationFormComponent },

      { path: 'sales/orders',                  component: SalesOrderListComponent },
      { path: 'sales/orders/new',              component: SalesOrderFormComponent },
      { path: 'sales/orders/:id',              component: SalesOrderFormComponent },

      { path: 'sales/picking',                 component: PickingListComponent },
      { path: 'sales/picking/new',             component: PickingFormComponent },
      { path: 'sales/picking/:id',             component: PickingFormComponent },

      { path: 'sales/delivery-orders',         component: DeliveryOrderListComponent },
      { path: 'sales/delivery-orders/new',     component: DeliveryOrderFormComponent },
      { path: 'sales/delivery-orders/:id',     component: DeliveryOrderFormComponent },

      { path: 'sales/invoices',                component: SalesInvoiceListComponent },
      { path: 'sales/invoices/new',            component: SalesInvoiceFormComponent },
      { path: 'sales/invoices/:id',            component: SalesInvoiceFormComponent },

      { path: 'sales/credit-notes',            component: CreditNoteListComponent },
      { path: 'sales/credit-notes/new',        component: CreditNoteFormComponent },
      { path: 'sales/credit-notes/:id',        component: CreditNoteFormComponent },

      { path: 'sales/reports',                 component: ReportComponent },
      { path: 'sales/reports/delivery-note',   component: ReportDeliveryNoteComponent },

      // ── Recipe / Production ─────────────────────────────
      { path: 'recipe/recipes',                    component: RecipeMasterListComponent },
      { path: 'recipe/recipes/new',                component: RecipeMasterFormComponent },
      { path: 'recipe/recipes/:id',                component: RecipeMasterFormComponent },

      { path: 'recipe/production-planning',        component: ProductionPlanningListComponent },
      { path: 'recipe/production-planning/new',    component: ProductionPlanningFormComponent },
      { path: 'recipe/production-planning/:id',    component: ProductionPlanningFormComponent },

      { path: 'recipe/batch-production',           component: BatchProductionListComponent },
      { path: 'recipe/batch-production/new',        component: BatchProductionFormComponent },
      { path: 'recipe/batch-production/:id',        component: BatchProductionFormComponent },

      
    ]
  },
  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
