import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class BinService {
  constructor(private masterService: MasterService) {}

  getAllBin(): Observable<any[]> {
    return this.masterService.getBins().pipe(map((res: any) => res?.data || res || []));
  }
}
