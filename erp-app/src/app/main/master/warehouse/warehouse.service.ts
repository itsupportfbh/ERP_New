import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class WarehouseService {
  constructor(private masterService: MasterService) {}

  getWarehouse(): Observable<any[]> {
    return this.masterService.getWarehouses().pipe(map((res: any) => res?.data || res || []));
  }

  getBinNameByIdAsync(id: any): Observable<any[]> {
    return this.masterService.getBins().pipe(
      map((res: any) => res?.data || res || [])
    );
  }
}
