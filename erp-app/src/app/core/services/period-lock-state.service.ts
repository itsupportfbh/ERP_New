import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { PeriodCloseService, PeriodStatusDto } from '../../main/financial/period-close-fx/period-close-fx.service';

export const CURRENT_PERIOD_LOCKED_KEY = 'currentPeriodLocked';
export const CURRENT_PERIOD_NAME_KEY = 'currentPeriodName';

export interface CurrentPeriodLockState {
  isLocked: boolean;
  periodName: string;
}

@Injectable({ providedIn: 'root' })
export class PeriodLockStateService {
  private readonly state$ = new BehaviorSubject<CurrentPeriodLockState>(this.readCachedState());

  constructor(private periodCloseService: PeriodCloseService) {
    this.applyBodyClass(this.state$.value.isLocked);
  }

  get currentState$(): Observable<CurrentPeriodLockState> {
    return this.state$.asObservable();
  }

  get snapshot(): CurrentPeriodLockState {
    return this.state$.value;
  }

  refresh(date: string = this.today()): Observable<CurrentPeriodLockState | null> {
    return this.periodCloseService.getStatusForDateWithName(date).pipe(
      map((status: PeriodStatusDto | null) => ({
        isLocked: !!status?.isLocked,
        periodName: status?.periodName || ''
      })),
      tap((nextState: CurrentPeriodLockState) => {
        this.persist(nextState);
      }),
      catchError(() => {
        const fallback = this.readCachedState();
        this.state$.next(fallback);
        this.applyBodyClass(fallback.isLocked);
        return of(fallback);
      })
    );
  }

  clear(): void {
    try {
      localStorage.removeItem(CURRENT_PERIOD_LOCKED_KEY);
      localStorage.removeItem(CURRENT_PERIOD_NAME_KEY);
    } catch {}
    const cleared = { isLocked: false, periodName: '' };
    this.state$.next(cleared);
    this.applyBodyClass(false);
  }

  private persist(state: CurrentPeriodLockState): void {
    try {
      localStorage.setItem(CURRENT_PERIOD_LOCKED_KEY, String(state.isLocked));
      localStorage.setItem(CURRENT_PERIOD_NAME_KEY, state.periodName || '');
    } catch {}
    this.state$.next(state);
    this.applyBodyClass(state.isLocked);
  }

  private readCachedState(): CurrentPeriodLockState {
    try {
      return {
        isLocked: localStorage.getItem(CURRENT_PERIOD_LOCKED_KEY) === 'true',
        periodName: localStorage.getItem(CURRENT_PERIOD_NAME_KEY) || ''
      };
    } catch {
      return { isLocked: false, periodName: '' };
    }
  }

  private applyBodyClass(locked: boolean): void {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('period-locked', locked);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
