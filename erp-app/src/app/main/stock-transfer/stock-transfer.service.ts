import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';
import { StockTransferApiUrls } from 'Urls/StockTransferApiUrls';



@Injectable({
    providedIn: 'root'
})
export class StockTransferService {
    private url = environment.apiUrl
    private requestSource = new BehaviorSubject<any>(null);
    currentRequest = this.requestSource.asObservable();
    constructor(private http: HttpClient) { }

    getStockTransfer(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockTransferApiUrls.GetAllStockTransfer);
    }

    getStockTransferById(id: any): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockTransferApiUrls.GetStockTransferById + id);
    }

    insertStockTransfer(data: any): Observable<any> {
        return this.http.post<any>(this.url + StockTransferApiUrls.CreateStockTransfer, data);
    }

    updateStockTransfer(data: any): Observable<any> {
        return this.http.put<any>(this.url + StockTransferApiUrls.UpdateStockTransfer, data);
    }

    deleteStockTransfer(id: any) {
        return this.http.delete<any>(this.url + StockTransferApiUrls.DeleteStockTransfer + id);
    }

}