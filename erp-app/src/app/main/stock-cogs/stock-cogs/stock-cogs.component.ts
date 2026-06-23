import { Component, OnInit } from '@angular/core';
import { CogsItemRow, CogsReport } from './cogs-report.model';
import { CogsReportService } from '../stock-cogs-service';
import { WarehouseService } from 'app/main/master/warehouse/warehouse.service';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';
import Swal from 'sweetalert2';

type TabKey = 'table' | 'formula';

type WarehouseDto = {
  id: number;
  name: string;
};

@Component({
  standalone: false,
  selector: 'app-stock-cogs',
  templateUrl: './stock-cogs.component.html',
  styleUrls: ['./stock-cogs.component.scss']
})
export class StockCogsComponent implements OnInit {
  expandedRow: number | null = null;
  loading = false;
  activeTab: TabKey = 'table';
  search = '';

  fromDate = this.toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  toDate = this.toISODate(new Date());

  warehouseList: WarehouseDto[] = [];
  warehouseId: number | null = null;
  binId?: number;

  userId: any;
  report?: CogsReport;

  functionId = 'stockcogs';
  permission: FunctionPermission;
  isPermissionLoaded = false;
  isPageLoading = false;
  

  constructor(
    private api: CogsReportService,
    private whApi: WarehouseService,
    private permissionService: PermissionService
  ) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void {
    this.loadPermission();
  }

  toggleRow(itemId: number): void {
  this.expandedRow = this.expandedRow === itemId ? null : itemId;
}
  loadPermission(): void {
    if (!this.userId || this.userId <= 0) {
      this.permission = this.permissionService.getEmptyPermission(this.functionId);
      this.isPermissionLoaded = true;

      Swal.fire({
        icon: 'warning',
        title: 'Access Denied',
        text: 'User not found. Please login again.',
        confirmButtonColor: '#16a34a'
      });
      return;
    }

    this.isPageLoading = true;

    this.permissionService.getFunctionPermission(this.userId, this.functionId).subscribe({
      next: (res: FunctionPermission) => {
        this.permission = res || this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
        this.isPageLoading = false;

        if (this.canView()) {
          this.loadWarehouses(() => this.load());
        } else {
          this.report = {} as CogsReport;
        }
      },
      error: () => {
        this.permission = this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
        this.isPageLoading = false;

        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Unable to load permission.',
          confirmButtonColor: '#16a34a'
        });
      }
    });
  }

  canView(): boolean {
    return this.permissionService.hasView(this.permission);
  }

  canCreate(): boolean {
    return this.permissionService.hasCreate(this.permission);
  }

  canEdit(): boolean {
    return this.permissionService.hasEdit(this.permission);
  }

  canDelete(): boolean {
    return this.permissionService.hasDelete(this.permission);
  }

  canExport(): boolean {
    return this.permissionService.hasExport(this.permission);
  }

  load(): void {
    if (!this.fromDate || !this.toDate) {
      Swal.fire({
        icon: 'warning',
        title: 'Date Required',
        text: 'Please select From Date and To Date.',
        confirmButtonColor: '#16a34a'
      });
      return;
    }

    if (new Date(this.fromDate) > new Date(this.toDate)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Date Range',
        text: 'From Date should be less than or equal to To Date.',
        confirmButtonColor: '#16a34a'
      });
      return;
    }

    this.loading = true;

    this.api.getCogs(
      this.fromDate,
      this.toDate,
      this.warehouseId ?? undefined,
      this.binId
    ).subscribe({
      next: (res: any) => {
        this.report = res?.data || res;

        if (this.report?.items?.length) {
          this.report.items = this.report.items.filter(x => Number(x?.itemId || 0) > 0);
        }

        if (!this.report?.items?.length) {
          Swal.fire({
            icon: 'info',
            title: 'No Data',
            text: 'No COGS data found for selected filter.',
            confirmButtonColor: '#16a34a'
          });
        }

        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.loading = false;

        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Unable to load COGS report.',
          confirmButtonColor: '#16a34a'
        });
      }
    });
  }

  private loadWarehouses(done?: () => void): void {
    this.whApi.getWarehouse().subscribe({
      next: (res: any) => {
        this.warehouseList = (res?.data || res || [])
          .map((x: any) => ({
            id: Number(x.id ?? x.Id ?? 0),
            name: String(x.name ?? x.Name ?? '')
          }))
          .filter((x: WarehouseDto) => x.id > 0);

        this.setDefaultWarehouseIfNeeded();
        done?.();
      },
      error: () => {
        this.warehouseList = [];
        this.warehouseId = null;
        done?.();
      }
    });
  }

  private setDefaultWarehouseIfNeeded(): void {
    if (this.warehouseId && this.warehouseId > 0) return;

    const userWh = Number(localStorage.getItem('defaultWarehouseId') || 0);
    if (userWh > 0) {
      this.warehouseId = userWh;
      return;
    }

    this.warehouseId = this.warehouseList.length > 0 ? this.warehouseList[0].id : null;
  }

  setTab(t: TabKey): void {
    this.activeTab = t;
  }

  get rows(): CogsItemRow[] {
    const items = this.report?.items ?? [];
    const q = (this.search || '').trim().toLowerCase();

    if (!q) return items;

    return items.filter((x: any) =>
      String(x.itemName || '').toLowerCase().includes(q) ||
      String(x.itemCode || '').toLowerCase().includes(q) ||
      String(x.itemId || '').includes(q)
    );
  }

  get selectedWarehouseName(): string {
    if (this.warehouseId == null) return 'All Warehouses';
    const wh = this.warehouseList.find(x => x.id === this.warehouseId);
    return wh?.name || `Warehouse ${this.warehouseId}`;
  }

  money(n?: number): string {
    let v = Number(n ?? 0);
    if (Math.abs(v) < 0.005) v = 0;

    return `$${v.toLocaleString('en-SG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  formatQty(n?: number): string {
    const v = Number(n ?? 0);
    if (Math.abs(v) < 0.0005) return '0';

    return v.toLocaleString('en-SG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4
    });
  }

  qtyExportText(qty?: number, uom?: string): string {
    return `${this.formatQty(qty)} ${uom || ''}`.trim();
  }

  private toISODate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

private buildCogsExportRows(): any[] {
  return (this.rows || []).map((r: any, idx: number) => ({
    'Sl. No': idx + 1,
    'Item Code': r.itemCode || '',
    'Item Name': r.itemName || r.itemText || '',
    'Opening Qty': Number(r.openingQty || 0),
    'Purchase Qty': Number(r.purchaseQty || 0),
    'Consumed Qty': Number(r.issueQty || 0),
    'Closing Qty': Number(r.closingQty || 0),
    'UOM': r.purchaseUomName || '',
    'Avg Cost': Number(r.avgCost || 0),
    'Closing Value': Number(r.closingValue || 0),
    'COGS': Number(r.cogsValue || 0)
  }));
}

  exportToExcel(): void {
    // const data = this.buildCogsExportRows();
    // if (!data.length) return;

    const excelData = (this.rows || []).map((r: any, idx: number) => ({
  'Sl. No': idx + 1,
  'Item Code': r.itemCode || '',
  'Item Name': r.itemName || r.itemText || '',
  'Closing Qty': Number(r.closingQty || 0),
  'UOM': r.purchaseUomName || '',
  'Avg Cost': Number(r.avgCost || 0),
  'Closing Value': Number(r.closingValue || 0),
  'COGS': Number(r.cogsValue || 0)
}));

    const from = this.fromDate || 'all';
    const to = this.toDate || 'all';
    const whName = this.selectedWarehouseName;
    const safeWhName = whName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-');

    const wb: XLSX.WorkBook = XLSX.utils.book_new();

   

     const ws = XLSX.utils.aoa_to_sheet([
      ['COGS Report'],
      [],
      ['From Date', from],
      ['To Date', to],
      ['Warehouse', whName],
      [],
      ['Opening Stock', Number(this.report?.summary?.openingStock || 0)],
      ['Purchases', Number(this.report?.summary?.purchases || 0)],
      ['Closing Stock', Number(this.report?.summary?.closingStock || 0)],
      ['COGS', Number(this.report?.summary?.cogs || 0)],
      [],
    ]);

    XLSX.utils.sheet_add_json(ws, excelData, {
      origin: 'A13',
      skipHeader: false,
      header: [
        'Sl. No',
        'Item Code',
        'Item Name',
        'Closing Qty',
        'UOM',
        'Avg Cost',
        'Closing Value',
        'COGS'
      ]
    });

    ws['!cols'] = [
      { wch: 10 },
      { wch: 14 },
      { wch: 34 },
      { wch: 14 },
      { wch: 22 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 }
    ];

    ['B7', 'B8', 'B9', 'B10'].forEach(cellRef => {
      if (ws[cellRef]) {
        ws[cellRef].t = 'n';
        ws[cellRef].z = '$#,##0.00';
      }
    });

    for (let row = 14; row <= excelData.length + 13; row++) {
      ['F', 'G', 'H'].forEach(col => {
        const cellRef = `${col}${row}`;
        if (ws[cellRef]) {
          ws[cellRef].t = 'n';
          ws[cellRef].z = '$#,##0.00';
        }
      });
    }

    XLSX.utils.book_append_sheet(wb, ws, 'COGS Report');
    XLSX.writeFile(wb, `COGS-${from}-to-${to}-${safeWhName}.xlsx`);
  }

  exportToPdf(): void {
    const data = this.buildCogsExportRows();
    if (!data.length) return;

    const doc = new jsPDF('l', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    const from = this.fromDate || 'All';
    const to = this.toDate || 'All';
    const wh = this.selectedWarehouseName;

    doc.setFontSize(12);
    doc.text(`Inventory COGS Report (${from} to ${to})`, pageWidth / 2, 30, { align: 'center' });

    doc.setFontSize(10);
    doc.text(`Warehouse: ${wh}`, 40, 50);

    doc.text(`Opening: ${this.money(this.report?.summary?.openingStock || 0)}`, 40, 70);
    doc.text(`Purchases: ${this.money(this.report?.summary?.purchases || 0)}`, 200, 70);
    doc.text(`Closing: ${this.money(this.report?.summary?.closingStock || 0)}`, 360, 70);
    doc.text(`COGS: ${this.money(this.report?.summary?.cogs || 0)}`, 520, 70);

    const head = [[
      'Sl',
      'Item Code',
      'Item Name',
      'Opening Qty',
      'Purchase Qty',
      'Consumed Qty',
      'Closing Qty',
      'UOM',
      'Avg Cost',
      'Closing Value',
      'COGS'
    ]];

    const body = data.map(r => [
      String(r['Sl. No'] ?? ''),
      String(r['Item Code'] ?? ''),
      String(r['Item Name'] ?? ''),
      String(r['Opening Qty'] ?? 0),
      String(r['Purchase Qty'] ?? 0),
      String(r['Consumed Qty'] ?? 0),
      String(r['Closing Qty'] ?? 0),
      String(r['UOM'] || ''),
      this.money(r['Avg Cost'] || 0),
      this.money(r['Closing Value'] || 0),
      this.money(r['COGS'] || 0)
    ]);
    autoTable(doc, {
      head,
      body,
      startY: 90,
      margin: { left: 20, right: 20 },
      styles: {
        fontSize: 8,
        valign: 'middle',
        halign: 'right'
      },
      columnStyles: {
        0: { halign: 'center' }, // Sl
        1: { halign: 'left' },   // Item Code
        2: { halign: 'left' },   // Item Name
        7: { halign: 'left' },   // UOM
        8: { halign: 'right' },  // Avg Cost
        9: { halign: 'right' },  // Closing Value
        10: { halign: 'right' }  // COGS
      },
      headStyles: {
        halign: 'left'
      }
    });

    doc.save(`COGS-${from}-to-${to}.pdf`);
  }
}
