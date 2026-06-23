import { Component, OnInit } from '@angular/core';
import {
  PeriodCloseService,
  PeriodOption,
  PeriodStatus
} from '../../../main/financial/period-close-fx/period-close-fx.service';

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
  error = '';
  successMsg = '';
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
    this.error = '';
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
        this.error = err?.error?.message || 'Failed to load periods.';
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
    const msg = target
      ? 'Lock this period? Users cannot post transactions while locked.'
      : 'Unlock this period? Users can modify transactions again.';
    if (!confirm(msg)) return;
    this.isLocking = true;
    this.error = '';
    this.periodSvc.setLock(this.selectedPeriodId, target).subscribe({
      next: s => {
        this.status = s;
        this.isLocking = false;
        this.successMsg = `Period ${target ? 'locked' : 'unlocked'} successfully.`;
        setTimeout(() => this.successMsg = '', 3000);
      },
      error: err => {
        this.isLocking = false;
        this.error = err?.error?.message || 'Failed to change lock status.';
      }
    });
  }

  runFxRevaluation(): void {
    if (!this.selectedPeriodId || !this.fxRevalDate) {
      this.error = 'Please select a period and FX revaluation date.';
      return;
    }
    const msg = 'Run FX Revaluation?\n\nThis will:\n• Revalue all open AR/AP foreign currency balances\n• Calculate Unrealized Gain / Loss\n• Post GL Journal automatically';
    if (!confirm(msg)) return;
    this.isRunningFx = true;
    this.error = '';
    this.periodSvc.runFxReval({ periodId: this.selectedPeriodId, fxDate: this.fxRevalDate }).subscribe({
      next: (res: any) => {
        this.isRunningFx = false;
        const data = res?.data ?? res ?? {};
        const totalGain = Number(data.totalGain ?? 0);
        const totalLoss = Number(data.totalLoss ?? 0);
        this.lastRunResult = {
          runId: Number(data.runId ?? 0),
          fxDate: this.fxRevalDate,
          totalGain,
          totalLoss,
          net: totalGain - totalLoss
        };
        this.successMsg = 'FX Revaluation completed successfully.';
        setTimeout(() => this.successMsg = '', 5000);
      },
      error: err => {
        this.isRunningFx = false;
        this.error = err?.error?.message || 'FX Revaluation failed.';
      }
    });
  }

  get selectedPeriodLabel(): string {
    return this.periods.find(p => p.id === this.selectedPeriodId)?.label ?? '';
  }

  fxDateCompact(date: string): string {
    return date ? date.replace(/-/g, '') : '';
  }
}
