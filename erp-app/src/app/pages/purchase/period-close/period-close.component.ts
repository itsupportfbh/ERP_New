import { Component, OnInit } from '@angular/core';
import {
  PeriodCloseService,
  PeriodOption,
  PeriodStatus
} from '../../../main/financial/period-close-fx/period-close-fx.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'erp-period-close',
  standalone: false,
  templateUrl: './period-close.component.html',
  styleUrls: ['./period-close.component.scss']
})
export class PeriodCloseComponent implements OnInit {
  periods: PeriodOption[] = [];
  selectedPeriodId: number | null = null;
  fxRevalDate = '';
  isLocking = false;
  isRunningFx = false;
  status: PeriodStatus | null = null;
  loading = false;
  lastRunResult: {
    runId: number;
    fxDate: string;
    totalGain: number;
    totalLoss: number;
    net: number;
  } | null = null;

  get isLocked()   { return !!this.status?.isLocked; }

  constructor(private periodSvc: PeriodCloseService) {}

  ngOnInit(): void {
    this.loadPeriods();
  }

  loadPeriods(): void {
    this.loading = true;
    this.periodSvc.getPeriods().subscribe({
      next: list => {
        this.periods = list || [];
        this.loading = false;
        if (!this.periods.length) { this.selectedPeriodId = null; this.status = null; return; }

        const today = new Date();
        const cur = this.periods.find(p => {
          const s = new Date(p.startDate), e = new Date(p.endDate);
          return today >= s && today <= e;
        });
        if (cur) {
          this.selectedPeriodId = cur.id;
        } else {
          const past = this.periods
            .filter(p => new Date(p.endDate) < today)
            .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
          this.selectedPeriodId = past.length ? past[0].id : this.periods[0].id;
        }
        this.onPeriodChange(this.selectedPeriodId);
      },
      error: err => {
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Load Failed', text: err?.error?.message || 'Failed to load periods.', confirmButtonColor: '#0e4a60' });
      }
    });
  }

  onPeriodChange(id: number | null): void {
    if (!id) { this.selectedPeriodId = null; this.status = null; this.fxRevalDate = ''; return; }
    this.selectedPeriodId = id;
    this.periodSvc.getStatus(id).subscribe({
      next: s => {
        this.status = s;
        this.fxRevalDate = s?.periodEndDate
          ? s.periodEndDate.substring(0, 10)
          : (this.periods.find(x => x.id === id)?.endDate?.substring(0, 10) ?? '');
      },
      error: () => { this.status = null; }
    });
  }

  onToggleLock(): void {
    if (!this.selectedPeriodId || !this.status) return;
    const target = !this.status.isLocked;
    const periodLabel = this.selectedPeriodLabel;

    Swal.fire({
      title: target ? '🔒 Lock Period?' : '🔓 Unlock Period?',
      html: target
        ? `<div style="text-align:left;font-size:13.5px;">
            <p><strong>Period:</strong> ${periodLabel}</p>
            <p style="color:#b45309;">Users will <strong>not</strong> be able to post any transactions in this period.</p>
           </div>`
        : `<div style="text-align:left;font-size:13.5px;">
            <p><strong>Period:</strong> ${periodLabel}</p>
            <p style="color:#15803d;">Users will be able to post transactions in this period again.</p>
           </div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: target ? 'Yes, Lock Period' : 'Yes, Unlock Period',
      cancelButtonText: 'Cancel',
      confirmButtonColor: target ? '#dc2626' : '#16a34a',
      cancelButtonColor: '#6b7280'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.isLocking = true;
      this.periodSvc.setLock(this.selectedPeriodId!, target).subscribe({
        next: s => {
          this.status = s;
          this.isLocking = false;
          Swal.fire({
            icon: 'success',
            title: target ? 'Period Locked' : 'Period Unlocked',
            text: `${periodLabel} has been ${target ? 'locked' : 'unlocked'} successfully.`,
            confirmButtonColor: '#0e4a60',
            timer: 2500,
            timerProgressBar: true
          });
        },
        error: err => {
          this.isLocking = false;
          Swal.fire({ icon: 'error', title: 'Failed', text: err?.error?.message || 'Failed to change lock status.', confirmButtonColor: '#0e4a60' });
        }
      });
    });
  }

  runFxRevaluation(): void {
    if (!this.selectedPeriodId) {
      Swal.fire({ icon: 'warning', title: 'No Period Selected', text: 'Please select a period first.', confirmButtonColor: '#0e4a60' });
      return;
    }
    if (!this.fxRevalDate) {
      Swal.fire({ icon: 'warning', title: 'No Date', text: 'Please enter the FX revaluation date.', confirmButtonColor: '#0e4a60' });
      return;
    }

    const periodLabel = this.selectedPeriodLabel;
    Swal.fire({
      title: 'Run FX Revaluation?',
      html: `<div style="text-align:left;font-size:13.5px;">
        <p><strong>Period:</strong> ${periodLabel}</p>
        <p><strong>FX Date:</strong> ${this.fxRevalDate}</p>
        <hr style="margin:10px 0;border-color:#e5e7eb;"/>
        <p style="margin-bottom:4px;font-weight:600;">This will:</p>
        <ul style="padding-left:18px;line-height:1.9;">
          <li>Revalue all open AR/AP foreign-currency balances</li>
          <li>Calculate Unrealized Gain / Loss</li>
          <li>Post GL Journal automatically</li>
        </ul>
      </div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Run Revaluation',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#0e4a60',
      cancelButtonColor: '#6b7280'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.isRunningFx = true;
      this.periodSvc.runFxReval({ periodId: this.selectedPeriodId!, fxDate: this.fxRevalDate }).subscribe({
        next: (res: any) => {
          this.isRunningFx = false;
          const data = res?.data ?? res ?? {};
          const totalGain = Number(data.totalGain ?? 0);
          const totalLoss = Number(data.totalLoss ?? 0);
          const net = totalGain - totalLoss;
          this.lastRunResult = {
            runId: Number(data.runId ?? 0),
            fxDate: this.fxRevalDate,
            totalGain, totalLoss, net
          };
          if (totalGain === 0 && totalLoss === 0) {
            Swal.fire({
              icon: 'info',
              title: 'No FX Differences',
              text: 'No unrealized FX differences found. No GL journal was posted.',
              confirmButtonColor: '#0e4a60'
            });
          } else {
            Swal.fire({
              icon: 'success',
              title: 'FX Revaluation Completed!',
              html: `<div style="text-align:left;font-size:13.5px;">
                <p><strong>Period:</strong> ${periodLabel}</p>
                <p><strong>FX Date:</strong> ${this.fxRevalDate}</p>
                <hr style="margin:10px 0;border-color:#e5e7eb;"/>
                ${totalGain > 0 ? `<p style="color:#16a34a;"><strong>FX Gain:</strong> ${totalGain.toFixed(2)}</p>` : ''}
                ${totalLoss > 0 ? `<p style="color:#dc2626;"><strong>FX Loss:</strong> ${totalLoss.toFixed(2)}</p>` : ''}
                <p><strong>Net:</strong> <span style="color:${net >= 0 ? '#16a34a' : '#dc2626'};font-weight:700;">${net >= 0 ? '+' : ''}${net.toFixed(2)}</span></p>
              </div>`,
              confirmButtonColor: '#0e4a60'
            });
          }
        },
        error: err => {
          this.isRunningFx = false;
          Swal.fire({ icon: 'error', title: 'Revaluation Failed', text: err?.error?.message || 'FX Revaluation failed. Please try again.', confirmButtonColor: '#0e4a60' });
        }
      });
    });
  }

  get selectedPeriodLabel(): string {
    return this.periods.find(p => p.id === this.selectedPeriodId)?.label ?? '';
  }

  fxDateCompact(date: string): string {
    return date ? date.replace(/-/g, '') : '';
  }
}
