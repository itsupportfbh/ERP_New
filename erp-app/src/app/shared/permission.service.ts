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

  getFunctionPermission(userId: number, functionId: string): Observable<FunctionPermission> {
    const normalizedFunctionId = this.normalizeFunctionId(functionId);

    if (this.isFullAccessContext()) {
      return of(this.getFullPermission(normalizedFunctionId));
    }

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
        catchError(() => of(this.getCachedPermission(normalizedFunctionId)))
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

  private getFullPermission(functionId: string): FunctionPermission {
    return {
      ...this.getEmptyPermission(functionId),
      view: true,
      create: true,
      edit: true,
      delete: true,
      submit: true,
      approve: true,
      reject: true,
      cancel: true,
      print: true,
      export: true,
      post: true
    };
  }

  private isFullAccessContext(): boolean {
    if (
      localStorage.getItem('selectedCompanyKey') === 'ALL_COMPANIES' ||
      localStorage.getItem('selectedOrgKey') === 'ALL_ORGANIZATIONS' ||
      Number(localStorage.getItem('companyId') || 0) === 0
    ) {
      return false;
    }

    let roles: string[] = [];
    try { roles = JSON.parse(localStorage.getItem('approvalRoles') || '[]'); } catch {}
    const fullAccessRoles = new Set(['superadmin', 'master', 'systemadministrator', 'admin', 'orgadmin', 'owner', 'orgowner']);
    return Array.isArray(roles) && roles.some(r =>
      fullAccessRoles.has(String(r || '').toLowerCase().replace(/[\s_-]/g, ''))
    );
  }

  hasView(permission: FunctionPermission | null | undefined): boolean { return !!permission?.view; }
  hasCreate(permission: FunctionPermission | null | undefined): boolean { return !!permission?.create; }
  hasEdit(permission: FunctionPermission | null | undefined): boolean { return !!permission?.edit; }
  hasDelete(permission: FunctionPermission | null | undefined): boolean { return !!permission?.delete; }
  hasSubmit(permission: FunctionPermission | null | undefined): boolean { return !!permission?.submit; }
  hasApprove(permission: FunctionPermission | null | undefined): boolean { return !!permission?.approve; }
  hasReject(permission: FunctionPermission | null | undefined): boolean { return !!permission?.reject; }
  hasCancel(permission: FunctionPermission | null | undefined): boolean { return !!permission?.cancel; }
  hasExport(permission: FunctionPermission | null | undefined): boolean { return !!permission?.export; }
  hasPrint(permission: FunctionPermission | null | undefined): boolean { return !!permission?.print; }
  hasPost(permission: FunctionPermission | null | undefined): boolean { return !!permission?.post; }

  private normalizeFunctionId(functionId: string): string {
    const key = String(functionId || '').trim().toLowerCase();
    return FUNCTION_ID_ALIAS[key] || key;
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
