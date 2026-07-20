import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface SavedViewConfig {
  columns: string[];
  groupKey: string;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  pageSize: number;
  search: string;
  filters: any;
}

export interface SavedView {
  id?: number;
  reportKey: string;
  name: string;
  config: SavedViewConfig | any;
}

/** Per-user saved column/filter presets, stored in dbo.ReportSavedView. */
@Injectable({ providedIn: 'root' })
export class SavedViewsService {
  private readonly api = `${environment.apiUrl}/ReportSavedView`;

  constructor(private http: HttpClient) {}

  list(reportKey: string): Observable<SavedView[]> {
    return this.http.get<any>(`${this.api}?reportKey=${encodeURIComponent(reportKey)}`)
      .pipe(map(res => this.unwrap(res).map(v => this.toView(v))));
  }

  save(view: SavedView): Observable<SavedView> {
    const body = { reportKey: view.reportKey, name: view.name, configJson: JSON.stringify(view.config) };
    return this.http.post<any>(this.api, body)
      .pipe(map(res => this.toView(this.unwrapOne(res)) ?? { ...view }));
  }

  remove(id: number): Observable<any> {
    return this.http.delete(`${this.api}/${id}`);
  }

  private unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }

  private unwrapOne(res: any): any {
    return res?.data ?? res?.result ?? res;
  }

  private toView(raw: any): SavedView {
    let config: any = {};
    const rawConfig = raw?.configJson ?? raw?.ConfigJson;
    if (rawConfig) {
      try { config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig; } catch { config = {}; }
    }
    return {
      id: raw?.id ?? raw?.Id,
      reportKey: raw?.reportKey ?? raw?.ReportKey ?? '',
      name: raw?.name ?? raw?.Name ?? '',
      config
    };
  }
}
