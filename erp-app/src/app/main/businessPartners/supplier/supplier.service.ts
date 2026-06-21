import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BusinessPartnersService } from '../../../pages/business-partners/business-partners.service';

@Injectable({ providedIn: 'root' })
export class SupplierService {
  constructor(private businessPartnersService: BusinessPartnersService) {}

  GetAllSupplier(): Observable<any[]> {
    return this.businessPartnersService.getSuppliers().pipe(map((res: any) => res?.data || res || []));
  }
}
