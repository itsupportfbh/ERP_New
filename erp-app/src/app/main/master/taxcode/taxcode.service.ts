import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class TaxCodeService {
  constructor(private masterService: MasterService) {}

  getTaxCode(): Observable<any[]> {
    return this.masterService.getTaxCodes().pipe(map((res: any) => res?.data || res || []));
  }
}
