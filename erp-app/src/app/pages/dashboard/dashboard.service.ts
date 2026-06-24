import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/Dashboard`;

function params(obj: Record<string, string | number>): HttpParams {
  let p = new HttpParams();
  Object.entries(obj).forEach(([k, v]) => { p = p.set(k, String(v)); });
  return p;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  // ── Role KPI endpoints ──────────────────────────────────────────────────────
  getAdminSummaryDashboard(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/AdminSummaryDashboard`, { params: params({ companyId }) });
  }
  getFinanceSummaryDashboard(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/FinanceSummaryDashboard`, { params: params({ companyId }) });
  }
  getFinanceOpsDashboard(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/FinanceOpsDashboard`, { params: params({ companyId }) });
  }
  getSalesManagerDashboard(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/SalesManagerDashboard`, { params: params({ companyId }) });
  }
  getSalesExecutive(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/SalesExecutive`, { params: params({ companyId }) });
  }
  getPurchaseDashboard(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/PurchaseDashboard`, { params: params({ companyId }) });
  }
  getPurchaseUserDashboard(companyId: number, userId: number): Observable<any> {
    return this.http.get(`${BASE}/PurchaseUserDashboard`, { params: params({ companyId, userId }) });
  }
  getInventoryManagerKpi(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/InventoryManagerKpi`, { params: params({ companyId }) });
  }
  getInventoryKpiDashboard(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/InventoryKpiDashboard`, { params: params({ companyId }) });
  }
  getInventorySummary(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/InventorySummary`, { params: params({ companyId }) });
  }
  getProductionManagerKpi(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/ProductionManagerKpi`, { params: params({ companyId }) });
  }
  getRecipeProductionDashboard(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/RecipeProductionDashboard`, { params: params({ companyId }) });
  }

  // ── Section / sub-panel endpoints ──────────────────────────────────────────
  getAdminArApHealth(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/AdminArApHealth`, { params: params({ companyId }) });
  }
  getModuleHealth(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/ModuleHealth`, { params: params({ companyId }) });
  }
  getSystemWideExceptions(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/SystemWideExceptions`, { params: params({ companyId }) });
  }
  getSalesOverview(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/SalesOverview`, { params: params({ companyId }) });
  }
  getOpenSalesOrders(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/OpenSalesOrders`, { params: params({ companyId }) });
  }
  getARAgingData(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/ARAging`, { params: params({ companyId }) });
  }
  getPurchaseFlowDashboard(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/PurchaseFlowDashboard`, { params: params({ companyId }) });
  }
  getOpenPurchaseOrders(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/OpenPurchaseOrders`, { params: params({ companyId }) });
  }
  getMyPurchaseRequests(companyId: number, userId: number): Observable<any> {
    return this.http.get(`${BASE}/MyPurchaseRequests`, { params: params({ companyId, userId }) });
  }
  getStockAlerts(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/StockAlerts`, { params: params({ companyId }) });
  }
  getTopStockItems(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/TopStockItems`, { params: params({ companyId }) });
  }
  getProductionOrders(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/ProductionOrders`, { params: params({ companyId }) });
  }
  getTopRecipes(companyId: number): Observable<any> {
    return this.http.get(`${BASE}/TopRecipes`, { params: params({ companyId }) });
  }
}
