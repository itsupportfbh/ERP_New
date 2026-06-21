import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface PeriodStatusDto {
  isLocked: boolean;
  periodName?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable({ providedIn: 'root' })
export class PeriodCloseService {
  private readonly baseUrl = `${environment.apiUrl}/PeriodClose`;

  constructor(private http: HttpClient) {}

  getStatusForDateWithName(date: string): Observable<PeriodStatusDto | null> {
    const params = new HttpParams().set('date', date);
    return this.http.get<any>(`${this.baseUrl}/status`, { params }).pipe(
      map((res: any) => {
        const data = res?.data ?? res;
        if (typeof data?.isLocked !== 'boolean') {
          return null;
        }
        return {
          isLocked: data.isLocked,
          periodName: data.periodName,
          startDate: data.startDate,
          endDate: data.endDate
        };
      }),
      catchError(() => of(null))
    );
  }
}
