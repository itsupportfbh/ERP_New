import { Component, EventEmitter, Input, Output } from '@angular/core';

export type DateRangeValue =
  | 'today' | 'yesterday' | 'last7' | 'last30'
  | 'thisMonth' | 'lastMonth' | 'custom' | 'all';

export interface FilterModel {
  dateRange: DateRangeValue | null;
  fromDate: string | null;
  toDate: string | null;
  customerId: string | null;    // customer name
  branchId: string | null;      // location / branch name
  status: string | null;
  salespersonId: string | null; // salesperson name
  categoryId: string | null;    // category name
}

export interface FilterApplyPayload extends FilterModel {
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Shared filter panel for the Sales reports. Rendered as a slide-in modal
 * (the new app has no core-sidebar). Parent toggles [open] and listens to
 * (saved)/(canceled). Field visibility is controlled per report via inputs.
 */
@Component({
  selector: 'erp-report-filters',
  standalone: false,
  templateUrl: './report-filters.component.html',
  styleUrls: ['./report-filters.component.scss']
})
export class ReportFiltersComponent {
  @Input() open = false;

  @Input() showCustomer = false;
  @Input() showBranch = true;
  @Input() showStatus = false;
  @Input() showSalesperson = true;
  @Input() showCategory = true;

  @Input() customers: Array<{ id: string; name: string }> = [];
  @Input() branches: Array<{ id: string; name: string }> = [];
  @Input() salespersons: Array<{ id: string; name: string }> = [];
  @Input() categories: Array<{ id: string; name: string }> = [];
  @Input() statuses: Array<{ value: string; label: string }> = [];

  @Output() saved = new EventEmitter<FilterApplyPayload>();
  @Output() canceled = new EventEmitter<void>();

  dateRangeOptions: Array<{ value: DateRangeValue; label: string }> = [
    { value: 'all', label: 'All Dates' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7', label: 'Last 7 days' },
    { value: 'last30', label: 'Last 30 days' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'custom', label: 'Custom Range' },
  ];

  model: FilterModel = this.blank();

  private blank(): FilterModel {
    return { dateRange: 'all', fromDate: null, toDate: null, customerId: null, branchId: null, status: null, salespersonId: null, categoryId: null };
  }

  onApply(): void {
    if (this.model.dateRange === 'custom') {
      if (!this.model.fromDate || !this.model.toDate) return;
      if (this.model.fromDate > this.model.toDate) return;
    }
    this.saved.emit(this.resolveRange(this.model));
  }

  onCancel(): void { this.canceled.emit(); }

  onReset(): void { this.model = this.blank(); }

  private resolveRange(model: FilterModel): FilterApplyPayload {
    const today = new Date();
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let startDate: string | null = null;
    let endDate: string | null = null;

    const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastThis = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const firstLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastLast = new Date(today.getFullYear(), today.getMonth(), 0);

    switch (model.dateRange) {
      case 'today': startDate = endDate = ymd(today); break;
      case 'yesterday': { const d = new Date(today); d.setDate(d.getDate() - 1); startDate = endDate = ymd(d); break; }
      case 'last7': { const d = new Date(today); d.setDate(d.getDate() - 6); startDate = ymd(d); endDate = ymd(today); break; }
      case 'last30': { const d = new Date(today); d.setDate(d.getDate() - 29); startDate = ymd(d); endDate = ymd(today); break; }
      case 'thisMonth': startDate = ymd(firstThis); endDate = ymd(lastThis); break;
      case 'lastMonth': startDate = ymd(firstLast); endDate = ymd(lastLast); break;
      case 'custom': startDate = model.fromDate; endDate = model.toDate; break;
      default: startDate = null; endDate = null; break;
    }
    return { ...model, startDate, endDate };
  }
}
