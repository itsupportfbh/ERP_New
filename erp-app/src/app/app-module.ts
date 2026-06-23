import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { responseInterceptor } from './core/interceptors/response.interceptor';
import { payloadInterceptor } from './core/interceptors/payload.interceptor';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { SharedModule } from './shared/shared.module';

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
import { PeriodCloseComponent } from './pages/purchase/period-close/period-close.component';


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
import { DepartmentMenuAccessComponent } from './pages/master/department-menu-access/department-menu-access.component';
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
import { MobileReceivingComponent } from './pages/purchase/mobile-receiving/mobile-receiving.component';

// ── Sales module ──────────────────────────────────────
import { QuotationListComponent } from './pages/sales/quotation/quotation-list.component';
import { QuotationFormComponent } from './pages/sales/quotation/quotation-form.component';
import { ReportComponent } from './pages/sales/reports/report.component';
import { ReportFiltersComponent } from './pages/sales/reports/report-filters.component';
import { ReportSalesByItemComponent } from './pages/sales/reports/report-sales-by-item.component';
import { ReportAverageMarginComponent } from './pages/sales/reports/report-average-margin.component';
import { ReportDeliveriesComponent } from './pages/sales/reports/report-deliveries.component';
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

// ── Recipe module ─────────────────────────────────────
import { RecipeMasterListComponent } from './pages/recipe/recipe-master/recipe-master-list.component';
import { RecipeMasterFormComponent } from './pages/recipe/recipe-master/recipe-master-form.component';
import { ProductionPlanningListComponent } from './pages/recipe/production-planning/production-planning-list.component';
import { ProductionPlanningFormComponent } from './pages/recipe/production-planning/production-planning-form.component';
import { BatchProductionListComponent } from './pages/recipe/batch-production/batch-production-list.component';
import { BatchProductionFormComponent } from './pages/recipe/batch-production/batch-production-form.component';
@NgModule({
  declarations: [
    App,
    LoginComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    ChangePasswordComponent,
    LayoutComponent,
    DashboardComponent,
    SalesOrderComponent,
    NewOrderComponent,

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
    PeriodCloseComponent,
    ApprovalLevelComponent,
    BankComponent,
    BinComponent,
    CategoryComponent,
    CitiesComponent,
    CostingMethodComponent,
    CompanyComponent,
    CountriesComponent,
    CurrencyComponent,
    CustomerGroupsComponent,
    DepartmentComponent,
    DepartmentMenuAccessComponent,
    DriverComponent,
    ExchangeRateComponent,
    FlagIssueComponent,
    IncotermsComponent,
    ItemTypeComponent,
    LocationComponent,
    ItemSetComponent,
    PaymentTermsComponent,
    RecurringComponent,
    ServiceComponent,
    StatesComponent,
    StockIssueComponent,
    StrategyComponent,
    SupplierGroupsComponent,
    TaxcodeComponent,
    UomComponent,
    UomConversionComponent,
    VehicleComponent,
    WarehouseComponent,
     FinanceDashboardComponent,
    FinanceWorkspaceComponent,
MobileReceivingComponent,
    // Sales
    QuotationListComponent,
    QuotationFormComponent,
    ReportComponent,
    ReportFiltersComponent,
    ReportSalesByItemComponent,
    ReportAverageMarginComponent,
    ReportDeliveriesComponent,
    ReportDeliveryNoteComponent,
    SalesOrderListComponent,
    SalesOrderFormComponent,
    PickingListComponent,
    PickingFormComponent,
    DeliveryOrderListComponent,
    DeliveryOrderFormComponent,
    SalesInvoiceListComponent,
    SalesInvoiceFormComponent,
    CreditNoteListComponent,
    CreditNoteFormComponent,
    // Recipe
    RecipeMasterListComponent,
    RecipeMasterFormComponent,
    ProductionPlanningListComponent,
    ProductionPlanningFormComponent,
    BatchProductionListComponent,
    BatchProductionFormComponent,

  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    SharedModule,
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([jwtInterceptor, payloadInterceptor, responseInterceptor]))
  ],
  bootstrap: [App]
})
export class AppModule {}
