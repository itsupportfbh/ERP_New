import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { PermissionService } from './permission.service';
import { PeriodLockStateService } from './period-lock-state.service';
import { CurrencyDisplayService } from './currency-display.service';

/**
 * Store numeric ids as a safe integer string. `String(null)` yields "null", which every
 * later `Number(localStorage.getItem(...))` read turns into NaN — and NaN serialises to
 * JSON `null`, which the API rejects ("could not be converted to System.Int32").
 * A super admin has no company/location, so those arrive as null → store "0".
 */
function numStr(value: any): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.trunc(n)) : '0';
}

export interface LoginPayload {
  email: string;
  password: string;
  selectedCompanyId?: number;
  selectedOrgGuid?: string;
}

export interface UserData {
  userId: number;
  email: string;
  username: string;
  token: string;
  approvalLevelNames: string[];
  approvalLevelIds: number[];
  teams: string[];
  allowedMenuIds: number[];
  companyId: number;
  companyName: string;
  locationId: number;
  departmentId: number;
  orgGuid: string;
  databaseName: string;
  isMasterOwner: boolean;
  isTenantUser: boolean;
  organizations: any[];
  organizationId: string;
  companies: any[];
  requiresCompanySelection: boolean;
  companyCurrencyId: number;
  companyCurrencyName: string;
}

export interface LoginResponse {
  success: boolean;
  data: UserData;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'token';
  private readonly REMEMBER_KEY = 'erp_remember_user';

  constructor(
    private http: HttpClient,
    private router: Router,
    private perm: PermissionService,
    private periodLockState: PeriodLockStateService,
    private currencyDisplay: CurrencyDisplayService
  ) {}

  login(payload: LoginPayload): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/user/login`, payload).pipe(
      tap(res => {
        if (res.success && res.data && !res.data.requiresCompanySelection && res.data.token) {
          this.storeUserData(res.data);
          this.perm.load();
          this.periodLockState.refresh().subscribe({ error: () => {} });
        }
      }),
      catchError(err => {
        const message = err.error?.message || err.message || 'Login failed. Please try again.';
        return throwError(() => new Error(message));
      })
    );
  }

  private storeUserData(data: UserData): void {
    localStorage.setItem(this.TOKEN_KEY, data.token);
    localStorage.setItem('username', data.username);
    localStorage.setItem('email', data.email);
    localStorage.setItem('id', numStr(data.userId));
    localStorage.setItem('approvalRoles', JSON.stringify(data.approvalLevelNames));
    localStorage.setItem('approvalLevelIds', JSON.stringify(data.approvalLevelIds));
    localStorage.setItem('teams', JSON.stringify(data.teams));
    localStorage.setItem('allowedMenuIds', JSON.stringify(data.allowedMenuIds));
    localStorage.setItem('companyId', numStr(data.companyId));
    // Keep the company from the authenticated token even when the UI switches to
    // companyId 0 (the cross-company context).  This is what lets an HQ admin be
    // distinguished from an ordinary user who happens to be in an aggregate view.
    localStorage.setItem('loginCompanyId', numStr(data.companyId));
    localStorage.setItem('companyName', data.companyName);
    localStorage.setItem('locationId', numStr(data.locationId));
    localStorage.setItem('departmentId', numStr(data.departmentId));
    localStorage.setItem('orgGuid', data.orgGuid ?? '');
    localStorage.setItem('databaseName', data.databaseName);
    localStorage.setItem('selectedOrgKey', data.orgGuid ?? '');
    localStorage.setItem('selectedCompanyKey', `${data.orgGuid ?? ''}|${numStr(data.companyId)}`);
    localStorage.setItem('isMasterOwner', String(data.isMasterOwner));
    localStorage.setItem('isTenantUser', String(data.isTenantUser));
    localStorage.setItem('organizations', JSON.stringify(data.organizations ?? []));
    localStorage.setItem('companies', JSON.stringify(data.companies ?? []));
    localStorage.setItem('organizationId', data.organizationId ?? '');
    localStorage.setItem('companyCurrencyId', numStr(data.companyCurrencyId));
    localStorage.setItem('companyCurrencyName', data.companyCurrencyName ?? '');
    // Refresh currency symbols + tax name for the freshly selected company.
    this.currencyDisplay.reload();

    // Pull this user's permissions now that their id is known. PermissionService
    // and the layout both listen for this; logout() clears the cached copy, so
    // without it the first session after a login runs with no permission data
    // and every guarded route falls back to the master-owner check.
    window.dispatchEvent(new Event('menu-permission-updated'));
  }

  logout(): void {
    const keys = [
      'token', 'username', 'email', 'id',
      'approvalRoles', 'approvalLevelIds', 'teams', 'allowedMenuIds',
      'companyId', 'companyName', 'locationId', 'departmentId',
      'loginCompanyId',
      'orgGuid', 'databaseName', 'isMasterOwner', 'isTenantUser',
      'organizations', 'companies', 'organizationId', 'selectedOrgKey', 'selectedCompanyKey',
      'companyCurrencyId', 'companyCurrencyName',
      'appCurrencySymbol', 'appTaxName',
      'currencySymByIdMap', 'currencySymByNameMap',
      'userPermissions'
    ];
    keys.forEach(k => localStorage.removeItem(k));
    this.perm.clear();
    this.periodLockState.clear();
    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Single source of truth for "is this user a Super Admin" — normalizes role
   * names (spacing/casing/underscores all vary by backend data entry) so
   * every screen agrees on who gets full access, instead of each component
   * doing its own ad-hoc string match.
   *
   * Plain "Admin" is NOT a Super Admin. Admin is a tenant role: it works inside
   * one organisation, its menu comes from its own OrganizationRole grants, and
   * it may not hand out access to another Admin. Super Admin is a master-level
   * role (ERP_Master MasterRoles) that sits above every Admin.
   *
   * 'admin' used to be in the set below, which contradicted this very comment
   * and quietly gave every Admin full-access treatment - bypassing the sidebar
   * permission filter and the All-companies read-only rule. The server enforces
   * the same split in AccessControlService; this only keeps the UI honest.
   */
  isSuperAdmin(): boolean {
    let roles: string[] = [];
    try { roles = JSON.parse(localStorage.getItem('approvalRoles') || '[]'); } catch {}
    const SUPER_ADMIN_ROLES = new Set(['superadmin', 'master', 'systemadministrator', 'orgadmin', 'owner', 'orgowner']);
    const hasAdminRole = Array.isArray(roles) && roles.some(r =>
      SUPER_ADMIN_ROLES.has(String(r || '').toLowerCase().replace(/[\s_-]/g, ''))
    );
    if (!hasAdminRole) return false;

    const isAllCompanies = localStorage.getItem('selectedCompanyKey') === 'ALL_COMPANIES'
      || Number(localStorage.getItem('companyId') || 0) === 0;
    if (!isAllCompanies) return true;

    // Only the HQ (company 1) admin receives elevated cross-company rights.
    return Number(localStorage.getItem('loginCompanyId') || 0) === 1;
  }

  getRememberedUser(): string | null {
    return localStorage.getItem(this.REMEMBER_KEY);
  }

  setRememberedUser(email: string): void {
    localStorage.setItem(this.REMEMBER_KEY, email);
  }

  clearRememberedUser(): void {
    localStorage.removeItem(this.REMEMBER_KEY);
  }

  forgotPassword(data: { email: string; mode: string }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/user/forgotPassword`, data);
  }

  resetPassword(data: { token: string; email: string; newPassword: string }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/user/resetPassword`, data);
  }

  getAccessContext(): Observable<LoginResponse> {
    return this.http.get<LoginResponse>(`${environment.apiUrl}/user/access-context`).pipe(
      tap(res => {
        if (res.success && res.data) {
          localStorage.setItem('organizations', JSON.stringify(res.data.organizations ?? []));
          localStorage.setItem('companies', JSON.stringify(res.data.companies ?? []));
        }
      })
    );
  }

  changePassword(data: { currentPassword: string; newPassword: string; confirmNewPassword: string }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/user/changePassword`, {
      ...data,
      CreatedBy: Number(localStorage.getItem('id') || 0),
      UpdatedBy: Number(localStorage.getItem('id') || 0),
      UpdatedDate: new Date()
    });
  }
}
