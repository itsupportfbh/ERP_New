import { Observable } from 'rxjs';

/**
 * Field/report metadata driving the shared <erp-dynamic-report> renderer.
 * Keys must match the camelCase property names on the rows the fetch returns.
 *
 * `sens` marks a commercially sensitive field. The flag is only a UI hint —
 * where the API supplies meta.allowedFields it is the authority and simply
 * omits those columns for roles that may not see them.
 */
export type ReportFieldType = 'text' | 'num' | 'money' | 'pct' | 'date' | 'status';

export interface ReportFieldDef {
  key: string;
  label: string;
  tab: string;
  /** shown by default */
  def?: boolean;
  type?: ReportFieldType;
  /** summable in subtotal / grand total rows */
  sum?: boolean;
  /** offered in the Group by dropdown */
  grp?: boolean;
  /** sensitive (cost / margin / spend) */
  sens?: boolean;
}

/**
 * Which row property each of the renderer's five filter slots matches on.
 * Sales reports use the defaults; purchase reports remap them onto supplier /
 * location / department etc. so one filter panel serves both modules.
 */
export interface ReportFilterKeys {
  customer?: string;
  branch?: string;
  salesperson?: string;
  category?: string;
  status?: string;
}

/** Labels for those same five slots, so the panel reads correctly per module. */
export interface ReportFilterLabels {
  customer?: string;
  branch?: string;
  salesperson?: string;
  category?: string;
  status?: string;
}

/** A headline figure shown above the table. */
export interface ReportKpi {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

/**
 * A single-series bar chart above the table. `fn` reduces the currently
 * filtered rows to a label -> value map; the renderer sorts descending and
 * shows the top slice.
 */
export interface ReportChart {
  title: string;
  fn: (rows: any[]) => Record<string, number>;
  /** format bar labels as money rather than plain numbers */
  money?: boolean;
}

export interface ReportDef {
  key: string;
  name: string;
  crumb: string;
  /** PermissionService functionId used to gate Export / Print */
  functionId: string;
  /**
   * Field the date-range filter applies to. Leave empty for aggregate reports
   * (stage counts, scorecards) that have no per-row date — the renderer then
   * skips date filtering instead of discarding every row.
   */
  dateField: string;
  /** `svc` is whichever service the host passes to <erp-dynamic-report [service]>. */
  fetch: (svc: any) => Observable<any>;
  /** optional per-row post-processing for computed columns */
  derive?: (row: any) => any;
  /** group key applied on open, e.g. a "by supplier" summary over detail rows */
  defaultGroup?: string;
  /** headline figures, recomputed from the rows currently in view */
  kpis?: (rows: any[]) => ReportKpi[];
  chart?: ReportChart;
  filterKeys?: ReportFilterKeys;
  filterLabels?: ReportFilterLabels;
  fields: ReportFieldDef[];
}

/** Row property each filter slot falls back to when a def does not remap it. */
export const DEFAULT_FILTER_KEYS: Required<ReportFilterKeys> = {
  customer: 'customerName',
  branch: 'branch',
  salesperson: 'salesPerson',
  category: 'category',
  status: 'status'
};

export const DEFAULT_FILTER_LABELS: Required<ReportFilterLabels> = {
  customer: 'Customer',
  branch: 'Branch / Location',
  salesperson: 'Salesperson',
  category: 'Category',
  status: 'Status'
};
