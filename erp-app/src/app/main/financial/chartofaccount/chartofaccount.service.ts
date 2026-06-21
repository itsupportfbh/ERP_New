import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class ChartofaccountService {
  constructor(private masterService: MasterService) {}

  getAllChartOfAccount(): Observable<any[]> {
    return this.getChartOfAccounts();
  }

  getChartOfAccounts(): Observable<any[]> {
    return this.masterService.getChartOfAccounts().pipe(map((res: any) => res?.data || res || []));
  }
}
