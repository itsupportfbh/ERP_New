import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { DepartmentMenuAccessService } from '../../pages/master/department-menu-access/department-menu-access.service';

@Injectable({ providedIn: 'root' })
export class PurchaseGuard implements CanActivate {
  constructor(
    private deptMenuSvc: DepartmentMenuAccessService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    if (localStorage.getItem('isMasterOwner') === 'true') {
      return of(true);
    }

    const deptId = Number(localStorage.getItem('departmentId') || 0);
    const companyId = Number(localStorage.getItem('companyId') || 0);
    if (!deptId) {
      return of(this.router.createUrlTree(['/app/dashboard']));
    }

    return this.deptMenuSvc.getByDepartmentId(deptId, companyId).pipe(
      map((res: any) => {
        const menuIds: string[] = res?.menuIds ?? res?.data?.menuIds ?? [];
        return menuIds.includes('purchase') ? true : this.router.createUrlTree(['/app/dashboard']);
      }),
      catchError(() => of(true))
    );
  }
}
