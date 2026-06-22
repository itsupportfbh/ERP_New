import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** unwrap { isSuccess, data } | { data } | array */
  unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }

  getSalesByItem(): Observable<any> {
    return this.http.get(`${this.api}/SalesReport/GetSalesByItemAsync`);
  }

  getSalesMargin(): Observable<any> {
    return this.http.get(`${this.api}/SalesReport/GetSalesMarginAsync`);
  }

  getDeliveryNoteReport(): Observable<any> {
    return this.http.get(`${this.api}/SalesReport/GetDeliveryNote`);
  }
}
