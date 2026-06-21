import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CogsReport } from './stock-cogs/cogs-report.model';
import { environment } from 'environments/environment';

@Injectable({ providedIn: 'root' })
export class CogsReportService {
  private url = environment.apiUrl; // example: "http://localhost:7182/api"
  private baseUrl = '/reports/cogs'; // ✅ FIXED

  constructor(private http: HttpClient) {}

  getCogs(fromDate: string, toDate: string, warehouseId?: number, binId?: number): Observable<any> {
    let params = new HttpParams()
      .set('fromDate', fromDate)
      .set('toDate', toDate);

    if (warehouseId != null) params = params.set('warehouseId', warehouseId);
    if (binId != null) params = params.set('binId', binId);

    return this.http.get<any>(`${this.url}${this.baseUrl}`, { params });
  }
}