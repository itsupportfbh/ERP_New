import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class StrategyService {
  constructor(private masterService: MasterService) {}

  getStrategy(): Observable<any[]> {
    return this.masterService.getStrategies().pipe(map((res: any) => res?.data || res || []));
  }
}
