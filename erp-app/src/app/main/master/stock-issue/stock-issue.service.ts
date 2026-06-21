import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class StockIssueService {
  constructor(private masterService: MasterService) {}

  getAllStockissue(): Observable<any[]> {
    return this.masterService.getStockIssues().pipe(map((res: any) => res?.data || res || []));
  }
}
