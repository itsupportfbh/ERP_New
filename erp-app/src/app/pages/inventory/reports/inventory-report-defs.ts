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

const money = (v: number): string =>
  num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
 * Inventory report metadata for the shared <erp-dynamic-report> renderer.
 * Keys are the camelCase form of the DTO properties InventoryReportController
 * returns — the field lists here and the `allowedFields` arrays on that
 * controller must be kept in step, since the server's list is what actually
 * decides whether a cost or value column may be shown.
 *
 * The renderer's five filter slots are remapped per report: warehouse takes the
 * branch slot everywhere, and the remaining slots pick up whichever dimension
 * that particular report is usually sliced by (movement type, reason, action,
 * supplier). A slot whose column is absent yields no values and hides itself.
 */

/** Most inventory reports slice by warehouse / category / status. */
const STOCK_FILTERS = {
  filterKeys: { branch: 'warehouse', category: 'category', status: 'status' },
  filterLabels: { branch: 'Warehouse', category: 'Category', status: 'Status' }
};

export const INVENTORY_REPORTS: ReportDef[] = [
  // ==================== Stock Position ====================
  {
    key: 'INV_STOCK_SUMMARY',
    name: 'Stock Summary',
    crumb: 'Reports > Stock Position',
    functionId: 'inventory-report-stock-summary',
    dateField: '',
    fetch: svc => svc.getStockSummary(),
    ...STOCK_FILTERS,
    kpis: rows => [
      kpi('Total Items', rows.length),
      kpi('In Stock', countWhere(rows, r => r.status === 'In Stock'), 'success'),
      kpi('Low Stock', countWhere(rows, r => r.status === 'Low Stock'), 'warning'),
      kpi('Zero Stock', countWhere(rows, r => r.status === 'Zero Stock'), 'danger'),
      kpi('Stock Value', money(sum(rows, 'stockValue')))
    ],
    chart: { title: 'Stock Value by Category', fn: rows => sumBy(rows, 'category', 'stockValue'), money: true },
    fields: [
      { key: 'sku', label: 'SKU', tab: 'Basic', def: true },
      { key: 'itemName', label: 'Item Name', tab: 'Basic', def: true },
      { key: 'category', label: 'Category', tab: 'Basic', def: true, grp: true },
      { key: 'warehouse', label: 'Warehouse', tab: 'Logistics', def: true, grp: true },
      { key: 'bin', label: 'Bin', tab: 'Logistics' },
      { key: 'uom', label: 'UOM', tab: 'Basic', def: true },
      { key: 'onHand', label: 'On Hand', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'reserved', label: 'Reserved', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'available', label: 'Available', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'minQty', label: 'Min Level', tab: 'Quantities', type: 'num' },
      { key: 'maxQty', label: 'Max Level', tab: 'Quantities', type: 'num' },
      { key: 'avgCost', label: 'Avg Cost', tab: 'Financial', type: 'money', sens: true },
      { key: 'stockValue', label: 'Stock Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true },
      { key: 'lastCounted', label: 'Last Counted', tab: 'Logistics', type: 'date' }
    ]
  },
  {
    key: 'INV_VALUATION',
    name: 'Valuation by Category',
    crumb: 'Reports > Stock Position',
    functionId: 'inventory-report-valuation',
    dateField: '',
    fetch: svc => svc.getValuationByCategory(),
    filterKeys: { category: 'category' },
    filterLabels: { category: 'Category' },
    kpis: rows => [
      kpi('Categories', rows.length),
      kpi('Total Units', sum(rows, 'totalQty')),
      kpi('Distinct Items', sum(rows, 'items')),
      kpi('Total Value', money(sum(rows, 'stockValue')), 'success')
    ],
    chart: { title: 'Stock Value by Category', fn: rows => sumBy(rows, 'category', 'stockValue'), money: true },
    fields: [
      { key: 'category', label: 'Category', tab: 'Basic', def: true, grp: true },
      { key: 'items', label: 'Items', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'totalQty', label: 'Total Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'stockValue', label: 'Stock Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'pctOfValue', label: '% of Value', tab: 'Financial', type: 'pct', def: true, sens: true }
    ]
  },

  // ==================== Movements ====================
  {
    key: 'INV_MOVEMENT',
    name: 'Stock Movement',
    crumb: 'Reports > Movements',
    functionId: 'inventory-report-movement',
    dateField: 'movementDate',
    fetch: svc => svc.getStockMovement(),
    filterKeys: { branch: 'warehouse', category: 'category', status: 'sourceType', salesperson: 'postedBy' },
    filterLabels: { branch: 'Warehouse', category: 'Category', status: 'Movement Type', salesperson: 'Posted By' },
    kpis: rows => [
      kpi('Transactions', rows.length),
      kpi('Qty In', sum(rows, 'inQty'), 'success'),
      kpi('Qty Out', sum(rows, 'outQty'), 'danger'),
      kpi('Net Movement', sum(rows, 'netQty')),
      kpi('Movement Value', money(sum(rows, 'movementValue')))
    ],
    chart: { title: 'Transactions by Movement Type', fn: rows => countBy(rows, 'sourceType') },
    fields: [
      { key: 'movementDate', label: 'Date', tab: 'Basic', type: 'date', def: true },
      { key: 'sourceType', label: 'Movement Type', tab: 'Basic', type: 'status', def: true, grp: true },
      { key: 'sourceNo', label: 'Reference', tab: 'Basic', def: true },
      { key: 'sku', label: 'SKU', tab: 'Basic', def: true },
      { key: 'itemName', label: 'Item Name', tab: 'Basic', def: true },
      { key: 'category', label: 'Category', tab: 'Basic', grp: true },
      { key: 'warehouse', label: 'Warehouse', tab: 'Logistics', def: true, grp: true },
      { key: 'bin', label: 'Bin', tab: 'Logistics' },
      { key: 'inQty', label: 'Qty In', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'outQty', label: 'Qty Out', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'netQty', label: 'Net Qty', tab: 'Quantities', type: 'num', sum: true },
      { key: 'balance', label: 'Balance', tab: 'Quantities', type: 'num', def: true },
      { key: 'unitCost', label: 'Unit Cost', tab: 'Financial', type: 'money', sens: true },
      { key: 'movementValue', label: 'Movement Value', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'remarks', label: 'Remarks', tab: 'Details' },
      { key: 'postedBy', label: 'Posted By', tab: 'Details', def: true, grp: true }
    ]
  },
  {
    key: 'INV_ADJUSTMENTS',
    name: 'Stock Adjustments',
    crumb: 'Reports > Movements',
    functionId: 'inventory-report-adjustments',
    dateField: 'txnDate',
    fetch: svc => svc.getStockAdjustments(),
    filterKeys: {
      branch: 'warehouse', category: 'category', status: 'sourceType',
      customer: 'reason', salesperson: 'adjustedBy'
    },
    filterLabels: {
      branch: 'Warehouse', category: 'Category', status: 'Source',
      customer: 'Reason', salesperson: 'Adjusted By'
    },
    kpis: rows => [
      kpi('Adjustments', rows.length),
      kpi('Qty Increased', sum(rows, 'qtyIn'), 'success'),
      kpi('Qty Reduced', sum(rows, 'qtyOut'), 'danger'),
      kpi('Net Qty', sum(rows, 'qty')),
      kpi('Value Impact', money(sum(rows, 'valueImpact')), 'warning')
    ],
    chart: { title: 'Adjustments by Reason', fn: rows => countBy(rows, 'reason') },
    fields: [
      { key: 'txnDate', label: 'Date', tab: 'Basic', type: 'date', def: true },
      { key: 'adjustmentNo', label: 'Adjustment No', tab: 'Basic', def: true },
      { key: 'sourceType', label: 'Source', tab: 'Basic', type: 'status', grp: true },
      { key: 'sku', label: 'SKU', tab: 'Basic', def: true },
      { key: 'itemName', label: 'Item Name', tab: 'Basic', def: true },
      { key: 'category', label: 'Category', tab: 'Basic', grp: true },
      { key: 'warehouse', label: 'Warehouse', tab: 'Logistics', def: true, grp: true },
      { key: 'bin', label: 'Bin', tab: 'Logistics', def: true },
      { key: 'qtyBefore', label: 'Qty Before', tab: 'Quantities', type: 'num' },
      { key: 'qtyIn', label: 'Qty In', tab: 'Quantities', type: 'num', sum: true },
      { key: 'qtyOut', label: 'Qty Out', tab: 'Quantities', type: 'num', sum: true },
      { key: 'qty', label: 'Net Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'qtyAfter', label: 'Qty After', tab: 'Quantities', type: 'num', def: true },
      { key: 'unitCost', label: 'Unit Cost', tab: 'Financial', type: 'money', def: true, sens: true },
      { key: 'valueImpact', label: 'Value Impact', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'reason', label: 'Reason', tab: 'Basic', def: true, grp: true },
      { key: 'remarks', label: 'Remarks', tab: 'Details' },
      { key: 'adjustedBy', label: 'Adjusted By', tab: 'Details', grp: true }
    ]
  },
  {
    key: 'INV_TRANSFERS',
    name: 'Transfers & Requisitions',
    crumb: 'Reports > Movements',
    functionId: 'inventory-report-transfers',
    dateField: 'transferDate',
    fetch: svc => svc.getTransfers(),
    filterKeys: {
      branch: 'fromWarehouse', customer: 'toWarehouse',
      status: 'status', salesperson: 'requester'
    },
    filterLabels: {
      branch: 'From Warehouse', customer: 'To Warehouse',
      status: 'Status', salesperson: 'Requester'
    },
    kpis: rows => [
      kpi('Requests', rows.length),
      kpi('Received', countWhere(rows, r => r.status === 'Received'), 'success'),
      kpi('In Transit', countWhere(rows, r => r.status === 'In Transit')),
      kpi('Pending Approval', countWhere(rows, r => r.status === 'Pending Approval'), 'warning'),
      kpi('Qty Transferred', sum(rows, 'transferQty'))
    ],
    chart: { title: 'Transfers by Status', fn: rows => countBy(rows, 'status') },
    fields: [
      { key: 'transferNo', label: 'Transfer No', tab: 'Basic', def: true },
      { key: 'transferDate', label: 'Date', tab: 'Basic', type: 'date', def: true },
      { key: 'reqNo', label: 'Requisition No', tab: 'Basic', def: true },
      { key: 'fromWarehouse', label: 'From Warehouse', tab: 'Logistics', def: true, grp: true },
      { key: 'toWarehouse', label: 'To Warehouse', tab: 'Logistics', def: true, grp: true },
      { key: 'sku', label: 'SKU', tab: 'Basic', def: true },
      { key: 'itemName', label: 'Item Name', tab: 'Basic', def: true },
      { key: 'requestQty', label: 'Requested Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'transferQty', label: 'Transferred Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true },
      { key: 'requester', label: 'Requester', tab: 'Details', def: true, grp: true },
      { key: 'remarks', label: 'Remarks', tab: 'Details' }
    ]
  },

  // ==================== Counts & Planning ====================
  {
    key: 'INV_VARIANCE',
    name: 'Stock Take Variance',
    crumb: 'Reports > Counts & Planning',
    functionId: 'inventory-report-variance',
    dateField: 'stockTakeDate',
    fetch: svc => svc.getStockTakeVariance(),
    filterKeys: {
      branch: 'warehouse', status: 'status',
      customer: 'reason', salesperson: 'countedBy'
    },
    filterLabels: {
      branch: 'Warehouse', status: 'Status',
      customer: 'Reason', salesperson: 'Counted By'
    },
    kpis: rows => [
      kpi('Lines Counted', rows.length),
      kpi('Shortages', countWhere(rows, r => num(r.varianceQty) < 0), 'danger'),
      kpi('Overages', countWhere(rows, r => num(r.varianceQty) > 0), 'warning'),
      kpi('Stock Takes', distinct(rows, 'stockTakeNo')),
      kpi('Net Variance', money(sum(rows, 'varianceValue')),
        sum(rows, 'varianceValue') < 0 ? 'danger' : 'success')
    ],
    chart: { title: 'Variance Value by Reason', fn: rows => sumBy(rows, 'reason', 'varianceValue'), money: true },
    fields: [
      { key: 'stockTakeDate', label: 'Date', tab: 'Basic', type: 'date', def: true },
      { key: 'stockTakeNo', label: 'Stock Take No', tab: 'Basic', def: true, grp: true },
      { key: 'warehouse', label: 'Warehouse', tab: 'Logistics', def: true, grp: true },
      { key: 'sku', label: 'SKU', tab: 'Basic', def: true },
      { key: 'itemName', label: 'Item Name', tab: 'Basic', def: true },
      { key: 'uom', label: 'UOM', tab: 'Basic', def: true },
      { key: 'systemQty', label: 'System Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'countedQty', label: 'Counted Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'badCountedQty', label: 'Damaged Qty', tab: 'Quantities', type: 'num', sum: true },
      { key: 'varianceQty', label: 'Variance Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'unitCost', label: 'Unit Cost', tab: 'Financial', type: 'money', sens: true },
      { key: 'varianceValue', label: 'Variance Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'reason', label: 'Reason', tab: 'Basic', def: true, grp: true },
      { key: 'countedBy', label: 'Counted By', tab: 'Details', grp: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },
  {
    key: 'INV_REORDER',
    name: 'Reorder / Low Stock',
    crumb: 'Reports > Counts & Planning',
    functionId: 'inventory-report-reorder',
    dateField: '',
    fetch: svc => svc.getReorder(),
    filterKeys: {
      branch: 'warehouse', category: 'category',
      status: 'action', customer: 'supplier'
    },
    filterLabels: {
      branch: 'Warehouse', category: 'Category',
      status: 'Action', customer: 'Preferred Supplier'
    },
    kpis: rows => [
      kpi('Items Tracked', rows.length),
      kpi('Reorder Now', countWhere(rows, r => r.action === 'Reorder Now'), 'warning'),
      kpi('Urgent / Stocked Out', countWhere(rows, r => r.action === 'Urgent'), 'danger'),
      kpi('Suggested Qty', sum(rows, 'suggestedQty')),
      kpi('Suggested Value', money(sum(rows, 'suggestedValue')))
    ],
    chart: { title: 'Suggested Order Qty by Warehouse', fn: rows => sumBy(rows, 'warehouse', 'suggestedQty') },
    fields: [
      { key: 'sku', label: 'SKU', tab: 'Basic', def: true },
      { key: 'itemName', label: 'Item Name', tab: 'Basic', def: true },
      { key: 'category', label: 'Category', tab: 'Basic', grp: true },
      { key: 'warehouse', label: 'Warehouse', tab: 'Logistics', def: true, grp: true },
      { key: 'uom', label: 'UOM', tab: 'Basic' },
      { key: 'onHand', label: 'On Hand', tab: 'Quantities', type: 'num' },
      { key: 'available', label: 'Available', tab: 'Quantities', type: 'num', def: true },
      { key: 'minQty', label: 'Min Level', tab: 'Quantities', type: 'num', def: true },
      { key: 'maxQty', label: 'Max Level', tab: 'Quantities', type: 'num', def: true },
      { key: 'reorderQty', label: 'Reorder Qty', tab: 'Quantities', type: 'num' },
      { key: 'leadTimeDays', label: 'Lead Time (Days)', tab: 'Logistics', type: 'num', def: true },
      { key: 'suggestedQty', label: 'Suggested Order Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'unitCost', label: 'Unit Cost', tab: 'Financial', type: 'money', sens: true },
      { key: 'suggestedValue', label: 'Suggested Value', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'supplier', label: 'Preferred Supplier', tab: 'Logistics', def: true, grp: true },
      { key: 'action', label: 'Action', tab: 'Basic', type: 'status', def: true, grp: true }
    ]
  },

  // ==================== Costing ====================
  {
    key: 'INV_COGS',
    name: 'COGS / Consumption',
    crumb: 'Reports > Costing',
    functionId: 'inventory-report-cogs',
    dateField: 'periodEnd',
    fetch: svc => svc.getCogs(),
    kpis: rows => [
      kpi('Items', rows.length),
      kpi('Consumed Qty', sum(rows, 'issueBaseQty')),
      kpi('Opening Stock', money(sum(rows, 'openingValue'))),
      kpi('Closing Stock', money(sum(rows, 'closingValue'))),
      kpi('COGS', money(sum(rows, 'cogsValue')), 'danger')
    ],
    chart: { title: 'COGS by Item', fn: rows => sumBy(rows, 'itemName', 'cogsValue'), money: true },
    fields: [
      { key: 'itemCode', label: 'SKU', tab: 'Basic', def: true },
      { key: 'itemName', label: 'Item Name', tab: 'Basic', def: true },
      { key: 'baseUomName', label: 'Base UOM', tab: 'Basic', def: true },
      { key: 'purchaseUomName', label: 'Purchase UOM', tab: 'Basic' },
      { key: 'periodEnd', label: 'Period End', tab: 'Basic', type: 'date' },
      { key: 'openingBaseQty', label: 'Opening Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'purchaseBaseQty', label: 'Purchased Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'issueBaseQty', label: 'Consumed Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'closingBaseQty', label: 'Closing Qty', tab: 'Quantities', type: 'num', def: true, sum: true },
      { key: 'avgCost', label: 'Avg Cost', tab: 'Financial', type: 'money', def: true, sens: true },
      { key: 'openingValue', label: 'Opening Value', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'purchaseValue', label: 'Purchase Value', tab: 'Financial', type: 'money', sum: true, sens: true },
      { key: 'closingValue', label: 'Closing Value', tab: 'Financial', type: 'money', def: true, sum: true, sens: true },
      { key: 'cogsValue', label: 'COGS', tab: 'Financial', type: 'money', def: true, sum: true, sens: true }
    ]
  }
];
