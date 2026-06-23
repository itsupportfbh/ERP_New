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
    Swal.fire({
      title: target ? 'Lock this period?' : 'Unlock this period?',
      text: target
        ? 'Users cannot post transactions while locked.'
        : 'Users can modify transactions again.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: target ? 'Lock' : 'Unlock',
      confirmButtonColor: '#0e4a60'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.isLocking = true;
      this.error = '';
      this.periodSvc.setLock(this.selectedPeriodId!, target).subscribe({
        next: s => {
          this.status = s;
          this.isLocking = false;
          Swal.fire('Success', `Period ${target ? 'locked' : 'unlocked'} successfully.`, 'success');
        },
        error: err => {
          this.isLocking = false;
          this.error = err?.error?.message || 'Failed to change lock status.';
        }
      });
    });
  }

  runFxRevaluation(): void {
    if (!this.selectedPeriodId || !this.fxRevalDate) {
      this.error = 'Please select a period and FX revaluation date.';
      return;
    }
    Swal.fire({
      title: 'Run FX Revaluation?',
      html: 'This will:<br>• Revalue all open AR/AP foreign currency balances<br>• Calculate Unrealized Gain / Loss<br>• Post GL Journal automatically',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Run',
      confirmButtonColor: '#0e4a60'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.isRunningFx = true;
      this.error = '';
      this.periodSvc.runFxReval({ periodId: this.selectedPeriodId!, fxDate: this.fxRevalDate }).subscribe({
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
          Swal.fire('Success', 'FX Revaluation completed successfully.', 'success');
        },
        error: err => {
          this.isRunningFx = false;
          this.error = err?.error?.message || 'FX Revaluation failed.';
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
