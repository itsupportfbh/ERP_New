import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';
import { StockAdjustmentAPIUrls } from 'Urls/StockAdjustmentApiUrls';

@Injectable({
  providedIn: 'root'
})
export class StockAdjustmentService {

  private url = environment.apiUrl
  private requestSource = new BehaviorSubject<any>(null);
  currentRequest = this.requestSource.asObservable();
  constructor(private http: HttpClient) { }
  GetBinDetailsbywarehouseID(id: any): Observable<any[]> {
    return this.http.get<any[]>(this.url + StockAdjustmentAPIUrls.GetBinDetailsbywarehouseID + id);
  }

    GetItemDetailswithwarehouseandBinID(warehouseId: number, binId: number): Observable<any[]> {
    const url = `${this.url}${StockAdjustmentAPIUrls.GetItemDetailswithwarehouseandBinID}${warehouseId}/${binId}`;
    return this.http.get<any[]>(url);
  }

}
