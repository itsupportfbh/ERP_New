import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class ItemsService {
  constructor(private masterService: MasterService) {}

  getAllItem(): Observable<any[]> {
    return this.masterService.getItemMaster().pipe(map((res: any) => res?.data || res || []));
  }
}
