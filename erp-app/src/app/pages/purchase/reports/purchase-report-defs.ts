import { ReportDef, ReportKpi } from '../../../shared/reports/report-def';

// ==================== KPI / chart helpers ====================

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isNaN(n) ? 0 : n;
};

const sum = (rows: any[], key: string): number => rows.reduce((s, r) => s + num(r[key]), 0);
const countWhere = (rows: any[], fn: (r: any) => boolean): number => rows.filter(fn).length;
const distinct = (rows: any[], key: string): number =>
  new Set(rows.map(r => r[key]).filter(v => v != null && v !== '')).size;

/** Compact money for KPI tiles - the table already shows exact figures. */
const money = (v: number): string =>
  num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (part: number, whole: number): string =>
  whole ? `${Math.round((part / whole) * 100)}%` : '-';

/** label -> count */
const countBy = (rows: any[], key: string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] ?? '(blank)');
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

/** label -> summed value */
const sumBy = (rows: any[], key: string, valueKey: string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] ?? '(blank)');
    out[k] = (out[k] ?? 0) + num(r[valueKey]);
  }
  return out;
};

const kpi = (label: string, value: string | number, tone?: ReportKpi['tone']): ReportKpi =>
  ({ label, value, tone });

/**
 * Purchase report metadata for the shared <erp-dynamic-report> renderer.
 * Keys match the normalised rows PurchaseReportsService emits, not the raw API
 * payloads — see that service for the PascalCase and status-integer handling.
 *
 * The renderer's five filter slots are remapped per report via `filterKeys`:
 * supplier takes the customer slot, location the branch slot, and department
 * the salesperson slot. A slot whose column is absent from a report simply
 * yields no distinct values and the panel hides it.
 */

/** Supplier-centric reports share one filter mapping. */
const SUPPLIER_FILTERS = {
  filterKeys: { customer: 'supplierName', branch: 'location', status: 'status' },
  filterLabels: { customer: 'Supplier', branch: 'Location / Outlet', status: 'Status' }
};

/** PR reports filter on requester/department instead of supplier. */
const REQUEST_FILTERS = {
  filterKeys: { customer: 'requester', salesperson: 'department', status: 'status' },
  filterLabels: { customer: 'Requester', salesperson: 'Department', status: 'Status' }
};

export const PURCHASE_REPORTS: ReportDef[] = [
  // ==================== Purchase Requests ====================
  {
    key: 'PUR_PR_REGISTER',
    name: 'PR Register',
    crumb: 'Reports > Purchase Requests',
    functionId: 'purchase-report-pr-register',
    dateField: 'prDate',
    fetch: svc => svc.getPurchaseRequests(),
    ...REQUEST_FILTERS,
    kpis: rows => [
      kpi('Total PRs', rows.length),
      kpi('Pending Approval', countWhere(rows, r => r.status === 'Pending Approval'), 'warning'),
      kpi('Approved', countWhere(rows, r => r.status === 'Approved'), 'success'),
      kpi('Rejected', countWhere(rows, r => r.status === 'Rejected'), 'danger')
    ],
    chart: { title: 'PRs by Department', fn: rows => countBy(rows, 'department') },
    fields: [
      { key: 'prNo', label: 'PR No', tab: 'Basic', def: true },
      { key: 'prDate', label: 'PR Date', tab: 'Basic', type: 'date', def: true },
      { key: 'requester', label: 'Requester', tab: 'Basic', def: true, grp: true },
      { key: 'department', label: 'Department', tab: 'Basic', def: true, grp: true },
      { key: 'deliveryDate', label: 'Delivery Date', tab: 'Basic', type: 'date', def: true },
      { key: 'lineCount', label: 'Lines', tab: 'Details', type: 'num', def: true, sum: true },
      { key: 'totalQty', label: 'Total Qty', tab: 'Details', type: 'num', sum: true },
      { key: 'description', label: 'Description', tab: 'Details' },
      { key: 'netTotal', label: 'Estimated Value', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },
  {
    key: 'PUR_PR_PENDING',
    name: 'Pending PR Approvals',
    crumb: 'Reports > Purchase Requests',
    functionId: 'purchase-report-pr-pending',
    dateField: 'prDate',
    fetch: svc => svc.getPendingPurchaseRequests(),
    ...REQUEST_FILTERS,
    kpis: rows => [
      kpi('Awaiting Approval', rows.length, 'warning'),
      kpi('Oldest (days)', rows.length ? Math.max(...rows.map(r => num(r.ageDays))) : 0, 'danger'),
      kpi('Over 7 Days', countWhere(rows, r => num(r.ageDays) > 7), 'danger'),
      kpi('Departments', distinct(rows, 'department'))
    ],
    chart: { title: 'Pending PRs by Department', fn: rows => countBy(rows, 'department') },
    fields: [
      { key: 'prNo', label: 'PR No', tab: 'Basic', def: true },
      { key: 'prDate', label: 'PR Date', tab: 'Basic', type: 'date', def: true },
      { key: 'ageDays', label: 'Age (Days)', tab: 'Basic', type: 'num', def: true },
      { key: 'requester', label: 'Requester', tab: 'Basic', def: true, grp: true },
      { key: 'department', label: 'Department', tab: 'Basic', def: true, grp: true },
      { key: 'deliveryDate', label: 'Needed By', tab: 'Basic', type: 'date', def: true },
      { key: 'lineCount', label: 'Lines', tab: 'Details', type: 'num', def: true, sum: true },
      { key: 'netTotal', label: 'Estimated Value', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'description', label: 'Description', tab: 'Details' }
    ]
  },
  {
    key: 'PUR_PR_BY_DEPT',
    name: 'PR by Department',
    crumb: 'Reports > Purchase Requests',
    functionId: 'purchase-report-pr-by-dept',
    dateField: 'prDate',
    fetch: svc => svc.getPurchaseRequests(),
    defaultGroup: 'department',
    ...REQUEST_FILTERS,
    kpis: rows => [
      kpi('Departments', distinct(rows, 'department')),
      kpi('Total PRs', rows.length),
      kpi('Total Lines', sum(rows, 'lineCount')),
      kpi('Approved', countWhere(rows, r => r.status === 'Approved'), 'success')
    ],
    chart: { title: 'PRs by Department', fn: rows => countBy(rows, 'department') },
    fields: [
      { key: 'department', label: 'Department', tab: 'Basic', def: true, grp: true },
      { key: 'prNo', label: 'PR No', tab: 'Basic', def: true },
      { key: 'prDate', label: 'PR Date', tab: 'Basic', type: 'date', def: true },
      { key: 'requester', label: 'Requester', tab: 'Basic', def: true, grp: true },
      { key: 'lineCount', label: 'Lines', tab: 'Details', type: 'num', def: true, sum: true },
      { key: 'totalQty', label: 'Total Qty', tab: 'Details', type: 'num', def: true, sum: true },
      { key: 'netTotal', label: 'Estimated Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },

  // ==================== Purchase Orders ====================
  {
    key: 'PUR_PO_REGISTER',
    name: 'PO Register',
    crumb: 'Reports > Purchase Orders',
    functionId: 'purchase-report-po-register',
    dateField: 'poDate',
    fetch: svc => svc.getPurchaseOrders(),
    ...SUPPLIER_FILTERS,
    kpis: rows => [
      kpi('Total POs', rows.length),
      kpi('Total Value', money(sum(rows, 'netTotal'))),
      kpi('Open POs', countWhere(rows, r => r.status === 'Approved' && num(r.receivedPct) < 100), 'warning'),
      kpi('Fully Received', countWhere(rows, r => num(r.receivedPct) >= 100), 'success')
    ],
    chart: { title: 'PO Value by Supplier', fn: rows => sumBy(rows, 'supplierName', 'netTotal'), money: true },
    fields: [
      { key: 'poNo', label: 'PO No', tab: 'Basic', def: true },
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'poDate', label: 'PO Date', tab: 'Basic', type: 'date', def: true },
      { key: 'deliveryDate', label: 'Delivery Date', tab: 'Basic', type: 'date', def: true },
      { key: 'location', label: 'Location', tab: 'Basic', grp: true },
      { key: 'purchaseRequestNo', label: 'PR No', tab: 'Details' },
      { key: 'lineCount', label: 'Lines', tab: 'Details', type: 'num', sum: true },
      { key: 'orderedQty', label: 'Ordered Qty', tab: 'Details', type: 'num', sum: true },
      { key: 'receivedQty', label: 'Received Qty', tab: 'Details', type: 'num', sum: true },
      { key: 'receivedPct', label: 'Received %', tab: 'Details', type: 'pct', def: true },
      { key: 'purchaseType', label: 'Type', tab: 'Details', grp: true },
      { key: 'currency', label: 'Currency', tab: 'Financial' },
      { key: 'subTotal', label: 'Sub Total', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'tax', label: 'Tax', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'netTotal', label: 'Net Total', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },
  {
    key: 'PUR_PO_OPEN',
    name: 'Open PO / Outstanding Deliveries',
    crumb: 'Reports > Purchase Orders',
    functionId: 'purchase-report-po-open',
    dateField: 'poDate',
    fetch: svc => svc.getOpenPurchaseOrders(),
    ...SUPPLIER_FILTERS,
    kpis: rows => [
      kpi('Open POs', rows.length, 'warning'),
      kpi('Outstanding Value', money(sum(rows, 'outstandingValue')), 'danger'),
      kpi('Overdue', countWhere(rows, r => !!r.isOverdue), 'danger'),
      kpi('Suppliers', distinct(rows, 'supplierName'))
    ],
    chart: {
      title: 'Outstanding Value by Supplier',
      fn: rows => sumBy(rows, 'supplierName', 'outstandingValue'),
      money: true
    },
    fields: [
      { key: 'poNo', label: 'PO No', tab: 'Basic', def: true },
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'poDate', label: 'PO Date', tab: 'Basic', type: 'date' },
      { key: 'deliveryDate', label: 'Due Date', tab: 'Basic', type: 'date', def: true },
      { key: 'isOverdue', label: 'Overdue', tab: 'Basic', grp: true },
      { key: 'location', label: 'Location', tab: 'Basic', grp: true },
      { key: 'orderedQty', label: 'Ordered Qty', tab: 'Details', type: 'num', def: true, sum: true },
      { key: 'receivedQty', label: 'Received Qty', tab: 'Details', type: 'num', def: true, sum: true },
      { key: 'receivedPct', label: 'Received %', tab: 'Details', type: 'pct', def: true },
      { key: 'currency', label: 'Currency', tab: 'Financial' },
      { key: 'netTotal', label: 'Net Total', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'outstandingValue', label: 'Outstanding Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },
  {
    key: 'PUR_PO_BY_SUPPLIER',
    name: 'PO Summary by Supplier',
    crumb: 'Reports > Purchase Orders',
    functionId: 'purchase-report-po-by-supplier',
    dateField: 'poDate',
    fetch: svc => svc.getPurchaseOrders(),
    defaultGroup: 'supplierName',
    ...SUPPLIER_FILTERS,
    kpis: rows => [
      kpi('Suppliers', distinct(rows, 'supplierName')),
      kpi('Total Spend', money(sum(rows, 'netTotal'))),
      kpi('Orders', rows.length),
      kpi('Avg per Supplier', money(distinct(rows, 'supplierName')
        ? sum(rows, 'netTotal') / distinct(rows, 'supplierName') : 0))
    ],
    chart: { title: 'Spend by Supplier', fn: rows => sumBy(rows, 'supplierName', 'netTotal'), money: true },
    fields: [
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'poNo', label: 'PO No', tab: 'Basic', def: true },
      { key: 'poDate', label: 'PO Date', tab: 'Basic', type: 'date', def: true },
      { key: 'purchaseType', label: 'Type', tab: 'Details', grp: true },
      { key: 'lineCount', label: 'Lines', tab: 'Details', type: 'num', def: true, sum: true },
      { key: 'orderedQty', label: 'Ordered Qty', tab: 'Details', type: 'num', sum: true },
      { key: 'receivedPct', label: 'Received %', tab: 'Details', type: 'pct', def: true },
      { key: 'currency', label: 'Currency', tab: 'Financial' },
      { key: 'netTotal', label: 'Net Total', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'outstandingValue', label: 'Outstanding Value', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },

  // ==================== Receiving (GRN) ====================
  {
    key: 'PUR_GRN_REGISTER',
    name: 'GRN Register',
    crumb: 'Reports > Receiving',
    functionId: 'purchase-report-grn-register',
    dateField: 'receptionDate',
    fetch: svc => svc.getGrns(),
    ...SUPPLIER_FILTERS,
    kpis: rows => [
      kpi('Total GRNs', rows.length),
      kpi('Open', countWhere(rows, r => r.status === 'Open'), 'warning'),
      kpi('Posted', countWhere(rows, r => r.status === 'Posted'), 'success'),
      kpi('Qty Received', sum(rows, 'receivedQty'))
    ],
    chart: { title: 'GRNs by Supplier', fn: rows => countBy(rows, 'supplierName') },
    fields: [
      { key: 'grnNo', label: 'GRN No', tab: 'Basic', def: true },
      { key: 'receptionDate', label: 'Receipt Date', tab: 'Basic', type: 'date', def: true },
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'poNo', label: 'PO', tab: 'Basic', def: true },
      { key: 'invoiceNo', label: 'Invoice No', tab: 'Basic' },
      { key: 'lineCount', label: 'Lines', tab: 'Details', type: 'num', def: true, sum: true },
      { key: 'orderedQty', label: 'Qty Ordered', tab: 'Details', type: 'num', sum: true },
      { key: 'receivedQty', label: 'Qty Received', tab: 'Details', type: 'num', def: true, sum: true },
      { key: 'pendingQty', label: 'Qty Pending', tab: 'Details', type: 'num', sum: true },
      { key: 'invoicedQty', label: 'Qty Invoiced', tab: 'Details', type: 'num', sum: true },
      { key: 'remainingToInvoice', label: 'To Invoice', tab: 'Details', type: 'num', sum: true },
      { key: 'qcResult', label: 'QC Result', tab: 'Quality', type: 'status', grp: true },
      { key: 'flaggedLines', label: 'Flagged Lines', tab: 'Quality', type: 'num', sum: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },
  {
    key: 'PUR_GRN_QUALITY',
    name: 'Quality Check / Rejections',
    crumb: 'Reports > Receiving',
    functionId: 'purchase-report-grn-quality',
    dateField: 'receptionDate',
    fetch: svc => svc.getGrnExceptions(),
    ...SUPPLIER_FILTERS,
    kpis: rows => [
      kpi('QC Exceptions', rows.length, 'danger'),
      kpi('Failed', countWhere(rows, r => r.qcResult === 'Failed'), 'danger'),
      kpi('Partial', countWhere(rows, r => r.qcResult === 'Partial'), 'warning'),
      kpi('Flagged Lines', sum(rows, 'flaggedLines'), 'warning')
    ],
    chart: { title: 'QC Exceptions by Supplier', fn: rows => countBy(rows, 'supplierName') },
    fields: [
      { key: 'grnNo', label: 'GRN No', tab: 'Basic', def: true },
      { key: 'receptionDate', label: 'Receipt Date', tab: 'Basic', type: 'date', def: true },
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'poNo', label: 'PO', tab: 'Basic', def: true },
      { key: 'lineCount', label: 'Lines', tab: 'Quality', type: 'num', def: true, sum: true },
      { key: 'flaggedLines', label: 'Flagged Lines', tab: 'Quality', type: 'num', def: true, sum: true },
      { key: 'postedLines', label: 'Posted Lines', tab: 'Quality', type: 'num', sum: true },
      { key: 'orderedQty', label: 'Qty Ordered', tab: 'Quality', type: 'num', def: true, sum: true },
      { key: 'receivedQty', label: 'Qty Accepted', tab: 'Quality', type: 'num', def: true, sum: true },
      { key: 'qcResult', label: 'QC Result', tab: 'Quality', type: 'status', def: true, grp: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', grp: true }
    ]
  },
  {
    key: 'PUR_GRN_VARIANCE',
    name: 'PO vs GRN Variance',
    crumb: 'Reports > Receiving',
    functionId: 'purchase-report-grn-variance',
    dateField: 'receptionDate',
    fetch: svc => svc.getGrnVariances(),
    ...SUPPLIER_FILTERS,
    kpis: rows => [
      kpi('Lines with Variance', rows.length, 'warning'),
      kpi('Short Deliveries', countWhere(rows, r => num(r.variance) < 0), 'danger'),
      kpi('Over Deliveries', countWhere(rows, r => num(r.variance) > 0)),
      kpi('Net Variance Qty', sum(rows, 'variance'))
    ],
    chart: { title: 'Variance Count by Supplier', fn: rows => countBy(rows, 'supplierName') },
    fields: [
      { key: 'grnNo', label: 'GRN No', tab: 'Basic', def: true },
      { key: 'receptionDate', label: 'Receipt Date', tab: 'Basic', type: 'date', def: true },
      { key: 'poNo', label: 'PO', tab: 'Basic', def: true },
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'orderedQty', label: 'Ordered', tab: 'Basic', type: 'num', def: true, sum: true },
      { key: 'receivedQty', label: 'Received', tab: 'Basic', type: 'num', def: true, sum: true },
      { key: 'variance', label: 'Variance', tab: 'Basic', type: 'num', def: true, sum: true },
      { key: 'variancePct', label: 'Variance %', tab: 'Basic', type: 'pct', def: true },
      { key: 'pendingQty', label: 'Pending Qty', tab: 'Details', type: 'num', sum: true },
      { key: 'qcResult', label: 'QC Result', tab: 'Quality', type: 'status', grp: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', grp: true }
    ]
  },

  // ==================== Invoices & Debit Notes ====================
  {
    key: 'PUR_PIN_REGISTER',
    name: 'Supplier Invoice Register',
    crumb: 'Reports > Invoices',
    functionId: 'purchase-report-pin-register',
    dateField: 'invoiceDate',
    fetch: svc => svc.getSupplierInvoices(),
    filterKeys: { customer: 'supplierName', category: 'matchStatus', status: 'status' },
    filterLabels: { customer: 'Supplier', category: '3-Way Match', status: 'Status' },
    kpis: rows => [
      kpi('Invoices', rows.length),
      kpi('Total Value', money(sum(rows, 'totalAmount'))),
      kpi('Posted to A/P', countWhere(rows, r => !!r.isPostedToAp), 'success'),
      kpi('Unposted', countWhere(rows, r => !r.isPostedToAp), 'warning')
    ],
    chart: { title: 'Invoice Value by Supplier', fn: rows => sumBy(rows, 'supplierName', 'amount'), money: true },
    fields: [
      { key: 'invoiceNo', label: 'Inv No', tab: 'Basic', def: true },
      { key: 'supplierInvoiceNo', label: 'Sup. Inv No', tab: 'Basic', def: true },
      { key: 'invoiceDate', label: 'Inv Date', tab: 'Basic', type: 'date', def: true },
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'grnNos', label: 'GRN', tab: 'Basic', def: true },
      { key: 'linkType', label: 'Link Type', tab: 'Details', grp: true },
      { key: 'purchaseType', label: 'Type', tab: 'Details', grp: true },
      { key: 'currency', label: 'Currency', tab: 'Financial' },
      { key: 'amount', label: 'Amount', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'tax', label: 'Tax', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'totalAmount', label: 'Total', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'baseAmount', label: 'Base Amount', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'matchStatus', label: '3-Way Match', tab: 'Financial', type: 'status', grp: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },
  {
    key: 'PUR_PIN_MATCH',
    name: '3-Way Match Exceptions',
    crumb: 'Reports > Invoices',
    functionId: 'purchase-report-pin-match',
    dateField: 'invoiceDate',
    fetch: svc => svc.getMatchExceptions(),
    filterKeys: { customer: 'supplierName', category: 'matchStatus', status: 'status' },
    filterLabels: { customer: 'Supplier', category: 'Match Result', status: 'Status' },
    kpis: rows => [
      kpi('Mismatched', rows.length, 'danger'),
      kpi('Value at Risk', money(sum(rows, 'totalAmount')), 'danger'),
      kpi('Suppliers Affected', distinct(rows, 'supplierName'), 'warning'),
      kpi('Already Posted', countWhere(rows, r => !!r.isPostedToAp), 'warning')
    ],
    chart: { title: 'Exceptions by Match Result', fn: rows => countBy(rows, 'matchStatus') },
    fields: [
      { key: 'invoiceNo', label: 'Inv No', tab: 'Basic', def: true },
      { key: 'invoiceDate', label: 'Inv Date', tab: 'Basic', type: 'date', def: true },
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'supplierInvoiceNo', label: 'Sup. Inv No', tab: 'Basic' },
      { key: 'grnNos', label: 'GRN', tab: 'Basic', def: true },
      { key: 'currency', label: 'Currency', tab: 'Financial' },
      { key: 'amount', label: 'Amount', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'totalAmount', label: 'Value at Risk', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'matchStatus', label: 'Match Result', tab: 'Basic', type: 'status', def: true, grp: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },
  {
    key: 'PUR_PIN_PAYABLE',
    name: 'Outstanding Payables',
    crumb: 'Reports > Invoices',
    functionId: 'purchase-report-pin-payable',
    dateField: 'invoiceDate',
    fetch: svc => svc.getOutstandingPayables(),
    filterKeys: { customer: 'supplierName', status: 'status' },
    filterLabels: { customer: 'Supplier', status: 'Status' },
    kpis: rows => [
      kpi('Unpaid Invoices', rows.length, 'warning'),
      kpi('Total Outstanding', money(sum(rows, 'totalAmount')), 'danger'),
      kpi('Suppliers', distinct(rows, 'supplierName')),
      kpi('Awaiting Approval', countWhere(rows, r => r.status === 'Pending Approval'), 'warning')
    ],
    chart: { title: 'Outstanding by Supplier', fn: rows => sumBy(rows, 'supplierName', 'totalAmount'), money: true },
    fields: [
      { key: 'invoiceNo', label: 'Inv No', tab: 'Basic', def: true },
      { key: 'invoiceDate', label: 'Inv Date', tab: 'Basic', type: 'date', def: true },
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'supplierInvoiceNo', label: 'Sup. Inv No', tab: 'Basic' },
      { key: 'grnNos', label: 'GRN', tab: 'Basic' },
      { key: 'purchaseType', label: 'Type', tab: 'Details', grp: true },
      { key: 'currency', label: 'Currency', tab: 'Financial' },
      { key: 'amount', label: 'Amount', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'tax', label: 'Tax', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'totalAmount', label: 'Total Outstanding', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },
  {
    key: 'PUR_DN_REGISTER',
    name: 'Debit Note Register',
    crumb: 'Reports > Debit Notes',
    functionId: 'purchase-report-dn-register',
    dateField: 'noteDate',
    fetch: svc => svc.getDebitNotes(),
    filterKeys: { customer: 'supplierName', category: 'reason', status: 'status' },
    filterLabels: { customer: 'Supplier', category: 'Reason', status: 'Status' },
    kpis: rows => [
      kpi('Debit Notes', rows.length),
      kpi('Total Value', money(sum(rows, 'amount'))),
      kpi('Posted', countWhere(rows, r => r.status === 'Posted'), 'success'),
      kpi('Draft', countWhere(rows, r => r.status === 'Draft'), 'warning')
    ],
    chart: { title: 'Debit Notes by Reason', fn: rows => countBy(rows, 'reason') },
    fields: [
      { key: 'debitNoteNo', label: 'DN No', tab: 'Basic', def: true },
      { key: 'noteDate', label: 'Note Date', tab: 'Basic', type: 'date', def: true },
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'referenceNo', label: 'Reference', tab: 'Basic', def: true },
      { key: 'reason', label: 'Reason', tab: 'Basic', def: true, grp: true },
      { key: 'currency', label: 'Currency', tab: 'Financial' },
      { key: 'amount', label: 'Amount', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'amountBase', label: 'Base Amount', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },

  // ==================== Supplier & Spend Analysis ====================
  {
    key: 'PUR_ANA_SPEND',
    name: 'Monthly Spend Trend',
    crumb: 'Reports > Spend Analysis',
    functionId: 'purchase-report-spend-trend',
    dateField: 'periodDate',
    fetch: svc => svc.getMonthlySpend(),
    kpis: rows => [
      kpi('Periods', rows.length),
      kpi('Total Spend', money(sum(rows, 'netTotal'))),
      kpi('Avg / Period', money(rows.length ? sum(rows, 'netTotal') / rows.length : 0)),
      kpi('Outstanding', money(sum(rows, 'outstandingValue')), 'warning')
    ],
    chart: {
      title: 'PO Value by Period',
      fn: rows => rows.reduce((acc: Record<string, number>, r) => {
        acc[String(r.period)] = num(r.netTotal);
        return acc;
      }, {}),
      money: true
    },
    fields: [
      { key: 'period', label: 'Period', tab: 'Basic', def: true, grp: true },
      { key: 'orders', label: 'Orders', tab: 'Basic', type: 'num', def: true, sum: true },
      { key: 'netTotal', label: 'PO Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'tax', label: 'Tax', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'receivedValue', label: 'Received Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'outstandingValue', label: 'Outstanding Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true }
    ]
  },
  {
    key: 'PUR_ANA_SCORECARD',
    name: 'Supplier Scorecard',
    crumb: 'Reports > Supplier Analysis',
    functionId: 'purchase-report-scorecard',
    // Aggregate rows carry no document date; the API scores a rolling 12 months.
    dateField: '',
    fetch: svc => svc.getSupplierScorecard(),
    filterKeys: { customer: 'supplierName', category: 'rating' },
    filterLabels: { customer: 'Supplier', category: 'Rating' },
    kpis: rows => [
      kpi('Suppliers', rows.length),
      kpi('Avg Score', rows.length ? Math.round(sum(rows, 'overallScore') / rows.length) : 0),
      kpi('Top Rated (A)', countWhere(rows, r => r.rating === 'A'), 'success'),
      kpi('Needs Review (C/D)', countWhere(rows, r => r.rating === 'C' || r.rating === 'D'), 'danger')
    ],
    chart: {
      title: 'Score by Supplier',
      fn: rows => rows.reduce((acc: Record<string, number>, r) => {
        acc[String(r.supplierName)] = num(r.overallScore);
        return acc;
      }, {})
    },
    fields: [
      { key: 'supplierName', label: 'Supplier', tab: 'Basic', def: true, grp: true },
      { key: 'supplierCode', label: 'Code', tab: 'Basic' },
      { key: 'purchaseType', label: 'Type', tab: 'Basic', grp: true },
      { key: 'poCount', label: 'POs', tab: 'Basic', type: 'num', def: true, sum: true },
      { key: 'grnCount', label: 'GRNs', tab: 'Basic', type: 'num', sum: true },
      { key: 'orderedQty', label: 'Ordered Qty', tab: 'Performance', type: 'num', sum: true },
      { key: 'receivedQty', label: 'Received Qty', tab: 'Performance', type: 'num', sum: true },
      { key: 'fulfillmentPct', label: 'Fulfillment %', tab: 'Performance', type: 'pct', def: true },
      { key: 'paymentPct', label: 'Payment %', tab: 'Performance', type: 'pct', def: true },
      { key: 'overallScore', label: 'Score', tab: 'Performance', type: 'num', def: true },
      { key: 'rating', label: 'Rating', tab: 'Performance', type: 'status', def: true, grp: true },
      { key: 'poValueBase', label: 'PO Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'invoiceValueBase', label: 'Invoiced', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'paidValueBase', label: 'Paid', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'outstandingValueBase', label: 'Outstanding', tab: 'Financial', type: 'money', def: true, sum: true, sens: true }
    ]
  },
  {
    key: 'PUR_ANA_CYCLE',
    name: 'Procure-to-Pay Cycle',
    crumb: 'Reports > Spend Analysis',
    functionId: 'purchase-report-p2p-cycle',
    // Stage counts span the whole dataset, so a date range does not apply.
    dateField: '',
    fetch: svc => svc.getProcureToPayCycle(),
    kpis: rows => {
      const at = (i: number) => num(rows[i]?.documents);
      return [
        kpi('PR to PO', pct(at(1), at(0))),
        kpi('PO to GRN', pct(at(2), at(1))),
        kpi('GRN to Invoice', pct(at(3), at(2))),
        kpi('Debit Notes Raised', at(4), at(4) ? 'warning' : 'default')
      ];
    },
    chart: {
      title: 'Documents per Stage',
      fn: rows => rows.reduce((acc: Record<string, number>, r) => {
        // Drop the "1. " ordering prefix so the bar labels stay readable.
        acc[String(r.stage).replace(/^\d+\.\s*/, '')] = num(r.documents);
        return acc;
      }, {})
    },
    fields: [
      { key: 'stage', label: 'Stage', tab: 'Basic', def: true },
      { key: 'documents', label: 'Documents', tab: 'Basic', type: 'num', def: true, sum: true },
      { key: 'conversionPct', label: 'Conversion %', tab: 'Basic', type: 'pct', def: true },
      { key: 'note', label: 'Notes', tab: 'Basic', def: true }
    ]
  }
];

export const PURCHASE_REPORT_BY_KEY: Record<string, ReportDef> =
  PURCHASE_REPORTS.reduce((acc, r) => { acc[r.key] = r; return acc; }, {} as Record<string, ReportDef>);
