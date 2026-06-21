import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

@Injectable({ providedIn: 'root' })
export class LocationService {
  constructor(private masterService: MasterService) {}

  getLocation(): Observable<any[]> {
    return this.masterService.getLocations().pipe(map((res: any) => res?.data || res || []));
  }
}
