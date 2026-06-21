import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class CatagoryService {
  constructor(private masterService: MasterService) {}

  getAllCatagory(): Observable<any[]> {
    return this.getCatagory();
  }

  getCatagory(): Observable<any[]> {
    return this.masterService.getCategories().pipe(map((res: any) => res?.data || res || []));
  }
}
