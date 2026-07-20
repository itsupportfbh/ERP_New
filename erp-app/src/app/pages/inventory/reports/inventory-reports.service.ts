import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

/**
 * Data access for the inventory reports.
 *
 * Seven of the eight reports come from InventoryReportController, which returns
 * the same { isSuccess, data, meta } envelope the sales reports use — so
 * `meta.allowedFields` still decides which columns the renderer may show, and
 * the cost/value columns are absent from the payload entirely for roles that
 * may not see them.
 *
 * COGS is the exception: it is served by the pre-existing CogsReportController
 * at /api/reports/cogs, whose payload is a single object with a summary and an
 * item array rather than a flat list. Rather than duplicate the costing logic in
 * a second query, that one response is flattened here.
 */
@Injectable({ providedIn: 'root' })
export class InventoryReportsService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** unwrap { isSuccess, data } | { data } | array */
  unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }

  /**
   * Access metadata the API attaches to a report response: `allowedFields` are
   * the columns this user's role may see, `branchLock` the branch its rows were
   * restricted to. The COGS endpoint sends none, which reads as "all allowed".
   */
  unwrapMeta(res: any): { allowedFields?: string[]; branchLock?: string | null } | null {
    return res?.meta ?? res?.Meta ?? null;
  }

  getStockSummary(): Observable<any> {
    return this.http.get(`${this.api}/InventoryReport/GetStockSummary`);
  }

  getStockMovement(): Observable<any> {
    return this.http.get(`${this.api}/InventoryReport/GetStockMovement`);
  }

  getStockTakeVariance(): Observable<any> {
    return this.http.get(`${this.api}/InventoryReport/GetStockTakeVariance`);
  }

  getStockAdjustments(): Observable<any> {
    return this.http.get(`${this.api}/InventoryReport/GetStockAdjustments`);
  }

  getReorder(): Observable<any> {
    return this.http.get(`${this.api}/InventoryReport/GetReorder`);
  }

  getTransfers(): Observable<any> {
    return this.http.get(`${this.api}/InventoryReport/GetTransfers`);
  }

  getValuationByCategory(): Observable<any> {
    return this.http.get(`${this.api}/InventoryReport/GetValuationByCategory`);
  }

  /**
   * COGS for the year to date. The endpoint requires an explicit range and
   * rejects a missing or inverted one, so the default is applied here rather
   * than left to the caller; the renderer's own date filter then narrows the
   * rows further client-side.
   */
  getCogs(): Observable<any> {
    const today = new Date();
    const from = new Date(today.getFullYear(), 0, 1);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    return this.http
      .get(`${this.api}/reports/cogs`, { params: { fromDate: iso(from), toDate: iso(today) } })
      .pipe(map(res => this.flattenCogs(res, iso(today))));
  }

  /**
   * { summary, items } -> flat rows the renderer can table. `periodEnd` is
   * stamped onto every row so the report has a date column to filter on.
   */
  private flattenCogs(res: any, fallbackPeriodEnd: string): any {
    const payload = res?.data ?? res?.Data ?? res;
    const items: any[] = payload?.items ?? payload?.Items ?? [];
    const summary = payload?.summary ?? payload?.Summary ?? {};
    const periodEnd = summary?.periodTo ?? summary?.PeriodTo ?? fallbackPeriodEnd;

    return {
      isSuccess: true,
      data: items.map(row => ({ ...row, periodEnd })),
      meta: this.unwrapMeta(res)
    };
  }
}
