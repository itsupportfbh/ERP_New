import { Component, OnInit } from '@angular/core';
import { ReportsService } from './reports.service';
import { FilterApplyPayload } from './report-filters.component';

type DeliveryStatus = 'PLANNED' | 'IN TRANSIT' | 'DELIVERED' | 'DELAYED' | 'CANCELLED';

interface DeliveryRow {
  doNo: string;
  customerName: string;
  branch: string;
  plannedDate: Date | string;
  actualDate?: Date | string | null; // null/undefined if not yet delivered
  status: DeliveryStatus;
  orderedQty: number;   // for % calc
  deliveryQty: number;  // delivered so far
  driver: string;
  vehicle: string;
  remarks?: string;
}

@Component({
  selector: 'erp-report-deliveries',
  standalone: false,
  templateUrl: './report-deliveries.component.html',
  styleUrls: ['./report-deliveries.component.scss']
})
export class ReportDeliveriesComponent implements OnInit {
  rows: DeliveryRow[] = [];
  allRows: DeliveryRow[] = [];

  selectedOption = 10;
  searchValue = '';
  currentPage = 1;

  loading = false;
  errorMsg: string | null = null;

  filterOpen = false;
  lastFilters: FilterApplyPayload | null = null;

  customers: Array<{ id: string; name: string }> = [];
  branches: Array<{ id: string; name: string }> = [];
  statuses: Array<{ value: string; label: string }> = [
    { value: 'PLANNED', label: 'Planned' },
    { value: 'IN TRANSIT', label: 'In Transit' },
    { value: 'DELIVERED', label: 'Delivered' },
    { value: 'DELAYED', label: 'Delayed' },
    { value: 'CANCELLED', label: 'Cancelled' }
  ];

  constructor(private svc: ReportsService) {}

  ngOnInit(): void {
    this.loadDeliveryReport();
  }

  // ---------- paging ----------
  get totalPages(): number {
    return Math.ceil(this.rows.length / this.selectedOption) || 1;
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const cur = this.currentPage;
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) { pages.push(i); }
    return pages;
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) { this.currentPage = page; }
  }

  onLimitChange(): void {
    this.currentPage = 1;
  }

  // ---------- helpers ----------
  delayDays(row: DeliveryRow): number {
    const planned = new Date(row.plannedDate);
    const basis = row.actualDate ? new Date(row.actualDate) : new Date(); // today if pending
    const ms = basis.setHours(0, 0, 0, 0) - planned.setHours(0, 0, 0, 0);
    return Math.max(Math.floor(ms / (1000 * 60 * 60 * 24)), 0);
  }

  // percentage delivered (0–100)
  deliveredPct(row: DeliveryRow): number {
    if (!row.orderedQty) { return 0; }
    return Math.min(100, Math.max(0, (row.deliveryQty / row.orderedQty) * 100));
  }

  // status → CSS class
  statusClass(st: DeliveryStatus): string {
    switch (st) {
      case 'DELIVERED': return 'pill pill-success';
      case 'IN TRANSIT': return 'pill pill-info';
      case 'PLANNED': return 'pill pill-neutral';
      case 'DELAYED': return 'pill pill-warning';
      case 'CANCELLED': return 'pill pill-danger';
      default: return 'pill';
    }
  }

  // ---------- search / filter ----------
  applyFilter(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  applyFilters(): void {
    const search = (this.searchValue || '').trim().toLowerCase();
    const f = this.lastFilters;
    const start = f?.startDate ? this.startOfDay(f.startDate).getTime() : null;
    const end = f?.endDate ? this.startOfDay(f.endDate).getTime() : null;

    this.rows = this.allRows.filter(r => {
      const hitSearch = !search || [
        r.doNo,
        r.customerName,
        r.branch,
        r.driver,
        r.vehicle,
        r.status,
        r.remarks || ''
      ].some(v => String(v || '').toLowerCase().includes(search));

      const plannedTime = this.startOfDay(r.plannedDate).getTime();
      const hitDate = (start == null || plannedTime >= start) && (end == null || plannedTime <= end);
      const hitCustomer = !f?.customerId || r.customerName === f.customerId;
      const hitBranch = !f?.branchId || r.branch === f.branchId;
      const hitStatus = !f?.status || r.status === f.status;

      return hitSearch && hitDate && hitCustomer && hitBranch && hitStatus;
    });
  }

  openFilters(): void { this.filterOpen = true; }

  onFiltersApplied(payload: FilterApplyPayload): void {
    this.lastFilters = payload;
    this.currentPage = 1;
    this.applyFilters();
    this.filterOpen = false;
  }

  onFilterCanceled(): void {
    this.filterOpen = false;
  }

  // ---------- data loading / mapping ----------
  private loadDeliveryReport(): void {
    this.loading = true;
    this.errorMsg = null;

    this.svc.getDeliveryNoteReport().subscribe({
      next: (res: any) => {
        const data = this.svc.unwrap(res);
        this.allRows = data.map((d: any) => this.toDeliveryRow(d));
        this.buildFilterLookups();
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.rows = [];
        this.allRows = [];
        this.loading = false;
        this.errorMsg = 'Failed to load delivery report.';
      }
    });
  }

  private toDeliveryRow(d: any): DeliveryRow {
    const plannedDate = d.deliveryDate ?? d.DeliveryDate ?? d.plannedDate ?? d.PlannedDate ?? null;
    const posted = Number(d.isPosted ?? d.IsPosted ?? 0) === 1 || d.isPosted === true || d.IsPosted === true;
    const orderedQty = Number(d.totalQty ?? d.TotalQty ?? d.orderedQty ?? d.OrderedQty ?? d.qty ?? d.Qty ?? 0);
    const status = this.resolveStatus(d, plannedDate, posted);

    return {
      doNo: String(d.doNumber ?? d.DoNumber ?? d.doNo ?? d.DoNo ?? ''),
      customerName: String(d.customerName ?? d.CustomerName ?? '-'),
      branch: String(d.branch ?? d.Branch ?? d.routeName ?? d.RouteName ?? '-'),
      plannedDate: plannedDate || new Date(),
      actualDate: posted ? (d.actualDate ?? d.ActualDate ?? plannedDate) : null,
      status,
      orderedQty,
      deliveryQty: posted ? orderedQty : Number(d.deliveryQty ?? d.DeliveryQty ?? 0),
      driver: String(d.driverName ?? d.DriverName ?? d.driver ?? d.Driver ?? d.driverMobileNo ?? d.DriverMobileNo ?? '-'),
      vehicle: String(d.vehicleNo ?? d.VehicleNo ?? d.vehicle ?? d.Vehicle ?? d.vehicleId ?? d.VehicleId ?? '-'),
      remarks: String(d.remarks ?? d.Remarks ?? d.receivedPersonName ?? d.ReceivedPersonName ?? '')
    };
  }

  private resolveStatus(d: any, plannedDate: any, posted: boolean): DeliveryStatus {
    const raw = String(d.status ?? d.Status ?? '').toUpperCase();
    if (['PLANNED', 'IN TRANSIT', 'DELIVERED', 'DELAYED', 'CANCELLED'].includes(raw)) {
      return raw as DeliveryStatus;
    }
    if (posted) {
      return 'DELIVERED';
    }
    const planned = this.startOfDay(plannedDate).getTime();
    const today = this.startOfDay(new Date()).getTime();
    return planned < today ? 'DELAYED' : 'PLANNED';
  }

  private buildFilterLookups(): void {
    const customers = Array.from(new Set(this.allRows.map(r => r.customerName).filter(Boolean))).sort();
    const branches = Array.from(new Set(this.allRows.map(r => r.branch).filter(Boolean))).sort();

    this.customers = customers.map(name => ({ id: name, name }));
    this.branches = branches.map(name => ({ id: name, name }));
  }

  private startOfDay(value: Date | string | null | undefined): Date {
    const d = value ? new Date(value) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
