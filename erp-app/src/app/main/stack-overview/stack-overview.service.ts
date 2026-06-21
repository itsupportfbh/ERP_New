import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';
import { StockAPIUrls } from 'Urls/StockApiUrls';


@Injectable({
    providedIn: 'root'
})
export class StackOverviewService {

    private url = environment.apiUrl
    private requestSource = new BehaviorSubject<any>(null);
    currentRequest = this.requestSource.asObservable();
    constructor(private http: HttpClient) { }

    getStock(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.GetAllStock);
    }

    getStockById(id: any): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.GetStockById + id);
    }

    insertStock(data: any): Observable<any> {
        return this.http.post<any>(this.url + StockAPIUrls.CreateStock, data);
    }

    updateStock(data: any): Observable<any> {
        return this.http.put<any>(this.url + StockAPIUrls.UpdateStock, data);
    }

    deleteStock(id: any) {
        return this.http.delete<any>(this.url + StockAPIUrls.DeleteStock + id);
    }

    GetAllStockList(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.GetAllStockList);
    }

    GetAllItemStockList(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.GetAllItemStockList);
    }
    markAsTransferredBulk(data: any): Observable<any> {
        return this.http.post<any>(this.url + StockAPIUrls.markAsTransferredBulk, data);
    }
    GetAllStockTransferedList(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.GetAllStockTransferedList);
    }

    AdjustOnHand(data: any): Observable<any> {
        return this.http.post<any>(this.url + StockAPIUrls.AdjustOnHand, data);
    }
    ApproveTransfersBulk(data: any): Observable<any> {
        return this.http.post<any>(this.url + StockAPIUrls.ApproveTransfersBulk, data);
    }
    GetByIdStockHistory(id: any): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.GetByIdStockHistory + id);
    }


      GetStockTransferedList(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.GetStockTransferedList);
    }
      getTransferredMrIds(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.getTransferredMrIds);
    }
   GetMaterialTransferList(): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.GetMaterialTransferList);
    }

    gettransferdetailsbyid(id: any): Observable<any[]> {
        return this.http.get<any[]>(this.url + StockAPIUrls.gettransferdetailsbyid + id);
    }
    // confirmReceive(data){

    // }

confirmReceive(payload: any) {
  return this.http.post(this.url+StockAPIUrls.confirmReceive, payload);
}

}
