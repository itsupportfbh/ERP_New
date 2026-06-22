import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface DepartmentDto {
  id: number;
  departmentName: string;
}

export interface DepartmentMenuAccessListItem {
  departmentId: number;
  departmentName: string;
  menuIds: string[];
  menuNames?: string[];
}

export interface SaveDepartmentMenuAccessRequest {
  departmentId: number;
  menuIds: string[];
  updatedBy: number;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  isSuccess?: boolean;
  message?: string;
  data?: T;
}

@Injectable({ providedIn: 'root' })
export class DepartmentMenuAccessService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getDepartments(): Observable<ApiResponse<DepartmentDto[]>> {
    return this.http.get<ApiResponse<DepartmentDto[]>>(`${this.apiUrl}/Department/getAll`);
  }

  getAllDepartmentMenuAccess(): Observable<DepartmentMenuAccessListItem[]> {
    return this.http.get<DepartmentMenuAccessListItem[]>(`${this.apiUrl}/DepartmentMenuAccess/list`);
  }

  getByDepartmentId(departmentId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/DepartmentMenuAccess/by-department/${departmentId}`);
  }

  saveDepartmentMenuAccess(payload: SaveDepartmentMenuAccessRequest): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.apiUrl}/DepartmentMenuAccess/save`, payload);
  }

  deleteDepartmentMenuAccess(departmentId: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.apiUrl}/DepartmentMenuAccess/delete/${departmentId}`);
  }
}
