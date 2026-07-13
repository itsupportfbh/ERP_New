import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface PeriodOption {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
}

export interface PeriodStatus {
  periodId: number;
  periodLabel: string;
  periodEndDate: string;
  isLocked: boolean;
}

export interface FxRevalRequest {
  periodId: number;
  fxDate: string;
}

export interface PeriodStatusDto {
  isLocked: boolean;
  periodName?: string;
  periodCode?: string;
  startDate?: string;
  endDate?: string;
}

/** Raw /status payload: isSuccess=false means no period is defined for the date. */
export interface PeriodDateStatus {
  isSuccess: boolean;
  isLocked: boolean;
  message?: string;
  periodName?: string;
}

@Injectable({ providedIn: 'root' })
export class PeriodCloseService {
  private readonly baseUrl = `${environment.apiUrl}/PeriodClose`;

  constructor(private http: HttpClient) {}

  getPeriods(): Observable<PeriodOption[]> {
    return this.http.get<PeriodOption[]>(`${this.baseUrl}/periods`);
  }

  getStatus(periodId: number): Observable<PeriodStatus> {
    return this.http.get<PeriodStatus>(`${this.baseUrl}/status/${periodId}`);
  }

  setLock(periodId: number, lock: boolean): Observable<PeriodStatus> {
    return this.http.post<PeriodStatus>(`${this.baseUrl}/lock`, { periodId, lock });
  }

  runFxReval(req: FxRevalRequest): Observable<any> {
    return this.http.post(`${this.baseUrl}/run-fx-reval`, req);
  }

  /**
   * Raw period status for a date. GET /status returns HTTP 200 even when no period exists
   * (`isSuccess: false, isLocked: false`), so callers that must distinguish "no period"
   * from "open period" need `isSuccess`/`message` — which getStatusForDateWithName() drops.
   */
  getDateStatus(date: string): Observable<PeriodDateStatus> {
    const params = new HttpParams().set('date', date);
    return this.http.get<any>(`${this.baseUrl}/status`, { params }).pipe(
      map((res: any) => {
        const d = res?.data ?? res ?? {};
        return {
          isSuccess: d.isSuccess === true,
          isLocked: d.isLocked === true,
          message: d.message,
          periodName: d.periodName
        } as PeriodDateStatus;
      })
    );
  }

  getStatusForDateWithName(date: string): Observable<PeriodStatusDto | null> {
    const params = new HttpParams().set('date', date);
    return this.http.get<any>(`${this.baseUrl}/status`, { params }).pipe(
      map((res: any) => {
        const data = res?.data ?? res;
        if (typeof data?.isLocked !== 'boolean') return null;
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

  isLockedForDate(date: string): Observable<boolean> {
    return this.getStatusForDateWithName(date).pipe(
      map(dto => dto?.isLocked ?? false),
      catchError(() => of(false))
    );
  }
}
