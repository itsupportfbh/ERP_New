import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';


// ── DTOs (mirror C# backend) ─────────────────────────────────

export interface ArApGauge {
  aR_TotalInvoiced:  number;
  aR_TotalCollected: number;
  aR_CollectedPct:   number;
  aP_TotalInvoiced:  number;
  aP_TotalPaid:      number;
  aP_PaidPct:        number;
}

export interface ArAging {
  aR_0_30:   number;
  aR_31_60:  number;
  aR_61_90:  number;
  aR_90Plus: number;
}

export interface ApAging {
  aP_0_30:   number;
  aP_31_60:  number;
  aP_61_90:  number;
  aP_90Plus: number;
}

export interface InventorySummary {
  newItemsInRange: number;
  availableSKU:    number;
  belowMinCount:   number;
}

export interface InventoryTopItem {
  sku:          string;
  itemName:     string;
  availableQty: number;
}

export interface PlanningOrder {
  planningOrderCount: number;
  nextPlanningDate:   string | null;
}

export interface RecipeCostAlert {
  recipeCostAlertCount: number;
}

export interface ActivityTimeline {
  activityType: string;
  docNo:        string;
  partyName:    string;
  activityDate: string;
  statusLabel:  string;
}

export interface ExceptionItem {
  exceptionType: string;
  docNo:         string;
  party:         string;
  impact:        string;
}

export interface SalesKpi {
  salesQuotationsCount: number;
  salesInvoicesCount:   number;
  grnCount:             number;   // API returns lowercase
  aR_OutstandingCount:  number;
  purchaseOrderCount:   number;
  supplierInvoiceCount: number;
}

export interface SalesTrend {
  invoiceDay:      string;
  invoiceCount:    number;
  dailySalesTotal: number;
}

export interface SalesOverview {
  salesOrdersOpen:       number;
  deliveryOrdersCreated: number;
  salesInvoicesPosted:   number;
  activeCustomers:       number;
  totalSalesAmount:      number;
  totalOrdersAmount:     number;
}

export interface DashboardData {
  arApGauge:        ArApGauge        | null;
  arAging:          ArAging          | null;
  apAging:          ApAging          | null;
  inventorySummary: InventorySummary | null;
  topItems:         InventoryTopItem[];
  planningOrders:   PlanningOrder    | null;
  costAlerts:       RecipeCostAlert  | null;
  timeline:         ActivityTimeline[];
  exceptions:       ExceptionItem[];
  salesKpi:         SalesKpi         | null;
  salesTrend:       SalesTrend[];
  salesOverview:    SalesOverview    | null;
}

export interface SalesExecutiveData {
 quotation: number;
  salesOrders: number;
  deliveries: number;
  invoices: number;
}

export interface SalesOverviewData {
 quotation: number;
  salesOrders: number;
  deliveries: number;
  invoices: number;
}

export interface OpenSalesOrder {
  salesOrderNo: string;
  customerName: string;
  requestedDate: string;
  grandTotal: number;
  statusText: string;
  deliveryDate: string;
}

export interface OpenSalesOrderItem {
  itemId: number;
  itemName: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  total: number;
  tax: string;
}

export interface SalesManager {
  id: number;
  salesOrderNo: string;
  customerName: string;
  requestedDate: string;
  deliveryDate: string;
  grandTotal: number;
  items: OpenSalesOrderItem[];
}

export interface SalesManagerDashboard {
  totalRevenue: number;
  activeCustomers: number;
  avgDealSize: number;
  arOverdue: number;
}

export interface ARAgingDto {
  currentAmount: number;
  days30: number;
  days60: number;
  days90: number;
}

export interface InventorySummaryDto {
  totalSkus: number;
  grnPending: number;
  negativeStock: number;
}

export interface TopStockItem {
  sku: string;
  itemName: string;
  warehouse: string;
  qty: number;
  uom: string;
}

export interface WarehouseSummary {
  warehouseName: string;
  totalSkus: number;
  percentage: number;
}

export interface WarehouseDashboard {
  warehouses: WarehouseSummary[];
  newItems: number;
  pendingDOs: number;
}

export interface PurchaseDashboard {
  openPrs: number;
  openPrsChange: number;
  openPos: number;
  openPosChange: number;
  pendingGrn: number;
  pendingGrnChange: number;
  apOutstanding: number;
  apOutstandingChangePercent: number;
}

export interface PurchaseFlowDashboard {
  purchaseRequests: number;
  purchaseOrders: number;
  grnReceived: number;
  supplierInvoices: number;

  purchaseRequestsPercent: number;
  purchaseOrdersPercent: number;
  grnReceivedPercent: number;
  supplierInvoicesPercent: number;
}

export interface PurchaseFlowItem {
  name: string;
  count: number;
  percentage: number;
}

export interface APAgingDashboard {
  days0To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
}

export interface OpenPurchaseOrder {
  poNo: string;
  supplierName: string;
  poDate: string;
  amount: number;
  dueDate: string;
}

export interface PurchaseUserDashboard {
  myOpenPrs: number;
  myOpenPrsChange: number;

  pendingGrn: number;
  pendingGrnChange: number;

  openPins: number;
  openPinsChange: number;
}

export interface MyPurchaseRequest {
  prNo: string;
  itemName: string;
  qty: number;
  uom: string;
  statusText: string;
}

export interface MyPipelineDashboard {
  prCreated: number;
  poRaised: number;
  grnReceived: number;
  pinBooked: number;

  prCreatedPercent: number;
  poRaisedPercent: number;
  grnReceivedPercent: number;
  pinBookedPercent: number;
}

export interface MyPipelineItem {
  name: string;
  count: number;
  percentage: number;
}

export interface FinanceOpsDashboard {
  openArInvoices: number;
  openArInvoicesChange: number;

  totalReceivables: number;
  totalReceivablesChange: number;

  apDueToday: number;
  apDueTodayChange: number;

  threeWayMismatch: number;
  threeWayMismatchChangePercent: number;
}

export interface FinanceARAging {
  days0To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
}

export interface FinanceAPAging {
  days0To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
}

export interface FinanceSummaryDashboard {
  totalRevenue: number;
  totalRevenueChangePercent: number;

  collections: number;
  collectionsChangePercent: number;

  totalPayables: number;
  totalPayablesChangePercent: number;

  exceptions: number;
  exceptionsChange: number;
}

export interface FinanceArApHealth {
  receivablesCollectedPercent: number;
  payablesPaidPercent: number;
}

export interface FinanceArApAging {
  arDays0To30: number;
  arDays31To90: number;
  arDays90Plus: number;

  apDays0To30: number;
  apDays31To90: number;
  apDays90Plus: number;
}

export interface FinanceException {
  severity: string;
  type: string;
  document: string;
  party: string;
  impactAmount: number;
}

export interface InventoryKpiDashboard {
  availableSkus: number;
  availableSkusChange: number;

  belowMin: number;
  belowMinChange: number;

  newItems: number;
  newItemsChange: number;
}

export interface StockMovementRequest {
  requestNo: string;
  item: string;
  qty: string;
  status: string;
}

export interface InventoryQuickStats {
  receiptsToday: number;
  issuesToday: number;
  transfers: number;
  adjustments: number;
}

export interface InventoryManagerKpi {
  totalSkus: number;
  totalSkusChange: number;
  belowMin: number;
  belowMinChange: number;
  negativeStock: number;
  negativeStockChange: number;
  slowMoving: number;
  slowMovingChange: number;
}

export interface InventoryCategory {
  category: string;
  stockValue: number;
  percentage: number;
}

export interface StockAlert {
  sku: string;
  issue: string;
  qty: number;
}

export interface RecipeProductionDashboard {
  openOrders: number;
  openOrdersChange: number;
  completedToday: number;
  completedTodayChange: number;
  activeRecipes: number;
  activeRecipesChange: number;
}

export interface PlanningOrder {
  orderNo: string;
  product: string;
  qty: number;
  status: string;
  date: string;
}

export interface AdminSummaryDashboard {
  totalRevenue: number;
  totalPayables: number;
  arInvoices: number;
  apInvoices: number;
  totalSkus: number;
  allExceptions: number;
}

export interface ModuleHealth {
  moduleName: string;
  healthPercent: number;
  alerts: number;
  statusText: string;
}

export interface AdminArApHealth {
  receivablePercent: number;
  payablePercent: number;
  activeUsers: number;
  pendingApprovals: number;
}

export interface SystemWideException {
  severity: string;
  type: string;
  module: string;
  document: string;
  party: string;
  impact: string;
}

export interface ProductionManagerKpi {
  totalRecipes: number;
  productionOrders: number;
  avgRecipeCost: number;
  rawMaterials: number;
  pendingOrders: number;
}

export interface ProductionOutput {
  dayName: string;
  outputQty: number;
}

export interface TopRecipe {
  itemId: number;
  recipeName: string;
  recipeCost: number;
  usageCount: number;
}

export interface ProductionOrderList {
  orderNo: string;
  recipe: string;
  status: string;
  qty: number;
}
// ── Service ──────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private base = `${environment.apiUrl}/Dashboard`;

  constructor(private http: HttpClient) {}

  // Department (used to resolve the logged-in user's module)
  getDepartments(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/Department/getAll`);
  }

getDashboardData(companyId: number, from: string, to: string) {
  const cid = companyId ?? 0;

  return this.http.get<DashboardData>(this.base + '/dashboard', {
    params: {
      companyId: cid.toString(),
      startDate: from,
      endDate: to
    }
  });
}

getSalesExecutive(companyId: number) {
  return this.http.get<any>(
    `${this.base}/SalesExecutive`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getSalesOverview(companyId: number) {
  return this.http.get<SalesOverviewData>(
    `${this.base}/SalesOverview`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getOpenSalesOrders(companyId: number) {
  return this.http.get<OpenSalesOrder[]>(
    `${this.base}/OpenSalesOrders`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getSalesManagerDashboard(companyId: number) {
  return this.http.get<any>(
    `${this.base}/SalesManagerDashboard`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getARAgingData(companyId: number): Observable<ARAgingDto> {

  return this.http.get<ARAgingDto>(
    `${this.base}/ARAging`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getInventorySummary(companyId: number) {
  return this.http.get<InventorySummaryDto>(
    `${this.base}/InventorySummary`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getTopStockItems(companyId: number) {
  return this.http.get<TopStockItem[]>(
    `${this.base}/TopStockItems`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getWarehouseSummary(companyId: number) {
  return this.http.get<WarehouseDashboard>(
    `${this.base}/WarehouseSummary`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}


getPurchaseDashboard(companyId: number): Observable<PurchaseDashboard> {
  return this.http.get<PurchaseDashboard>(
    `${this.base}/PurchaseDashboard`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getPurchaseFlowDashboard(companyId: number): Observable<PurchaseFlowDashboard> {
  return this.http.get<PurchaseFlowDashboard>(
    `${this.base}/PurchaseFlowDashboard`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getAPAgingDashboard(companyId: number): Observable<APAgingDashboard> {
  return this.http.get<APAgingDashboard>(
    `${this.base}/APAgingDashboard`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getOpenPurchaseOrders(companyId: number) {
  return this.http.get<OpenPurchaseOrder[]>(
    `${this.base}/OpenPurchaseOrders`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getPurchaseUserDashboard(
  companyId: number,
  userId: number
): Observable<PurchaseUserDashboard> {
  return this.http.get<PurchaseUserDashboard>(
    `${this.base}/PurchaseUserDashboard`,
    {
      params: {
        companyId: companyId.toString(),
        userId: userId.toString()
      }
    }
  );
}

getMyPurchaseRequests(
  companyId: number,
  userId: number
): Observable<MyPurchaseRequest[]> {
  return this.http.get<MyPurchaseRequest[]>(
    `${this.base}/MyPurchaseRequests`,
    {
      params: {
        companyId: companyId.toString(),
        userId: userId.toString()
      }
    }
  );
}

getMyPipelineDashboard(
  companyId: number,
  userId: number
): Observable<MyPipelineDashboard> {
  return this.http.get<MyPipelineDashboard>(
    `${this.base}/MyPipelineDashboard`,
    {
      params: {
        companyId: companyId.toString(),
        userId: userId.toString()
      }
    }
  );
}

getFinanceOpsDashboard(companyId: number): Observable<FinanceOpsDashboard> {
  return this.http.get<FinanceOpsDashboard>(
    `${this.base}/FinanceOpsDashboard`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getFinanceARAging(companyId: number): Observable<FinanceARAging> {
  return this.http.get<FinanceARAging>(
    `${this.base}/FinanceARAging`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getFinanceAPAging(companyId: number): Observable<FinanceAPAging> {
  return this.http.get<FinanceAPAging>(
    `${this.base}/FinanceAPAging`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getFinanceSummaryDashboard(companyId: number): Observable<FinanceSummaryDashboard> {
    return this.http.get<FinanceSummaryDashboard>(
      `${this.base}/FinanceSummaryDashboard`,
      {
        params: {
          companyId: companyId.toString()
        }
      }
    );
  } 

getFinanceArApHealth(companyId: number): Observable<FinanceArApHealth> {
  return this.http.get<FinanceArApHealth>(
    `${this.base}/FinanceArApHealth`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getFinanceArApAging(companyId: number): Observable<FinanceArApAging> {
  return this.http.get<FinanceArApAging>(
    `${this.base}/FinanceArApAging`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getFinanceExceptions(companyId: number): Observable<FinanceException[]> {
  return this.http.get<FinanceException[]>(
    `${this.base}/FinanceExceptions`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getInventoryKpiDashboard(companyId: number): Observable<InventoryKpiDashboard> {
  return this.http.get<InventoryKpiDashboard>(
    `${this.base}/InventoryKpiDashboard`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getStockMovementRequests(companyId: number): Observable<StockMovementRequest[]> {
  return this.http.get<StockMovementRequest[]>(
    `${this.base}/StockMovementRequests`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getInventoryQuickStats(companyId: number): Observable<InventoryQuickStats> {
  return this.http.get<InventoryQuickStats>(
    `${this.base}/InventoryQuickStats`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getInventoryManagerKpi(companyId: number): Observable<InventoryManagerKpi> {
  return this.http.get<InventoryManagerKpi>(
    `${this.base}/InventoryManagerKpi`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getInventoryByCategory(companyId: number): Observable<InventoryCategory[]> {
  return this.http.get<InventoryCategory[]>(
    `${this.base}/InventoryByCategory`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getStockAlerts(companyId: number): Observable<StockAlert[]> {
  return this.http.get<StockAlert[]>(
    `${this.base}/StockAlerts`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getRecipeProductionDashboard(companyId: number): Observable<RecipeProductionDashboard> {
  return this.http.get<RecipeProductionDashboard>(
    `${this.base}/RecipeProductionDashboard`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getPlanningOrders(companyId: number): Observable<PlanningOrder[]> {
  return this.http.get<PlanningOrder[]>(
    `${this.base}/PlanningOrders`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getAdminSummaryDashboard(companyId: number): Observable<AdminSummaryDashboard> {
  return this.http.get<AdminSummaryDashboard>(
    `${this.base}/AdminSummaryDashboard`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getModuleHealth(companyId: number): Observable<ModuleHealth[]> {
  return this.http.get<ModuleHealth[]>(
    `${this.base}/ModuleHealth`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getAdminArApHealth(companyId: number): Observable<AdminArApHealth> {
  return this.http.get<AdminArApHealth>(
    `${this.base}/AdminArApHealth`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getSystemWideExceptions(companyId: number): Observable<SystemWideException[]> {
  return this.http.get<SystemWideException[]>(
    `${this.base}/SystemWideExceptions`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getProductionManagerKpi(companyId: number): Observable<ProductionManagerKpi> {
  return this.http.get<ProductionManagerKpi>(
    `${this.base}/ProductionManagerKpi`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getProductionOutput(companyId: number): Observable<ProductionOutput[]> {
  return this.http.get<ProductionOutput[]>(
    `${this.base}/ProductionOutput`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}

getTopRecipes(companyId: number) {

  return this.http.get<TopRecipe[]>(
    `${environment.apiUrl}/Dashboard/TopRecipes?companyId=${companyId}`
  );

}

getProductionOrders(companyId: number): Observable<ProductionOrderList[]> {
  return this.http.get<ProductionOrderList[]>(
    `${this.base}/ProductionOrders`,
    {
      params: {
        companyId: companyId.toString()
      }
    }
  );
}
}
