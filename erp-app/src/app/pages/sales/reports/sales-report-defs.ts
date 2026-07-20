/**
 * Sales report metadata driving the shared <erp-dynamic-report> renderer.
 * Keys must match the camelCase property names the API returns
 * (SalesReportDTO / SalesMarginReportViewInfo / DeliveryNoteReportViewInfo).
 *
 * The types now live in shared/reports so the purchase reports can reuse the
 * same renderer; re-exported here for the existing sales imports.
 */
import { ReportDef } from '../../../shared/reports/report-def';

export type { ReportDef, ReportFieldDef, ReportFieldType } from '../../../shared/reports/report-def';

const startOfDay = (value: any): number => {
  const d = value ? new Date(value) : new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Delivery rows carry no status column; derive it the same way the old component did. */
function deriveDelivery(row: any): any {
  const plannedDate = row.deliveryDate ?? row.plannedDate ?? null;
  const posted = row.isPosted === true || Number(row.isPosted ?? 0) === 1;
  const orderedQty = Number(row.totalQty ?? 0);
  const deliveredQty = posted ? orderedQty : Number(row.deliveryQty ?? 0);

  const raw = String(row.status ?? '').toUpperCase();
  let status: string;
  if (['PLANNED', 'IN TRANSIT', 'DELIVERED', 'DELAYED', 'CANCELLED'].includes(raw)) {
    status = raw;
  } else if (posted) {
    status = 'DELIVERED';
  } else {
    status = startOfDay(plannedDate) < startOfDay(new Date()) ? 'DELAYED' : 'PLANNED';
  }

  const actualDate = posted ? (row.actualDate ?? plannedDate) : null;
  const basis = actualDate ? startOfDay(actualDate) : startOfDay(new Date());
  const delayDays = Math.max(Math.floor((basis - startOfDay(plannedDate)) / 86400000), 0);

  return {
    ...row,
    plannedDate,
    actualDate,
    status,
    delayDays,
    branch: row.branch ?? row.routeName ?? '',
    driver: row.driverName ?? row.driver ?? '',
    vehicle: row.vehicleNo ?? row.vehicle ?? '',
    deliveredPct: orderedQty ? Math.min(100, Math.max(0, (deliveredQty / orderedQty) * 100)) : 0
  };
}

export const SALES_REPORTS: ReportDef[] = [
  {
    key: 'SALES_BY_ITEM',
    name: 'Sales By Item',
    crumb: 'Reports > Sales',
    functionId: 'sales-report-by-item',
    dateField: 'createdDate',
    fetch: svc => svc.getSalesByItem(),
    fields: [
      { key: 'sku', label: 'SKU', tab: 'Basic', def: true },
      { key: 'itemName', label: 'Item Name', tab: 'Basic', def: true },
      { key: 'category', label: 'Category', tab: 'Basic', def: true, grp: true },
      { key: 'uom', label: 'UOM', tab: 'Basic', def: true },
      { key: 'createdDate', label: 'Date', tab: 'Basic', type: 'date', def: true },
      { key: 'quantity', label: 'Quantity Sold', tab: 'Basic', type: 'num', def: true, sum: true },
      { key: 'salesPerson', label: 'Sales Person', tab: 'Basic', grp: true },
      { key: 'branch', label: 'Branch', tab: 'Basic', grp: true },
      { key: 'location', label: 'Customer Address', tab: 'Basic' },
      { key: 'unitPrice', label: 'Unit Price', tab: 'Financial', type: 'money' },
      { key: 'grossSales', label: 'Gross Sales', tab: 'Financial', type: 'money', def: true, sum: true },
      { key: 'discount', label: 'Discount %', tab: 'Financial', type: 'pct', def: true },
      { key: 'netSales', label: 'Net Sales', tab: 'Financial', type: 'money', sum: true },
      { key: 'gstPct', label: 'GST %', tab: 'Financial', type: 'pct' },
      { key: 'taxAmount', label: 'Tax Amount', tab: 'Financial', type: 'money', sum: true },
      { key: 'purchaseCost', label: 'Purchase Cost', tab: 'Financial', type: 'money', sens: true, sum: true },
      { key: 'totalPurchaseCost', label: 'Total Cost', tab: 'Financial', type: 'money', sens: true, sum: true },
      { key: 'totalSalesValue', label: 'Total Sales Value', tab: 'Financial', type: 'money', sum: true },
      { key: 'marginPct', label: 'Margin %', tab: 'Financial', type: 'pct', sens: true }
    ]
  },
  {
    key: 'AVG_MARGIN',
    name: 'Average Margin',
    crumb: 'Reports > Profitability',
    functionId: 'sales-report-average-margin',
    dateField: 'salesInvoiceDate',
    fetch: svc => svc.getSalesMargin(),
    fields: [
      { key: 'salesInvoiceNo', label: 'Invoice No', tab: 'Basic', def: true },
      { key: 'salesInvoiceDate', label: 'Invoice Date', tab: 'Basic', type: 'date', def: true },
      { key: 'customerName', label: 'Customer', tab: 'Basic', def: true, grp: true },
      { key: 'itemName', label: 'Item', tab: 'Basic', def: true },
      { key: 'category', label: 'Category', tab: 'Basic', grp: true },
      { key: 'qty', label: 'Qty', tab: 'Basic', type: 'num', def: true, sum: true },
      { key: 'salesPerson', label: 'Sales Person', tab: 'Basic', grp: true },
      { key: 'branch', label: 'Branch', tab: 'Basic', grp: true },
      { key: 'location', label: 'Customer Address', tab: 'Basic' },
      { key: 'lineGrossSales', label: 'Gross Sales', tab: 'Financial', type: 'money', sum: true },
      { key: 'netSales', label: 'Net Sales', tab: 'Financial', type: 'money', def: true, sum: true },
      { key: 'gstPct', label: 'GST %', tab: 'Financial', type: 'pct' },
      { key: 'taxAmount', label: 'Tax Amount', tab: 'Financial', type: 'money', sum: true },
      { key: 'purchaseCostPerUnit', label: 'Unit Cost', tab: 'Financial', type: 'money', sens: true },
      { key: 'costOfSales', label: 'Cost of Sales', tab: 'Financial', type: 'money', sens: true, def: true, sum: true },
      { key: 'marginAmount', label: 'Margin Value', tab: 'Financial', type: 'money', sens: true, def: true, sum: true },
      { key: 'marginPct', label: 'Margin %', tab: 'Financial', type: 'pct', sens: true, def: true }
    ]
  },
  {
    key: 'DELIVERIES',
    name: 'Deliveries',
    crumb: 'Reports > Logistics',
    functionId: 'sales-report-deliveries',
    dateField: 'plannedDate',
    fetch: svc => svc.getDeliveryNoteReport(),
    derive: deriveDelivery,
    fields: [
      { key: 'doNumber', label: 'DO No', tab: 'Basic', def: true },
      { key: 'customerName', label: 'Customer', tab: 'Basic', def: true, grp: true },
      { key: 'branch', label: 'Branch', tab: 'Basic', def: true, grp: true },
      { key: 'plannedDate', label: 'Planned Delivery', tab: 'Basic', type: 'date', def: true },
      { key: 'actualDate', label: 'Actual Delivery', tab: 'Basic', type: 'date', def: true },
      { key: 'delayDays', label: 'Delay (Days)', tab: 'Basic', type: 'num', def: true },
      { key: 'status', label: 'Status', tab: 'Basic', type: 'status', def: true, grp: true },
      { key: 'salesOrderNo', label: 'SO No', tab: 'Basic' },
      { key: 'totalQty', label: 'Qty', tab: 'Basic', type: 'num', sum: true },
      { key: 'deliveredPct', label: 'Delivery Qty %', tab: 'Logistics', type: 'pct', def: true },
      { key: 'driver', label: 'Driver', tab: 'Logistics', def: true, grp: true },
      { key: 'vehicle', label: 'Vehicle', tab: 'Logistics', def: true },
      { key: 'routeName', label: 'Route', tab: 'Logistics' },
      { key: 'receivedPersonName', label: 'Received By', tab: 'Logistics' }
    ]
  },
  {
    key: 'DELIVERY_NOTE',
    name: 'Delivery Note Summary',
    crumb: 'Reports > Summary',
    functionId: 'sales-report-delivery-note',
    dateField: 'deliveryDate',
    fetch: svc => svc.getDeliveryNoteReport(),
    fields: [
      { key: 'doNumber', label: 'Delivery No', tab: 'Basic', def: true },
      { key: 'deliveryDate', label: 'Date', tab: 'Basic', type: 'date', def: true },
      { key: 'customerName', label: 'Customer', tab: 'Basic', def: true, grp: true },
      { key: 'totalQty', label: 'Qty', tab: 'Basic', type: 'num', def: true, sum: true },
      { key: 'salesOrderNo', label: 'SO No', tab: 'Basic', def: true },
      { key: 'branch', label: 'Branch', tab: 'Basic', grp: true },
      { key: 'routeName', label: 'Route', tab: 'Logistics', def: true, grp: true },
      { key: 'receivedPersonName', label: 'Received By', tab: 'Logistics' },
      { key: 'receivedPersonMobileNo', label: 'Received Contact', tab: 'Logistics' },
      { key: 'driverMobileNo', label: 'Driver Contact', tab: 'Logistics' },
      { key: 'podFileUrl', label: 'POD File', tab: 'Logistics' }
    ]
  }
];

export const REPORT_BY_KEY: Record<string, ReportDef> =
  SALES_REPORTS.reduce((acc, r) => { acc[r.key] = r; return acc; }, {} as Record<string, ReportDef>);
