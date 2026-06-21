import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class CoastingMethodService {
  constructor(private masterService: MasterService) {}

  getAllCoastingMethod(): Observable<any[]> {
    return this.getAllcoastingMethod();
  }

  getAllcoastingMethod(): Observable<any[]> {
    return this.masterService.getCostingMethods().pipe(map((res: any) => res?.data || res || []));
  }
}
