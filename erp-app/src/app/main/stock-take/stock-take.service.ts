import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';
import { StockTakeApiUrls } from 'Urls/StockTakeApiUrls';

@Injectable({
    providedIn: 'root'
})
export class StockTakeService {
    private url = environment.apiUrl
    private requestSource = new BehaviorSubject<any>(null);
    currentRequest = this.requestSource.asObservable();
    constructor(private http: HttpClient) { }

    getStockTake(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockTakeApiUrls.GetAllStockTake);
    }
    getWarehouseItems(req): Observable<any[]> {

        let params = new HttpParams()
            .set('warehouseId', String(req.warehouseTypeId))
            .set('supplierId', String(req.supplierId))
            
            //.set('takeTypeId', String(req.takeTypeId));

        // only add strategyId if defined (optional)
        if (req.strategyId != null) {
            params = params.set('strategyId', String(req.strategyId));
        }

        return this.http.get<any[]>(
            `${this.url}${StockTakeApiUrls.GetAllWarehouseItems}`,
            { params }
        );
    }

    getStockTakeById(id: any): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockTakeApiUrls.GetStockTakeById + id);
    }

    insertStockTake(data: any): Observable<any> {
        return this.http.post<any>(this.url + StockTakeApiUrls.CreateStockTake, data);
    }

    updateStockTake(data: any): Observable<any> {
        return this.http.put<any>(this.url + StockTakeApiUrls.UpdateStockTake, data);
    }


    deleteStockTake(id: number, userId: number) {
        const url = `${this.url}${StockTakeApiUrls.DeleteStockTake}${id}`; // e.g. /api/stocktake/123
        const params = new HttpParams().set('updatedBy', userId);
        return this.http.delete<any>(url, { params });
    }
    // stock-take.service.ts
    postInventory(stockTakeId: number, body: {
        reason?: number | null;
        remarks?: string | null;
        applyToStock?: boolean;
        markPosted?: boolean;
        txnDate?: string | null;
        onlySelected?: boolean;
    }) {
        return this.http.post<any>(this.url + `/stocktake/${stockTakeId}/post`, body);
    }

    GetSupplierByWarehouseId(id): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockTakeApiUrls.GetSuppliersStockTake + id);
    }

}