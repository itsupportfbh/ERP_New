import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface FunctionPermission {
  functionId: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  submit: boolean;
  approve: boolean;
  reject: boolean;
  cancel: boolean;
  print: boolean;
  export: boolean;
  post: boolean;
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
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Bulk permission source used by the sidebar. The API stores this array in
   * RolesJSON; allowedMenuIds is department navigation and is not a View grant. */
  getUserFunctionPermissions(userId: number): Observable<FunctionPermission[]> {
    return this.http.get<any>(`${this.baseUrl}/User/organization-role/${userId}`).pipe(
      map(res => {
        const rows = this.extractPermissionRows(res);
        // A successful response that carries no rows means "this user has no
        // grants" and must be honoured. Falling back to the cache here made
        // revoked View flags keep showing their menu, because the previous
        // session's permissions were still sitting in localStorage. The cache
        // is only a stand-in for an unreachable API - see catchError below.
        const permissions = rows.map(row => this.toPermission(row)).filter(p => !!p.functionId);
        try { localStorage.setItem(LS_KEY, JSON.stringify(rows)); } catch {}
        return permissions;
      }),
      catchError(err => of(this.isApiUnreachable(err) ? this.getCachedPermissions() : []))
    );
  }

  /**
   * Only a genuinely unreachable API justifies answering from the cache. A 4xx
   * is the server's verdict - "no role stored for you" arrives as 404 on older
   * deployments - and treating it as an outage resurrected the previous
   * session's permissions, so revoked menus kept appearing.
   */
  private isApiUnreachable(err: any): boolean {
    const status = Number(err?.status ?? 0);
    return status === 0 || status >= 500;
  }

  getFunctionPermission(userId: number, functionId: string): Observable<FunctionPermission> {
    const normalizedFunctionId = this.normalizeFunctionId(functionId);

    return this.http
      .get<any>(`${this.baseUrl}/OrganizationRole/permission`, {
        params: { userId: String(userId), functionId: normalizedFunctionId }
      })
      .pipe(
        map((res: any) => {
          const parsed = this.parsePermissionResponse(res, normalizedFunctionId);
          if (parsed) {
            return parsed;
          }

          return this.getCachedPermission(normalizedFunctionId);
        }),
        catchError(err => of(this.isApiUnreachable(err)
          ? this.getCachedPermission(normalizedFunctionId)
          : this.getEmptyPermission(normalizedFunctionId)))
      );
  }

  getEmptyPermission(functionId = ''): FunctionPermission {
    return {
      functionId,
      view: false,
      create: false,
      edit: false,
      delete: false,
      submit: false,
      approve: false,
      reject: false,
      cancel: false,
      print: false,
      export: false,
      post: false
    };
  }

  /**
   * "All companies" is a cross-company overview, not a place to work from: a
   * record created there has no unambiguous owning company. So it is read-only
   * for everyone — the write checks below all return false, which hides Create /
   * Edit / Delete buttons across every screen that asks this service. This
   * mirrors allCompaniesReadonlyInterceptor, which blocks the same writes at the
   * HTTP layer; here it stops the buttons appearing in the first place.
   */
  private isAllCompaniesMode(): boolean {
    return localStorage.getItem('selectedCompanyKey') === 'ALL_COMPANIES'
      || Number(localStorage.getItem('companyId') || 0) === 0;
  }

  // Reads — always allowed when the role permits.
  hasView(permission: FunctionPermission | null | undefined): boolean { return !!permission?.view; }
  hasExport(permission: FunctionPermission | null | undefined): boolean { return !!permission?.export; }
  hasPrint(permission: FunctionPermission | null | undefined): boolean { return !!permission?.print; }

  // Writes — additionally blocked while in "All companies".
  hasCreate(permission: FunctionPermission | null | undefined): boolean { return !this.isAllCompaniesMode() && (this.isSubCompanyAdmin() || !!permission?.create); }
  hasEdit(permission: FunctionPermission | null | undefined): boolean { return !this.isAllCompaniesMode() && (this.isSubCompanyAdmin() || !!permission?.edit); }
  hasDelete(permission: FunctionPermission | null | undefined): boolean { return !this.isAllCompaniesMode() && (this.isSubCompanyAdmin() || !!permission?.delete); }
  hasSubmit(permission: FunctionPermission | null | undefined): boolean { return !this.isAllCompaniesMode() && !!permission?.submit; }
  hasApprove(permission: FunctionPermission | null | undefined): boolean { return !this.isAllCompaniesMode() && !!permission?.approve; }
  hasReject(permission: FunctionPermission | null | undefined): boolean { return !this.isAllCompaniesMode() && !!permission?.reject; }
  hasCancel(permission: FunctionPermission | null | undefined): boolean { return !this.isAllCompaniesMode() && !!permission?.cancel; }
  hasPost(permission: FunctionPermission | null | undefined): boolean { return !this.isAllCompaniesMode() && !!permission?.post; }

  private normalizeFunctionId(functionId: string): string {
    const key = String(functionId || '').trim().toLowerCase();
    return FUNCTION_ID_ALIAS[key] || key;
  }

  private isSubCompanyAdmin(): boolean {
    if (Number(localStorage.getItem('companyId') || 0) <= 1) return false;
    let roles: string[] = [];
    try { roles = JSON.parse(localStorage.getItem('approvalRoles') || '[]'); } catch {}
    return Array.isArray(roles) && roles.some(role =>
      String(role || '').toLowerCase().replace(/[\s_-]/g, '') === 'admin'
    );
  }

  private toPermission(row: any): FunctionPermission {
    const p = row?.Permissions ?? row?.permissions ?? row?.flags ?? row?.Flags ?? row ?? {};
    const functionId = this.normalizeFunctionId(row?.FunctionId ?? row?.functionId ?? '');
    return {
      functionId,
      view: !!(p?.View ?? p?.view ?? p?.V ?? false),
      create: !!(p?.Create ?? p?.create ?? p?.C ?? false),
      edit: !!(p?.Edit ?? p?.edit ?? p?.E ?? false),
      delete: !!(p?.Delete ?? p?.delete ?? p?.D ?? false),
      submit: !!(p?.Submit ?? p?.submit ?? p?.S ?? false),
      approve: !!(p?.Approve ?? p?.approve ?? p?.A ?? false),
      reject: !!(p?.Reject ?? p?.reject ?? p?.R ?? false),
      cancel: !!(p?.Cancel ?? p?.cancel ?? p?.N ?? false),
      print: !!(p?.Print ?? p?.print ?? p?.P ?? false),
      export: !!(p?.Export ?? p?.export ?? p?.X ?? false),
      post: !!(p?.Post ?? p?.post ?? p?.M ?? false)
    };
  }

  private extractPermissionRows(res: any): any[] {
    const isRow = (x: any) => x && typeof x === 'object' && (x.FunctionId || x.functionId);
    const parse = (value: any): any[] => {
      if (typeof value !== 'string' || !value.trim()) return [];
      try {
        let parsed: any = JSON.parse(value);
        // Some database drivers return RolesJSON as a JSON string containing
        // another JSON string. Unwrap both forms.
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    };
    if (Array.isArray(res)) return res.filter(isRow);
    const data = res?.data ?? res;
    if (Array.isArray(data)) {
      const direct = data.filter(isRow);
      if (direct.length) return direct;
      for (const item of data) {
        const nested = this.extractPermissionRows(item);
        if (nested.length) return nested;
      }
    }
    if (data && typeof data === 'object') {
      const roles = parse(data.RolesJSON ?? data.rolesJSON);
      if (roles.length) return roles.filter(isRow);
      for (const key of ['permissions', 'Permissions', 'items', 'Items', 'roles', 'Roles']) {
        if (Array.isArray(data[key])) {
          const rows = data[key].filter(isRow);
          if (rows.length) return rows;
        }
      }
      // SQL aliases differ between deployed databases (RolesJSON, RoleJson,
      // PermissionJSON, etc.). Inspect every JSON-array string, as the User
      // Access editor already does, and accept only function permission rows.
      for (const key of Object.keys(data)) {
        const rows = parse(data[key]);
        if (rows.some(isRow)) return rows.filter(isRow);
      }
    }
    return [];
  }

  private getCachedPermissions(): FunctionPermission[] {
    try {
      const rows = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      return Array.isArray(rows) ? rows.map(row => this.toPermission(row)).filter(p => !!p.functionId) : [];
    } catch { return []; }
  }

  private parsePermissionResponse(res: any, fallbackFunctionId: string): FunctionPermission | null {
    const data = res?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return {
        functionId: this.normalizeFunctionId(data.functionId || data.FunctionId || fallbackFunctionId),
        view: !!(data.view ?? data.View),
        create: !!(data.create ?? data.Create),
        edit: !!(data.edit ?? data.Edit),
        delete: !!(data.delete ?? data.Delete),
        submit: !!(data.submit ?? data.Submit),
        approve: !!(data.approve ?? data.Approve),
        reject: !!(data.reject ?? data.Reject),
        cancel: !!(data.cancel ?? data.Cancel),
        print: !!(data.print ?? data.Print),
        export: !!(data.export ?? data.Export),
        post: !!(data.post ?? data.Post)
      };
    }

    return null;
  }

  private getCachedPermission(functionId: string): FunctionPermission {
    const normalizedFunctionId = this.normalizeFunctionId(functionId);

    try {
      const cached = localStorage.getItem(LS_KEY);
      if (cached) {
        const rows = JSON.parse(cached);
        const match = Array.isArray(rows)
          ? rows.find((item: any) => this.normalizeFunctionId(item?.FunctionId ?? item?.functionId ?? '') === normalizedFunctionId)
          : null;

        if (match) {
          const p = match?.Permissions ?? match?.permissions ?? match?.flags ?? {};
          return {
            functionId: normalizedFunctionId,
            view: !!(p?.View ?? p?.view ?? p?.V ?? false),
            create: !!(p?.Create ?? p?.create ?? p?.C ?? false),
            edit: !!(p?.Edit ?? p?.edit ?? p?.E ?? false),
            delete: !!(p?.Delete ?? p?.delete ?? p?.D ?? false),
            submit: !!(p?.Submit ?? p?.submit ?? p?.S ?? false),
            approve: !!(p?.Approve ?? p?.approve ?? p?.A ?? false),
            reject: !!(p?.Reject ?? p?.reject ?? p?.R ?? false),
            cancel: !!(p?.Cancel ?? p?.cancel ?? p?.N ?? false),
            print: !!(p?.Print ?? p?.print ?? p?.P ?? false),
            export: !!(p?.Export ?? p?.export ?? p?.X ?? false),
            post: !!(p?.Post ?? p?.post ?? p?.M ?? false)
          };
        }
      }
    } catch {}

    return this.getEmptyPermission(normalizedFunctionId);
  }
}
