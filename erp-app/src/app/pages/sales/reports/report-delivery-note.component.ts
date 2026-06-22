import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ReportsService } from './reports.service';
import { SalesService } from '../sales.service';

type DoRow = {
  id: number;
  doNumber: string;

  soId: number | null;
  salesOrderNo: string;

  packId: number | null;

  driverId: number | null;
  driverMobileNo?: string | null;

  receivedPersonName?: string | null;
  receivedPersonMobileNo?: string | null;

  vehicleId: number | null;
  routeName: string | null;

  deliveryDate: string | Date | null;
  isPosted: boolean | number;

  customerName?: string | null;
  totalQty?: number | null;
};

type ColKey =
  | 'doNumber'
  | 'deliveryDate'
  | 'customer'
  | 'qty'
  | 'soNo'
  | 'driver'
  | 'driverContact'
  | 'receivedPerson'
  | 'receivedContact'
  | 'vehicle'
  | 'location'
  | 'posted';

type ColumnDef = {
  key: ColKey;
  label: string;
  checked: boolean;
  width?: number;
  tags?: string;
  group: 'basic' | 'logistics';
  groupLabel?: string;
};

type NumSummaryCol = { key: ColKey; label: string };

type SummaryGroup = {
  group: string;
  docs: number;
  sums: Record<string, number>;
};

@Component({
  selector: 'erp-report-delivery-note',
  templateUrl: './report-delivery-note.component.html',
  styleUrls: ['./report-delivery-note.component.scss'],
  standalone: false
})
export class ReportDeliveryNoteComponent implements OnInit {

  title = 'Delivery Note Summary';

  rows: DoRow[] = [];
  allRows: DoRow[] = [];
  selectedOption = 10;
  searchValue = '';

  listLoaded = false;
  loading = false;
  mustPickColumns = true;

  driverMap = new Map<number, string>();
  vehicleMap = new Map<number, string>();

  // simple inline message (replaces sweetalert2)
  message = '';

  showHeaderModal = false;
  headerSearch = '';
  private columnsSnapshot: ColumnDef[] = [];

  activeTab: 'basic' | 'logistics' | 'all' = 'basic';

  columns: ColumnDef[] = [
    // BASIC
    { key: 'doNumber',     label: 'Delivery No', checked: true,  width: 160, tags: 'do delivery number', group: 'basic', groupLabel: 'Basic' },
    { key: 'deliveryDate', label: 'Date',        checked: true,  width: 170, tags: 'date delivery date', group: 'basic', groupLabel: 'Basic' },
    { key: 'customer',     label: 'Customer',    checked: true,  width: 220, tags: 'customer name', group: 'basic', groupLabel: 'Basic' },
    { key: 'qty',          label: 'Qty',         checked: true,  width: 120, tags: 'qty total quantity', group: 'basic', groupLabel: 'Basic' },
    { key: 'soNo',         label: 'SO No',       checked: false, width: 160, tags: 'so sales order', group: 'basic', groupLabel: 'Basic' },

    // LOGISTICS
    { key: 'driver',          label: 'Driver',          checked: false, width: 180, tags: 'driver', group: 'logistics', groupLabel: 'Logistics' },
    { key: 'driverContact',   label: 'Driver Contact',  checked: false, width: 170, tags: 'driver contact mobile', group: 'logistics', groupLabel: 'Logistics' },
    { key: 'receivedPerson',  label: 'Received Person', checked: false, width: 200, tags: 'received person', group: 'logistics', groupLabel: 'Logistics' },
    { key: 'receivedContact', label: 'Received Contact', checked: false, width: 170, tags: 'received contact', group: 'logistics', groupLabel: 'Logistics' },
    { key: 'vehicle',         label: 'Vehicle',         checked: false, width: 160, tags: 'vehicle', group: 'logistics', groupLabel: 'Logistics' },
    { key: 'location',        label: 'Location',        checked: false, width: 200, tags: 'route location', group: 'logistics', groupLabel: 'Logistics' },
    { key: 'posted',          label: 'Posted',          checked: false, width: 120, tags: 'posted', group: 'logistics', groupLabel: 'Logistics' },
  ];

  selectedRowIds = new Set<number>();

  summaryVisible = false;
  summaryGroups: SummaryGroup[] = [];
  summaryNumericCols: NumSummaryCol[] = [];
  summaryDetailRows: DoRow[] = [];
  summarySelectedHeaders: string[] = [];

  summaryMeta = {
    createdAt: new Date(),
    selectedDocs: 0,
    groupByKey: 'customer' as ColKey,
    groupByLabel: 'Customer',
    selectedIds: [] as number[],
    sumLabel: '' as string,
    sumValue: 0 as number,
    groupsCount: 0 as number
  };

  constructor(
    private router: Router,
    private svc: ReportsService,
    private salesSvc: SalesService
  ) {}

  ngOnInit(): void {
    this.loadLookups();
    setTimeout(() => this.openHeaderModal(true), 0);
  }

  // ── Tabs / column picker ──────────────────────────────
  setTab(tab: 'basic' | 'logistics' | 'all') {
    this.activeTab = tab;
  }

  get filteredColumns(): ColumnDef[] {
    const q = (this.headerSearch || '').trim().toLowerCase();

    let list = this.columns;
    if (this.activeTab !== 'all') list = list.filter(c => c.group === this.activeTab);

    if (!q) return list;
    return list.filter(c => c.label.toLowerCase().includes(q) || (c.tags || '').toLowerCase().includes(q));
  }

  get selectedColumnCount(): number {
    return this.columns.filter(x => x.checked).length;
  }

  get isAllColumnsChecked(): boolean {
    return this.columns.length > 0 && this.columns.every(c => c.checked);
  }

  get selectedColumnsOrdered(): ColumnDef[] {
    return this.columns.filter(c => c.checked);
  }

  openHeaderModal(force: boolean) {
    this.columnsSnapshot = this.columns.map(c => ({ ...c }));
    this.headerSearch = '';
    this.activeTab = 'basic';
    this.showHeaderModal = true;
    if (force) this.mustPickColumns = true;
  }

  onOverlayClickClose() {
    if (this.mustPickColumns) return;
    this.closeHeaderModal();
  }

  closeHeaderModal() {
    this.showHeaderModal = false;
    this.headerSearch = '';
  }

  cancelHeaderModal() {
    // restore the column selection that existed before the picker was opened
    this.columns = this.columnsSnapshot.map(x => ({ ...x }));
    this.closeHeaderModal();
    // forced first-time pick with no report loaded yet → go back to the reports landing
    if (this.mustPickColumns && !this.listLoaded) {
      this.back();
    }
  }

  private toggleAllColumns(checked: boolean) {
    for (const c of this.columns) c.checked = checked;
  }

  onToggleAllColumns(event: Event) {
    const checked = (event.target as HTMLInputElement)?.checked === true;
    this.toggleAllColumns(checked);
  }

  selectAllInTab() {
    const list = this.activeTab === 'all' ? this.columns : this.columns.filter(c => c.group === this.activeTab);
    for (const c of list) c.checked = true;
  }

  clearAllInTab() {
    const list = this.activeTab === 'all' ? this.columns : this.columns.filter(c => c.group === this.activeTab);
    for (const c of list) c.checked = false;
  }

  applyHeadersAndClose() {
    if (!this.columns.some(x => x.checked)) {
      this.message = 'Please select at least one column.';
      return;
    }
    this.message = '';

    this.showHeaderModal = false;
    this.mustPickColumns = false;

    if (!this.listLoaded) {
      this.listLoaded = true;
      this.loadList();
    }
  }

  isColOn(key: ColKey): boolean {
    return !!this.columns.find(c => c.key === key && c.checked);
  }

  onLimitChange() {
    if (!this.selectedOption) this.selectedOption = 10;
  }

  // ── Lookups ───────────────────────────────────────────
  private loadLookups(): void {
    this.salesSvc.getDrivers().subscribe((res: any) => {
      const arr = this.salesSvc.unwrap(res);
      for (const r of arr) {
        const id = Number(r.id ?? r.Id);
        const name = String(r.name ?? r.Name ?? r.driverName ?? '').trim();
        if (id) this.driverMap.set(id, name);
      }
    });

    this.salesSvc.getVehicles().subscribe((res: any) => {
      const arr = this.salesSvc.unwrap(res);
      for (const r of arr) {
        const id = Number(r.id ?? r.Id);
        const no = String(r.vehicleNo ?? r.VehicleNo ?? r.vehicleNumber ?? '').trim();
        if (id) this.vehicleMap.set(id, no);
      }
    });
  }

  // ── List ──────────────────────────────────────────────
  private loadList(): void {
    this.loading = true;
    this.svc.getDeliveryNoteReport().subscribe({
      next: (res: any) => {
        const data = this.svc.unwrap(res);

        this.allRows = data.map((d: any) => ({
          id: Number(d.id ?? d.Id),
          doNumber: String(d.doNumber ?? d.DoNumber ?? ''),

          soId: d.soId ?? d.SoId ?? null,
          salesOrderNo: d.salesOrderNo ?? d.SalesOrderNo ?? '',
          packId: d.packId ?? d.PackId ?? null,

          driverId: (d.driverId ?? d.DriverId ?? null) !== null ? Number(d.driverId ?? d.DriverId) : null,
          driverMobileNo: d.driverMobileNo ?? d.DriverMobileNo ?? null,

          receivedPersonName: d.receivedPersonName ?? d.ReceivedPersonName ?? null,
          receivedPersonMobileNo: d.receivedPersonMobileNo ?? d.ReceivedPersonMobileNo ?? null,

          vehicleId: (d.vehicleId ?? d.VehicleId ?? null) !== null ? Number(d.vehicleId ?? d.VehicleId) : null,
          routeName: String(d.routeName ?? d.RouteName ?? '') || null,

          deliveryDate: d.deliveryDate ?? d.DeliveryDate ?? null,
          isPosted: (d.isPosted ?? d.IsPosted ?? 0),

          customerName: d.customerName ?? d.CustomerName ?? null,
          totalQty: Number(d.totalQty ?? d.TotalQty ?? d.qty ?? d.Qty ?? 0)
        })) as DoRow[];

        this.rows = [...this.allRows];
        this.selectedRowIds.clear();
        this.clearSummary(false);
        this.loading = false;
      },
      error: () => {
        this.allRows = [];
        this.rows = [];
        this.loading = false;
      }
    });
  }

  getDriverName(id?: number | null) { return id ? (this.driverMap.get(id) || '') : ''; }
  getVehicleNo(id?: number | null) { return id ? (this.vehicleMap.get(id) || '') : ''; }

  filterUpdate() {
    if (!this.listLoaded) return;

    const q = (this.searchValue || '').trim().toLowerCase();
    if (!q) { this.rows = [...this.allRows]; return; }

    this.rows = this.allRows.filter(r => {
      const doNum  = (r.doNumber || '').toLowerCase();
      const route  = (r.routeName || '').toLowerCase();
      const driver = this.getDriverName(r.driverId)?.toLowerCase() || '';
      const cust   = String(r.customerName ?? '').toLowerCase();
      const soNo   = String(r.salesOrderNo ?? '').toLowerCase();
      return doNum.includes(q) || route.includes(q) || driver.includes(q) || soNo.includes(q) || cust.includes(q);
    });
  }

  get pagedRows(): DoRow[] {
    const n = Number(this.selectedOption) || 10;
    return this.rows.slice(0, n);
  }

  // ── Row selection ─────────────────────────────────────
  get allVisibleSelected(): boolean {
    const visible = this.pagedRows;
    return visible.length > 0 && visible.every(r => this.selectedRowIds.has(r.id));
  }

  onToggleAllRows(event: Event) {
    const checked = (event.target as HTMLInputElement)?.checked === true;
    const visible = this.pagedRows;
    if (checked) {
      for (const r of visible) if (r?.id) this.selectedRowIds.add(r.id);
    } else {
      for (const r of visible) this.selectedRowIds.delete(r.id);
    }
  }

  onToggleRow(row: DoRow, event: Event) {
    const checked = (event.target as HTMLInputElement)?.checked === true;
    if (!row?.id) return;
    if (checked) this.selectedRowIds.add(row.id);
    else this.selectedRowIds.delete(row.id);
  }

  isRowSelected(row: DoRow) {
    return !!row?.id && this.selectedRowIds.has(row.id);
  }

  get selectedRows(): DoRow[] {
    const ids = this.selectedRowIds;
    return this.allRows.filter(r => ids.has(r.id));
  }

  isNumericCol(key: ColKey): boolean { return key === 'qty'; }

  getColValue(row: DoRow, key: ColKey): any {
    switch (key) {
      case 'doNumber': return row.doNumber ?? '';
      case 'deliveryDate': return row.deliveryDate ?? null;
      case 'customer': return row.customerName ?? '';
      case 'qty': return Number(row.totalQty ?? 0) || 0;
      case 'soNo': return row.salesOrderNo ?? '';
      case 'driver': return this.getDriverName(row.driverId) || (row.driverId ? `#${row.driverId}` : '');
      case 'driverContact': return row.driverMobileNo ?? '';
      case 'receivedPerson': return row.receivedPersonName ?? '';
      case 'receivedContact': return row.receivedPersonMobileNo ?? '';
      case 'vehicle': return this.getVehicleNo(row.vehicleId) || (row.vehicleId ? `#${row.vehicleId}` : '');
      case 'location': return row.routeName ?? '';
      case 'posted': return !!row.isPosted ? 'Posted' : 'Not Posted';
      default: return '';
    }
  }

  // formatted value for the main table display
  getColDisplay(row: DoRow, key: ColKey): string {
    if (key === 'deliveryDate') return this.formatDate(row.deliveryDate);
    if (key === 'qty') return this.formatNumber(Number(row.totalQty ?? 0) || 0);
    const v = this.getColValue(row, key);
    return (v === null || v === undefined || v === '') ? '-' : String(v);
  }

  private getGroupByKey(): ColKey {
    const selectedKeys = this.columns.filter(c => c.checked).map(c => c.key);
    if (selectedKeys.includes('customer')) return 'customer';
    return 'doNumber';
  }

  // ── Submit / Summary ──────────────────────────────────
  submitSelected() {
    if (!this.listLoaded) return;

    const picks = this.selectedRows;
    if (!picks.length) {
      this.message = 'Please select at least one Delivery Note.';
      return;
    }
    this.message = '';

    this.summaryDetailRows = [...picks];

    const selectedCols = this.columns.filter(c => c.checked);
    this.summarySelectedHeaders = selectedCols.map(c => c.label);

    const groupByKey = this.getGroupByKey();
    const groupByLabel = this.columns.find(c => c.key === groupByKey)?.label || 'Group';

    this.summaryNumericCols = selectedCols
      .filter(c => this.isNumericCol(c.key))
      .map(c => ({ key: c.key, label: c.label }));

    const map = new Map<string, SummaryGroup>();

    for (const r of picks) {
      const groupValRaw = this.getColValue(r, groupByKey);
      const groupVal = String(groupValRaw || 'Unknown').trim() || 'Unknown';

      if (!map.has(groupVal)) map.set(groupVal, { group: groupVal, docs: 0, sums: {} });

      const g = map.get(groupVal)!;
      g.docs += 1;

      for (const nc of this.summaryNumericCols) {
        const v = Number(this.getColValue(r, nc.key) ?? 0) || 0;
        g.sums[nc.key] = (g.sums[nc.key] ?? 0) + v;
      }
    }

    this.summaryGroups = Array.from(map.values()).sort((a, b) => b.docs - a.docs);

    let sumLabel = '';
    let sumValue = 0;
    if (this.summaryNumericCols.length === 1) {
      sumLabel = this.summaryNumericCols[0].label;
      const key = this.summaryNumericCols[0].key;
      sumValue = this.summaryGroups.reduce((s, x) => s + (x.sums[key] ?? 0), 0);
    }

    this.summaryMeta = {
      createdAt: new Date(),
      selectedDocs: picks.length,
      groupByKey,
      groupByLabel,
      selectedIds: picks.map(x => x.id),
      sumLabel,
      sumValue,
      groupsCount: this.summaryGroups.length
    };

    this.summaryVisible = true;

    setTimeout(() => {
      document.getElementById('dnSummaryRoot')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  backToList() { this.summaryVisible = false; }

  clearSummary(clearSelection: boolean = true) {
    this.summaryVisible = false;
    this.summaryGroups = [];
    this.summaryNumericCols = [];
    this.summaryDetailRows = [];
    this.summarySelectedHeaders = [];

    this.summaryMeta = {
      createdAt: new Date(),
      selectedDocs: 0,
      groupByKey: 'customer',
      groupByLabel: 'Customer',
      selectedIds: [],
      sumLabel: '',
      sumValue: 0,
      groupsCount: 0
    };

    if (clearSelection) this.selectedRowIds.clear();
  }

  back() {
    this.router.navigate(['/app/sales/reports']);
  }

  // ── Print ─────────────────────────────────────────────
  printSummary() {
    if (!this.summaryVisible) {
      this.message = 'Summary is not visible. Please submit selected first.';
      return;
    }

    const cols = this.selectedColumnsOrdered;
    if (!cols?.length) {
      this.message = 'No columns selected.';
      return;
    }

    const createdAt = this.formatDateTime(this.summaryMeta.createdAt);
    const groupBy = this.summaryMeta.groupByLabel || 'Group';

    const groupRowsHtml = this.buildGroupTableHtml(groupBy);
    const detailHtml = this.buildDetailTableHtml(cols);

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Delivery Note Summary</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; color: #111; }
    .brand { display:flex; align-items:center; gap:12px; margin-bottom: 10px; }
    .logo { width:44px; height:44px; border-radius: 50%; background:#2E5F73; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; }
    .brand h1 { font-size: 18px; margin: 0; }
    .brand .sub { font-size: 12px; color: #666; margin-top: 2px; }
    .hr { height: 2px; background:#2E5F73; margin: 10px 0 14px; }
    .meta-box {
      border: 1px solid #cfd8dc;
      border-radius: 10px;
      padding: 12px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 18px;
      margin-bottom: 14px;
    }
    .meta-row { display:flex; justify-content: space-between; gap: 12px; font-size: 13px; }
    .meta-row b { font-weight: 700; }
    .meta-row .k { color:#2E5F73; font-weight: 700; min-width: 130px; }
    .section-title {
      background:#2E5F73;
      color:#fff;
      padding: 10px 12px;
      border-radius: 8px 8px 0 0;
      font-weight: 700;
      font-size: 13px;
      margin-top: 14px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cfd8dc; padding: 10px; font-size: 13px; }
    th { background: #2E5F73; color: #fff; text-align: left; }
    td.num, th.num { text-align: right; }
    td.center, th.center { text-align: center; }
    @media print {
      body { padding: 0; }
      .section-title, th, .hr, .logo { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="brand">
    <div class="logo">FBH</div>
    <div>
      <h1>FBH UnityWorks ERP</h1>
      <div class="sub">Delivery Note Summary</div>
    </div>
  </div>

  <div class="hr"></div>

  <div class="meta-box">
    <div class="meta-row"><span class="k">Created At</span><b>${this.escapeHtml(createdAt)}</b></div>
    <div class="meta-row"><span class="k">Selected Docs</span><b>${this.summaryMeta.selectedDocs}</b></div>
    <div class="meta-row"><span class="k">Group By</span><b>${this.escapeHtml(groupBy)}</b></div>
    <div class="meta-row"><span class="k">Groups</span><b>${this.summaryMeta.groupsCount}</b></div>
  </div>

  <div class="section-title">Group Summary</div>
  ${groupRowsHtml}

  <div class="section-title">Selected Documents</div>
  ${detailHtml}

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>
    `;

    const w = window.open('', '_blank', 'width=1100,height=750');
    if (!w) { this.message = 'Popup blocked. Allow popups to print.'; return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  private buildGroupTableHtml(groupLabel: string): string {
    const hasNum = (this.summaryNumericCols?.length || 0) > 0;

    const headNum = (this.summaryNumericCols || [])
      .map(c => `<th class="num">${this.escapeHtml(c.label)}</th>`)
      .join('');

    const body = (this.summaryGroups || [])
      .map(g => {
        const nums = (this.summaryNumericCols || []).map(c => {
          const v = Number(g.sums?.[c.key] ?? 0) || 0;
          return `<td class="num">${this.formatNumber(v)}</td>`;
        }).join('');

        return `
          <tr>
            <td>${this.escapeHtml(g.group)}</td>
            <td class="center">${g.docs}</td>
            ${hasNum ? nums : ''}
          </tr>
        `;
      })
      .join('');

    const colspan = hasNum ? (2 + this.summaryNumericCols.length) : 2;

    return `
      <table>
        <thead>
          <tr>
            <th>${this.escapeHtml(groupLabel)}</th>
            <th class="center">Docs</th>
            ${hasNum ? headNum : ''}
          </tr>
        </thead>
        <tbody>
          ${body || `<tr><td colspan="${colspan}">-</td></tr>`}
        </tbody>
      </table>
    `;
  }

  private buildDetailTableHtml(cols: ColumnDef[]): string {
    const thead = cols.map(c => {
      const cls = this.isNumericCol(c.key) ? 'num' : '';
      return `<th class="${cls}">${this.escapeHtml(c.label)}</th>`;
    }).join('');

    const rows = (this.summaryDetailRows || []).map(r => {
      const tds = cols.map(c => {
        let val = this.getColValue(r, c.key);
        if (c.key === 'deliveryDate') val = this.formatDate(val);

        if (this.isNumericCol(c.key)) return `<td class="num">${this.formatNumber(Number(val ?? 0) || 0)}</td>`;
        return `<td>${this.escapeHtml(String(val ?? '-'))}</td>`;
      }).join('');

      return `<tr>${tds}</tr>`;
    }).join('');

    return `
      <table>
        <thead><tr>${thead}</tr></thead>
        <tbody>
          ${rows || `<tr><td colspan="${cols.length}">-</td></tr>`}
        </tbody>
      </table>
    `;
  }

  // ── Format helpers ────────────────────────────────────
  formatDate(value: any): string {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}-${mm}-${yy}`;
  }

  private formatDateTime(value: any): string {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    let hh = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12; if (hh === 0) hh = 12;
    const hh2 = String(hh).padStart(2, '0');
    return `${dd}/${mm}/${yy}, ${hh2}:${min}:${sec} ${ampm}`;
  }

  formatNumber(n: number): string {
    try { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(n); }
    catch { return String(n); }
  }

  private escapeHtml(s: string): string {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
