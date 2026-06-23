import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import Swal from 'sweetalert2';

interface PreviewRow {
  headName: string;
  headCode: any;
  headType: string;
  netBalance: number;
}

interface YearStatus {
  isClosed: boolean;
  fyStartYear?: number;
  fyEndYear?: number;
  journalNo?: string;
  netProfitLoss?: number;
}

interface YearResult {
  journalNo: string;
  totalIncome: number;
  totalExpense: number;
  netProfitLoss: number;
}

@Component({
  selector: 'erp-finance-year-end-close',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-year-end-close.component.html',
  styleUrls: ['./finance-year-end-close.component.scss']
})
export class FinanceYearEndCloseComponent implements OnInit {
  fyYears: { label: string; startYear: number; endYear: number }[] = [];
  fyStartYear: number | null = null;
  fyEndYear: number | null = null;
  closeDate = '';

  status: YearStatus | null = null;
  statusLoading = false;

  previewRows: PreviewRow[] = [];
  previewLoading = false;
  showPreview = false;

  running = false;
  result: YearResult | null = null;

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  constructor(private finance: FinanceService, private permSvc: PermissionService) {}

  ngOnInit(): void {
    this.buildYears();
    this.permSvc.getFunctionPermission(this.userId, 'year-end').subscribe({
      next: p => { this.permission = p; }
    });
  }

  buildYears(): void {
    const cur = new Date().getFullYear();
    for (let y = cur; y >= cur - 5; y--) {
      this.fyYears.push({ label: `FY ${y}-${y + 1}`, startYear: y, endYear: y + 1 });
    }
  }

  onFySelect(startYear: number | null): void {
    if (!startYear) {
      this.fyStartYear = null; this.fyEndYear = null; this.closeDate = '';
      this.status = null; this.showPreview = false; this.previewRows = []; this.result = null;
      return;
    }
    const found = this.fyYears.find(y => y.startYear === startYear);
    this.fyStartYear = startYear;
    this.fyEndYear   = found?.endYear ?? startYear + 1;
    this.closeDate   = `${this.fyEndYear}-03-31`;
    this.showPreview = false; this.previewRows = []; this.result = null;
    this.loadStatus();
  }

  loadStatus(): void {
    if (!this.fyStartYear) return;
    this.statusLoading = true;
    this.finance.list({ list: `/YearEndClose/status/${this.fyStartYear}` }).subscribe({
      next: res => {
        this.status = this.finance.unwrapOne(res) as YearStatus;
        this.statusLoading = false;
      },
      error: () => { this.status = null; this.statusLoading = false; }
    });
  }

  loadPreview(): void {
    if (!this.fyStartYear || !this.closeDate) return;
    this.previewLoading = true;
    this.showPreview    = true;
    this.finance.list(
      { list: '/YearEndClose/preview' },
      { fyStartYear: this.fyStartYear, closeDate: this.closeDate }
    ).subscribe({
      next: res => {
        this.previewRows    = this.finance.unwrap(res) as PreviewRow[];
        this.previewLoading = false;
      },
      error: () => { this.previewRows = []; this.previewLoading = false; }
    });
  }

  get incomeRows():  PreviewRow[] { return this.previewRows.filter(r => r.headType === 'I' || r.headType === 'Income'); }
  get expenseRows(): PreviewRow[] { return this.previewRows.filter(r => r.headType === 'E' || r.headType === 'Expense'); }
  get totalIncome():  number { return this.incomeRows.reduce((s, r) => s + (r.netBalance || 0), 0); }
  get totalExpense(): number { return this.expenseRows.reduce((s, r) => s + (r.netBalance || 0), 0); }
  get netPL():        number { return this.totalIncome - this.totalExpense; }

  runYearEndClose(): void {
    if (!this.fyStartYear || !this.fyEndYear || !this.closeDate) {
      Swal.fire({ icon: 'warning', title: 'Missing Data', text: 'Select Financial Year and Close Date first.', confirmButtonColor: '#16a34a' });
      return;
    }
    if (this.status?.isClosed) {
      Swal.fire('Already Closed', `FY ${this.fyStartYear}-${this.fyEndYear} is already closed.`, 'info');
      return;
    }
    if (!this.permission?.post) {
      Swal.fire({ icon: 'warning', title: 'Access Denied', text: 'You do not have Year End Close permission.', confirmButtonColor: '#16a34a' });
      return;
    }

    Swal.fire({
      title: 'Run Year End Close?',
      html: `<div style="text-align:left;font-size:13px;">
        <p><strong>FY:</strong> ${this.fyStartYear}-${this.fyEndYear}</p>
        <p><strong>Close Date:</strong> ${this.closeDate}</p>
        <p><strong>Net P&amp;L:</strong> ${this.netPL.toFixed(2)}</p>
        <hr/>
        <ul>
          <li>Closes all Income &amp; Expense accounts to zero</li>
          <li>Transfers Net P&amp;L to Retained Earnings</li>
          <li>Sets Opening Balance for next year</li>
        </ul>
        <p style="color:#e74c3c"><strong>This cannot be undone!</strong></p>
      </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Run Year End Close',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#16a34a'
    }).then(r => {
      if (!r.isConfirmed) return;
      this.running = true;
      this.finance.create(
        { create: '/YearEndClose/run' },
        { fyStartYear: this.fyStartYear, fyEndYear: this.fyEndYear, closeDate: this.closeDate }
      ).subscribe({
        next: res => {
          this.result  = this.finance.unwrapOne(res) as YearResult;
          this.running = false;
          this.loadStatus();
          Swal.fire({
            icon: 'success',
            title: 'Year End Close Completed!',
            html: `<div style="text-align:left;font-size:13px;">
              <p><strong>Journal:</strong> ${this.result?.journalNo}</p>
              <p><strong>Net P&amp;L:</strong> ${this.result?.netProfitLoss?.toFixed(2)}</p>
            </div>`,
            confirmButtonColor: '#16a34a'
          });
        },
        error: err => {
          this.running = false;
          Swal.fire('Failed', err?.error?.message || 'Year End Close failed.', 'error');
        }
      });
    });
  }
}
