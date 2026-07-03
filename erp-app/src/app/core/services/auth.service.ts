import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { PermissionService } from './permission.service';
import { PeriodLockStateService } from './period-lock-state.service';
import { CurrencyDisplayService } from './currency-display.service';

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
    localStorage.setItem('id', String(data.userId));
    localStorage.setItem('approvalRoles', JSON.stringify(data.approvalLevelNames));
    localStorage.setItem('approvalLevelIds', JSON.stringify(data.approvalLevelIds));
    localStorage.setItem('teams', JSON.stringify(data.teams));
    localStorage.setItem('allowedMenuIds', JSON.stringify(data.allowedMenuIds));
    localStorage.setItem('companyId', String(data.companyId));
    localStorage.setItem('companyName', data.companyName);
    localStorage.setItem('locationId', String(data.locationId));
    localStorage.setItem('departmentId', String(data.departmentId));
    localStorage.setItem('orgGuid', data.orgGuid ?? '');
    localStorage.setItem('databaseName', data.databaseName);
    localStorage.setItem('isMasterOwner', String(data.isMasterOwner));
    localStorage.setItem('isTenantUser', String(data.isTenantUser));
    localStorage.setItem('organizations', JSON.stringify(data.organizations));
    localStorage.setItem('companies', JSON.stringify(data.companies));
    localStorage.setItem('organizationId', data.organizationId ?? '');
    localStorage.setItem('companyCurrencyId', String(data.companyCurrencyId));
    localStorage.setItem('companyCurrencyName', data.companyCurrencyName ?? '');
    // Refresh currency symbols + tax name for the freshly selected company.
    this.currencyDisplay.reload();
  }

  logout(): void {
    const keys = [
      'token', 'username', 'email', 'id',
      'approvalRoles', 'approvalLevelIds', 'teams', 'allowedMenuIds',
      'companyId', 'companyName', 'locationId', 'departmentId',
      'orgGuid', 'databaseName', 'isMasterOwner', 'isTenantUser',
      'organizations', 'companies', 'organizationId',
      'companyCurrencyId', 'companyCurrencyName',
      'appCurrencySymbol', 'appTaxName',
      'currencySymByIdMap', 'currencySymByNameMap',
      'userPermissions'
    ];
    keys.forEach(k => localStorage.removeItem(k));
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
   * Plain "Admin" is intentionally NOT treated as Super Admin — Admin is a
   * narrower, per-company role (see CompanyComponent, which scopes an Admin's
   * visible companies by CompanyId instead of granting full access).
   */
  isSuperAdmin(): boolean {
    if (localStorage.getItem('isMasterOwner') === 'true') return true;
    let roles: string[] = [];
    try { roles = JSON.parse(localStorage.getItem('approvalRoles') || '[]'); } catch {}
    const SUPER_ADMIN_ROLES = new Set(['superadmin', 'owner', 'systemadministrator']);
    return Array.isArray(roles) && roles.some(r =>
      SUPER_ADMIN_ROLES.has(String(r || '').toLowerCase().replace(/[\s_-]/g, ''))
    );
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

  changePassword(data: { currentPassword: string; newPassword: string; confirmNewPassword: string }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/user/changePassword`, {
      ...data,
      CreatedBy: Number(localStorage.getItem('id') || 0),
      UpdatedBy: Number(localStorage.getItem('id') || 0),
      UpdatedDate: new Date()
    });
  }
}
