import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RecipeService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Helpers ──────────────────────────────────────────
  unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }
  unwrapOne(res: any): any {
    if (Array.isArray(res)) return res[0] ?? {};
    if (res?.data && !Array.isArray(res.data)) return res.data;
    if (Array.isArray(res?.data)) return res.data[0] ?? {};
    return res ?? {};
  }

  // ── Recipe Master ────────────────────────────────────
  getRecipes(): Observable<any> {
    return this.http.get(`${this.api}/Recipe/list`);
  }
  getRecipeById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/Recipe/${id}`);
  }
  createRecipe(data: any): Observable<any> {
    return this.http.post(`${this.api}/Recipe/create`, data);
  }
  updateRecipe(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.api}/Recipe/${id}`, data);
  }
  deleteRecipe(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/Recipe/${id}`);
  }

  // ── Production Planning ──────────────────────────────
  getProductionSalesOrders(includeSoId?: number | string): Observable<any> {
    let params = new HttpParams();
    if (includeSoId && Number(includeSoId) > 0) params = params.set('includeSoId', String(includeSoId));
    return this.http.get(`${this.api}/ProductionPlan/salesorders`, { params });
  }
  getPlanBySo(soId: number | string, warehouseId: number | string): Observable<any> {
    return this.http.get(`${this.api}/ProductionPlan/so/${soId}?warehouseId=${warehouseId}`);
  }
  savePlan(data: any): Observable<any> {
    return this.http.post(`${this.api}/ProductionPlan/save`, data);
  }
  createPrFromRecipeShortage(data: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseRequest/create-from-recipe-shortage`, data);
  }
  getProductionPlans(): Observable<any> {
    return this.http.get(`${this.api}/ProductionPlan/list-with-lines`);
  }
  getPlanById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/ProductionPlan/${id}`);
  }
  updatePlan(data: any): Observable<any> {
    return this.http.put(`${this.api}/ProductionPlan/update`, data);
  }
  deletePlan(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/ProductionPlan/${id}`);
  }
  updatePlanStatus(id: number | string, data: { status: number; updatedBy: any }): Observable<any> {
    return this.http.put(`${this.api}/ProductionPlan/${id}/status`, data);
  }
  /** Shortage GRNs that have been received against a RECIPE_SHORTAGE PR — drives the PP alert bell. */
  getShortageGrnAlerts(): Observable<any> {
    return this.http.get(`${this.api}/ProductionPlan/shortage-grn-alerts`);
  }

  // ── Batch Production ─────────────────────────────────
  getBatches(top = 200): Observable<any> {
    return this.http.get(`${this.api}/BatchProduction/list?top=${top}`);
  }
  getBatchById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/BatchProduction/${id}`);
  }
  createBatch(data: any): Observable<any> {
    return this.http.post(`${this.api}/BatchProduction/create`, data);
  }
  updateBatch(data: any): Observable<any> {
    return this.http.put(`${this.api}/BatchProduction/update`, data);
  }
  deleteBatch(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/BatchProduction/${id}`);
  }
  /** Combined create + post-to-inventory (backend PostAndSaveAsync). */
  postBatch(data: any): Observable<any> {
    return this.http.post(`${this.api}/BatchProduction/post`, data);
  }
  getIngredientExplosion(recipeId: number | string, warehouseId: number | string, outputQty: number | string): Observable<any> {
    const params = new HttpParams()
      .set('recipeId', String(recipeId))
      .set('warehouseId', String(warehouseId))
      .set('outputQty', String(outputQty));
    return this.http.get(`${this.api}/BatchProduction/ingredient-explosion`, { params });
  }
  updateFoodPrepStatus(batchId: number | string, data: { status: number; remarks?: string; user: string }): Observable<any> {
    return this.http.post(`${this.api}/BatchProduction/${batchId}/food-prep-status`, data);
  }

  // ── Shared Lookups ───────────────────────────────────
  getItems(): Observable<any> {
    return this.http.get(`${this.api}/Item/GetItems`);
  }
  getUOMs(): Observable<any> {
    return this.http.get(`${this.api}/Uom/GetUoms`);
  }
  getWarehouses(): Observable<any> {
    return this.http.get(`${this.api}/Warehouse/getAll`);
  }
}
