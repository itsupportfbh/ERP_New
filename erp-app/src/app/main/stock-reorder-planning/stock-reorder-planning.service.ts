import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';
import { StockReorderApiUrls } from 'Urls/StockReorderAPIUrls';

type Line  = { itemId: number; qty: number; price: number };
type Group = { supplierId: number; warehouseId: number; lines: Line[] };

@Injectable({
    providedIn: 'root'
})
export class ReorderPlanningService {
    private url = environment.apiUrl
    private requestSource = new BehaviorSubject<any>(null);
    currentRequest = this.requestSource.asObservable();
    
    constructor(private http: HttpClient) { }

    getStockReorder(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockReorderApiUrls.GetAllStockReorder);
    }
    getWarehouseItems(warehouseTypeId): Observable<any[]> {

        let params = new HttpParams()
            .set('warehouseId', String(warehouseTypeId))


        return this.http.get<any[]>(
            `${this.url}${StockReorderApiUrls.GetAllWarehouseItems}`,
            { params }
        );
    }

    getStockReorderById(id: any): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockReorderApiUrls.GetStockReorderById + id);
    }

    insertStockReorder(data: any): Observable<any> {
        return this.http.post<any>(this.url + StockReorderApiUrls.CreateStockReorder, data);
    }

    updateStockReorder(data: any): Observable<any> {
        return this.http.put<any>(this.url + StockReorderApiUrls.UpdateStockReorder, data);
    }


    deleteStockReorder(id: number, userId: number) {
        const url = `${this.url}${StockReorderApiUrls.DeleteStockReorder}${id}`; // e.g. /api/stocktake/123
        const params = new HttpParams().set('updatedBy', userId);
        return this.http.delete<any>(url, { params });
    }
    
    createPoSuggestions(body: {
        groups: Group[];
        note?: string | null;
        userId: number;
        userName?: string | null;
        departmentId?: number | null;
    }) {
        return this.http.post<{ created: { id: number; purchaseRequestNo: string }[] }>(
            `${this.url}/purchaserequest/reorder-suggestions`,
            body
        );
    }

 getReorderPreview(stockReorderId: number): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockReorderApiUrls.getPreviewStockReorder + stockReorderId);
    }
}