import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class WarehouseService {
  constructor(private masterService: MasterService) {}

  getWarehouse(): Observable<any[]> {
    return this.masterService.getWarehouses().pipe(map((res: any) => res?.data || res || []));
  }

  /**
   * Bins assigned to one warehouse. This used to ignore `id` and return the whole
   * bin master, so every screen offered bins that belong to other warehouses.
   */
  getBinNameByIdAsync(id: any): Observable<any[]> {
    const warehouseId = Number(id ?? 0);
    if (!warehouseId) return of([]);

    return this.masterService.getWarehouseBins(warehouseId).pipe(
      map((res: any) => res?.data || res || [])
    );
  }
}
