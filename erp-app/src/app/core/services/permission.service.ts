import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface PermFlags {
  View: boolean;
  Create: boolean;
  Edit: boolean;
  Delete: boolean;
  Submit: boolean;
  Approve: boolean;
  Reject: boolean;
  Cancel: boolean;
  Export: boolean;
  Print: boolean;
  Post: boolean;
}

const LS_KEY = 'userPermissions';
const FUNCTION_ID_ALIAS: Record<string, string> = {
  general: 'home',
  dashboard: 'home',
  'stock-overview': 'mr-list',
  'stock transfer': 'mr-list',
  'stock-transfer': 'mr-list',
  'stock_transfer': 'mr-list'
};

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private permMap = new Map<string, PermFlags>();
  private loaded = false;
  private readonly permissionChanges = new BehaviorSubject<void>(undefined);
  readonly changes$ = this.permissionChanges.asObservable();

  /**
   * Emits true once a load attempt has settled. Route guards wait on this so a
   * direct URL hit is not judged against a half-restored permission map.
   */
  private readonly readyState = new BehaviorSubject<boolean>(false);
  readonly ready$ = this.readyState.asObservable();

  constructor(private http: HttpClient) {
    // Try to restore from localStorage on startup (for page refreshes)
    try {
      const cached = localStorage.getItem(LS_KEY);
      if (cached) {
        this.parsePermissions(JSON.parse(cached));
        this.loaded = true;
      }
    } catch {}
    window.addEventListener('menu-permission-updated', () => this.load());

    // The cache is only a first-paint optimisation; the API is the authority.
    // Without this refresh a permission granted since the cache was written
    // stays invisible to the route guards, while the sidebar - which queries
    // the API per item - already shows it. That mismatch shows up as a menu
    // entry that bounces straight back to the dashboard when clicked.
    this.load();
  }

  load(): void {
    const userId = localStorage.getItem('id');
    if (!userId) { this.settle(); return; }

    this.http.get<any>(`${environment.apiUrl}/User/organization-role/${userId}`)
      // A 4xx is the server's verdict, not an outage - older deployments answer
      // "no role stored" with 404. Only an unreachable API keeps the last known
      // permissions; anything else is parsed, so a revoked grant really goes.
      .pipe(catchError(err => {
        const status = Number(err?.status ?? 0);
        return of(status === 0 || status >= 500 ? { __permissionLoadFailed: true } : []);
      }))
      .subscribe(res => {
        // Preserve the last known permissions only for a genuine transport/API
        // failure. A successful empty response means the user has no grants and
        // must clear a stale cache instead of inheriting old access.
        if (res?.__permissionLoadFailed) { this.settle(); return; }
        const arr = this.extractArray(res);
        this.parsePermissions(arr);
        try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
        this.settle();
      });
  }

  /**
   * Drop every grant held in memory. The service is an app-wide singleton, so
   * without this the next user to sign in inside the same tab is judged against
   * the previous user's permissions until their own load returns.
   */
  clear(): void {
    this.permMap.clear();
    this.loaded = false;
    this.readyState.next(false);
    this.permissionChanges.next();
  }

  /** Mark the permission map usable and wake anything waiting on it. */
  private settle(): void {
    this.loaded = true;
    this.readyState.next(true);
    this.permissionChanges.next();
  }

  /** Load directly from a permissions array (e.g., from login response or stored JSON) */
  loadFromJson(data: any[]): void {
    if (!Array.isArray(data)) return;
    this.parsePermissions(data);
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
    this.settle();
  }

  private hasData(): boolean {
    return this.permMap.size > 0;
  }

  private isSubCompanyAdmin(): boolean {
    if (Number(localStorage.getItem('companyId') || 0) <= 1) return false;
    let roles: string[] = [];
    try { roles = JSON.parse(localStorage.getItem('approvalRoles') || '[]'); } catch {}
    return Array.isArray(roles) && roles.some(role =>
      String(role || '').toLowerCase().replace(/[\s_-]/g, '') === 'admin'
    );
  }

  private flags(functionId: string): PermFlags | null {
    if (!functionId) return null;
    return this.permMap.get(this.normalizeFunctionId(functionId)) ?? null;
  }

  canView(functionId: string): boolean {
    if (!functionId) return true;
    if (!this.loaded || !this.hasData()) return false;
    // Once an explicit permission set exists, a missing function is denied.
    // Otherwise unchecking/removing View could fall back to the user's role and
    // silently grant the screen again.
    return this.flags(functionId)?.View ?? false;
  }

  /**
   * "All companies" is a cross-company overview, not a place to work from — a
   * record created there has no unambiguous owning company. Every write check
   * below refuses in that mode, so Create / Edit / Delete buttons disappear.
   * Mirrors allCompaniesReadonlyInterceptor, which blocks the same calls in HTTP.
   */
  private isAllCompaniesMode(): boolean {
    return localStorage.getItem('selectedCompanyKey') === 'ALL_COMPANIES'
      || Number(localStorage.getItem('companyId') || 0) === 0;
  }

  canCreate(functionId: string): boolean {
    if (!functionId) return true;
    if (this.isAllCompaniesMode()) return false;
    if (this.isSubCompanyAdmin()) return true;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Create ?? false;
  }

  canEdit(functionId: string): boolean {
    if (!functionId) return true;
    if (this.isAllCompaniesMode()) return false;
    if (this.isSubCompanyAdmin()) return true;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Edit ?? false;
  }

  canDelete(functionId: string): boolean {
    if (!functionId) return true;
    if (this.isAllCompaniesMode()) return false;
    if (this.isSubCompanyAdmin()) return true;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Delete ?? false;
  }

  canApprove(functionId: string): boolean {
    if (!functionId) return true;
    if (this.isAllCompaniesMode()) return false;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Approve ?? false;
  }

  canReject(functionId: string): boolean {
    if (!functionId) return true;
    if (this.isAllCompaniesMode()) return false;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Reject ?? false;
  }

  canExport(functionId: string): boolean {
    if (!functionId) return true;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Export ?? false;
  }

  canPrint(functionId: string): boolean {
    if (!functionId) return true;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Print ?? false;
  }

  canPost(functionId: string): boolean {
    if (!functionId) return true;
    if (this.isAllCompaniesMode()) return false;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Post ?? false;
  }

  canSubmit(functionId: string): boolean {
    if (!functionId) return true;
    if (this.isAllCompaniesMode()) return false;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Submit ?? false;
  }

  canCancel(functionId: string): boolean {
    if (!functionId) return true;
    if (this.isAllCompaniesMode()) return false;
    if (!this.loaded || !this.hasData()) return false;
    return this.flags(functionId)?.Cancel ?? false;
  }

  private normalizeFunctionId(functionId: string): string {
    const key = String(functionId || '').trim().toLowerCase();
    return FUNCTION_ID_ALIAS[key] || key;
  }

  private parsePermissions(res: any): void {
    this.permMap.clear();
    const arr = this.extractArray(res);
    for (const item of arr) {
      const fnId = this.normalizeFunctionId(item?.FunctionId ?? item?.functionId ?? '');
      if (!fnId) continue;
      const p = item?.Permissions ?? item?.permissions ?? item?.flags ?? item?.Flags ?? item ?? {};
      this.permMap.set(fnId, {
        View:   !!(p?.View   ?? p?.view   ?? p?.V ?? false),
        Create: !!(p?.Create ?? p?.create ?? p?.C ?? false),
        Edit:   !!(p?.Edit   ?? p?.edit   ?? p?.E ?? false),
        Delete: !!(p?.Delete ?? p?.delete ?? p?.D ?? false),
        Submit: !!(p?.Submit ?? p?.submit ?? p?.S ?? false),
        Approve:!!(p?.Approve?? p?.approve?? p?.A ?? false),
        Reject: !!(p?.Reject ?? p?.reject ?? p?.R ?? false),
        Cancel: !!(p?.Cancel ?? p?.cancel ?? p?.N ?? false),
        Export: !!(p?.Export ?? p?.export ?? p?.X ?? false),
        Print:  !!(p?.Print  ?? p?.print  ?? p?.P ?? false),
        Post:   !!(p?.Post   ?? p?.post   ?? p?.M ?? false),
      });
    }
  }

  private extractArray(res: any): any[] {
    if (!res) return [];

    const isPermRow = (item: any) =>
      item && typeof item === 'object' &&
      (item.functionId || item.FunctionId || item.functionTitle || item.FunctionTitle);

    const tryParseJson = (s: any): any[] => {
      if (typeof s !== 'string' || !s.trim()) return [];
      try {
        let p: any = JSON.parse(s);
        if (typeof p === 'string') p = JSON.parse(p);
        return Array.isArray(p) ? p : [];
      } catch { return []; }
    };

    if (Array.isArray(res) && res.length && isPermRow(res[0])) return res;

    const data = res?.data ?? res;

    if (Array.isArray(data) && data.length) {
      if (isPermRow(data[0])) return data;
      for (const item of data) {
        const nested = this.extractArray(item);
        if (nested.length) return nested;
      }
    }

    if (data && typeof data === 'object') {
      // Handle { RolesJSON: "[...]" } response from /User/organization-role endpoint
      const rolesJson = data.rolesJSON ?? data.RolesJSON ?? null;
      if (rolesJson) {
        const parsed = tryParseJson(rolesJson);
        if (parsed.length && isPermRow(parsed[0])) return parsed;
      }

      for (const key of ['permissions', 'Permissions', 'items', 'Items', 'roles', 'Roles', 'functionPermissions', 'FunctionPermissions']) {
        if (Array.isArray(data[key]) && data[key].length && isPermRow(data[key][0])) return data[key];
      }

      // Support legacy/custom column aliases containing the serialized role
      // permissions instead of relying only on the exact RolesJSON casing.
      for (const key of Object.keys(data)) {
        const parsed = tryParseJson(data[key]);
        if (parsed.length && isPermRow(parsed[0])) return parsed;
      }
    }

    return [];
  }
}
