import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PermissionService as MenuPermissionService } from '../../shared/permission.service';

/**
 * Blocks direct report URLs when the report's View permission is absent.
 *
 * This deliberately uses the same service - and therefore the same
 * `OrganizationRole/permission` endpoint - that LayoutComponent uses to decide
 * whether the sidebar entry is visible. They previously disagreed: the sidebar
 * asked the API per function, while this guard read the core PermissionService,
 * which is fed by `User/organization-role/{userId}`. That endpoint returns only
 * the most recently updated OrganizationRole row, so a user whose grant lives on
 * a second row - or whose cached copy predates the grant - saw the menu item but
 * got bounced to the dashboard on click. Sharing one source of truth makes that
 * mismatch impossible by construction.
 */
@Injectable({ providedIn: 'root' })
export class ReportPermissionGuard implements CanActivate {
  constructor(private permissions: MenuPermissionService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const functionId = String(route.data?.['permissionFunctionId'] || '').trim();
    if (!functionId) return of(true);

    // No signed-in user is AuthGuard's call to make, not ours.
    const userId = Number(localStorage.getItem('id') || 0);
    if (!userId) return of(true);

    const fallback = String(route.data?.['permissionFallback'] || '/app/dashboard');

    return this.permissions.getFunctionPermission(userId, functionId).pipe(
      map(permission => this.permissions.hasView(permission)
        ? true
        : this.router.parseUrl(fallback)),
      // Matches PurchaseGuard: an unreachable permission API must not strand a
      // user who is otherwise allowed in. The page's own per-report checks still
      // apply once it loads.
      catchError(() => of(true))
    );
  }
}
