import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
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

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private permMap = new Map<string, PermFlags>();
  private loaded = false;

  constructor(private http: HttpClient) {
    window.addEventListener('menu-permission-updated', () => this.load());
  }

  load(): void {
    const userId = localStorage.getItem('id');
    const isMasterOwner = localStorage.getItem('isMasterOwner') === 'true';
    if (!userId) { this.loaded = true; return; }
    if (isMasterOwner) { this.loaded = true; return; }

    this.http.get<any>(`${environment.apiUrl}/User/organization-role/${userId}`)
      .pipe(catchError(() => of(null)))
      .subscribe(res => {
        this.parsePermissions(res);
        this.loaded = true;
      });
  }

  private isMaster(): boolean {
    return localStorage.getItem('isMasterOwner') === 'true';
  }

  private hasData(): boolean {
    return this.permMap.size > 0;
  }

  private flags(functionId: string): PermFlags | null {
    if (!functionId) return null;
    return this.permMap.get(functionId.toLowerCase()) ?? null;
  }

  canView(functionId: string): boolean {
    if (this.isMaster()) return true;
    if (!this.loaded || !functionId) return true;
    if (!this.hasData()) return true;
    return this.flags(functionId)?.View ?? false;
  }

  canCreate(functionId: string): boolean {
    if (this.isMaster()) return true;
    if (!this.loaded || !functionId) return true;
    if (!this.hasData()) return true;
    return this.flags(functionId)?.Create ?? false;
  }

  canEdit(functionId: string): boolean {
    if (this.isMaster()) return true;
    if (!this.loaded || !functionId) return true;
    if (!this.hasData()) return true;
    return this.flags(functionId)?.Edit ?? false;
  }

  canDelete(functionId: string): boolean {
    if (this.isMaster()) return true;
    if (!this.loaded || !functionId) return true;
    if (!this.hasData()) return true;
    return this.flags(functionId)?.Delete ?? false;
  }

  canApprove(functionId: string): boolean {
    if (this.isMaster()) return true;
    if (!this.loaded || !functionId) return true;
    if (!this.hasData()) return true;
    return this.flags(functionId)?.Approve ?? false;
  }

  canExport(functionId: string): boolean {
    if (this.isMaster()) return true;
    if (!this.loaded || !functionId) return true;
    if (!this.hasData()) return true;
    return this.flags(functionId)?.Export ?? false;
  }

  private parsePermissions(res: any): void {
    this.permMap.clear();
    const arr = this.extractArray(res);
    for (const item of arr) {
      const fnId = String(item?.FunctionId ?? item?.functionId ?? '').toLowerCase();
      if (!fnId) continue;
      const p = item?.Permissions ?? item?.permissions ?? item?.flags ?? {};
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

    if (Array.isArray(res) && res.length && isPermRow(res[0])) return res;

    const data = res?.data ?? res;

    if (Array.isArray(data) && data.length) {
      if (isPermRow(data[0])) return data;
      if (Array.isArray(data[0])) {
        const nested = this.extractArray(data[0]);
        if (nested.length) return nested;
      }
    }

    if (data && typeof data === 'object') {
      for (const key of ['permissions', 'Permissions', 'items', 'Items', 'roles', 'Roles', 'functionPermissions', 'FunctionPermissions']) {
        if (Array.isArray(data[key]) && data[key].length && isPermRow(data[key][0])) return data[key];
      }
    }

    return [];
  }
}
