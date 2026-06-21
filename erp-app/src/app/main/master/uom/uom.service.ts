import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class UomService {
  constructor(private masterService: MasterService) {}

  getAllUom(): Observable<any[]> {
    return this.masterService.getUoms().pipe(map((res: any) => res?.data || res || []));
  }
}
