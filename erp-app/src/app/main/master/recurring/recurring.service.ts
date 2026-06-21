import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class RecurringService {
  constructor(private masterService: MasterService) {}

  getRecurring(): Observable<any[]> {
    return this.masterService.getRecurring().pipe(map((res: any) => res?.data || res || []));
  }
}
