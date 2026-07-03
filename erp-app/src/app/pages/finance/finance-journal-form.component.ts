import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import Swal from 'sweetalert2';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TaxNamePipe } from '../../shared/pipes/tax-name.pipe';

interface JournalLine {
  ledgerId: number | null;
  lineDescription: string;
  debit: number | null;
  credit: number | null;
}

@Component({
  selector: 'erp-finance-journal-form',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedModule, MoneyPipe, TaxNamePipe],
  templateUrl: './finance-journal-form.component.html',
  styleUrls: ['./finance-journal-form.component.scss']
})
export class FinanceJournalFormComponent implements OnInit {
  journalDate = new Date().toISOString().substring(0, 10);
  description = '';

  accounts: { id: number; label: string }[] = [];
  lines: JournalLine[] = [];

  isRecurring = false;
  recurringFrequency = 'Monthly';
  recurringInterval = 1;
  recurringStartDate = '';
  recurringEndType: 'NoEnd' | 'EndByDate' | 'EndByCount' = 'NoEnd';
  recurringEndDate = '';
  recurringCount = 1;

  saving = false;
  error = '';
  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  constructor(private finance: FinanceService, private router: Router, private permissionService: PermissionService) {}

  ngOnInit(): void {
    this.addLine();
    this.addLine();
    this.loadAccounts();
    this.permissionService.getFunctionPermission(this.userId, 'journal').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  private loadAccounts(): void {
    this.finance.list({ list: '/ChartOfAccount/GetChartOfAccounts' }).subscribe({
      next: res => {
        const data = this.finance.unwrap(res).filter((a: any) => a.isActive !== false);
        this.accounts = data.map((a: any) => ({
          id: a.id ?? a.accountId ?? a.iD,
          label: [a.accountCode, a.accountName || a.headName].filter(Boolean).join(' – ')
        }));
      },
      error: () => { this.accounts = []; }
    });
  }

  get totalDebit(): number {
    return this.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  }

  get totalCredit(): number {
    return this.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
  }

  get isBalanced(): boolean {
    return this.totalDebit > 0 && Math.abs(this.totalDebit - this.totalCredit) < 0.001;
  }

  get hasValidLines(): boolean {
    return this.lines.some(l => l.ledgerId && ((l.debit || 0) > 0 || (l.credit || 0) > 0));
  }

  addLine(): void {
    this.lines.push({ ledgerId: null, lineDescription: this.description, debit: null, credit: null });
  }

  removeLine(i: number): void {
    if (this.lines.length > 1) this.lines.splice(i, 1);
  }

  onDebitChange(line: JournalLine): void {
    if ((line.debit || 0) !== 0) line.credit = null;
  }

  onCreditChange(line: JournalLine): void {
    if ((line.credit || 0) !== 0) line.debit = null;
  }

  onDescriptionChange(): void {
    this.lines.forEach(l => { l.lineDescription = this.description; });
  }

  submit(): void {
    if (!this.journalDate) {
      Swal.fire('Required', 'Journal date is required.', 'warning');
      return;
    }
    if (!this.hasValidLines) {
      Swal.fire('Required', 'Add at least one valid journal line with an account and amount.', 'warning');
      return;
    }
    if (!this.isBalanced) {
      Swal.fire('Not Balanced', 'Total debit and credit must be equal before submitting.', 'warning');
      return;
    }

    this.error = '';
    this.saving = true;

    const payload = {
      journalDate: this.journalDate,
      description: this.description,
      isRecurring: this.isRecurring,
      recurringFrequency: this.isRecurring ? this.recurringFrequency : null,
      recurringInterval: this.isRecurring ? this.recurringInterval : null,
      recurringStartDate: this.isRecurring ? (this.recurringStartDate || this.journalDate) : null,
      recurringEndType: this.isRecurring ? this.recurringEndType : null,
      recurringEndDate: this.isRecurring && this.recurringEndType === 'EndByDate' ? this.recurringEndDate : null,
      recurringCount: this.isRecurring && this.recurringEndType === 'EndByCount' ? this.recurringCount : null,
      lines: this.lines
        .filter(l => l.ledgerId && ((l.debit || 0) > 0 || (l.credit || 0) > 0))
        .map(l => ({
          accountId: l.ledgerId,
          description: l.lineDescription,
          debit: l.debit || 0,
          credit: l.credit || 0
        }))
    };

    this.finance.create({ create: '/Journal/create' }, payload).subscribe({
      next: () => {
        this.saving = false;
        Swal.fire('Success', 'Journal saved successfully.', 'success')
          .then(() => this.router.navigate(['/app/finance/journal']));
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message || 'Unable to save journal.';
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/app/finance/journal']);
  }
}
