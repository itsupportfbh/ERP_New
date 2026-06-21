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

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getFunctionPermission(userId: number, functionId: string): Observable<FunctionPermission> {
    return this.http
      .get<any>(`${this.baseUrl}/OrganizationRole/permission`, {
        params: { userId: String(userId), functionId }
      })
      .pipe(
        map((res: any) => {
          const data = res?.data || {};
          return {
            functionId: data.functionId || data.FunctionId || functionId,
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
          } as FunctionPermission;
        }),
        catchError(() => of(this.getFullPermission(functionId)))
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

  hasView(permission: FunctionPermission | null | undefined): boolean { return !!permission?.view; }
  hasCreate(permission: FunctionPermission | null | undefined): boolean { return !!permission?.create; }
  hasEdit(permission: FunctionPermission | null | undefined): boolean { return !!permission?.edit; }
  hasDelete(permission: FunctionPermission | null | undefined): boolean { return !!permission?.delete; }
  hasExport(permission: FunctionPermission | null | undefined): boolean { return !!permission?.export; }
  hasPrint(permission: FunctionPermission | null | undefined): boolean { return !!permission?.print; }
  hasPost(permission: FunctionPermission | null | undefined): boolean { return !!permission?.post; }
}
