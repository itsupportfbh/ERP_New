import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import Swal from 'sweetalert2';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

@Component({
  selector: 'erp-finance-opening-balance',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './finance-opening-balance.component.html',
  styleUrls: ['./finance-opening-balance.component.scss']
})
export class FinanceOpeningBalanceComponent implements OnInit {
  openingBalances: any[] = [];
  filteredBalances: any[] = [];
  coaList: Array<{ id: number; label: string }> = [];

  showForm = false;
  editMode = false;
  saving = false;
  loading = false;
  search = '';
  message = '';
  error = '';

  form: { id: number; budgetLineId: number | null; openingBalanceAmount: number | null } = {
    id: 0, budgetLineId: null, openingBalanceAmount: null
  };

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  constructor(private finance: FinanceService, private permissionService: PermissionService) {}

  ngOnInit(): void {
    this.loadCoa();
    this.loadAll();
    this.permissionService.getFunctionPermission(this.userId, 'ledger').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  loadAll(): void {
    this.loading = true;
    this.finance.list({ list: '/OpeningBalance/getAll' }).subscribe({
      next: res => {
        this.openingBalances = this.finance.unwrap(res);
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.openingBalances = []; this.filteredBalances = []; this.loading = false; this.error = 'Opening balances unavailable.'; }
    });
  }

  private loadCoa(): void {
    this.finance.list({ list: '/ChartOfAccount/GetChartOfAccounts' }).subscribe({
      next: res => {
        const raw = this.finance.unwrap(res).filter((x: any) => x.isActive !== false);
        this.coaList = raw.map((h: any) => ({
          id: Number(h.id ?? h.iD ?? h.headId),
          label: this.buildPath(h, raw)
        }));
      },
      error: () => { this.coaList = []; }
    });
  }

  private buildPath(item: any, all: any[]): string {
    let path = item.headName ?? item.accountName ?? item.name ?? String(item.id);
    let current = all.find((x: any) => x.headCode === item.parentHead);
    while (current) {
      path = `${current.headName ?? current.accountName} >> ${path}`;
      current = all.find((x: any) => x.headCode === current.parentHead);
    }
    return path;
  }

  getAccountLabel(budgetLineId: number | null | undefined): string {
    if (!budgetLineId) return '—';
    return this.coaList.find(c => c.id === Number(budgetLineId))?.label ?? String(budgetLineId);
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filteredBalances = q
      ? this.openingBalances.filter(r => {
          const label = this.getAccountLabel(r.budgetLineId).toLowerCase();
          return label.includes(q) || String(r.openingBalanceAmount ?? '').includes(q);
        })
      : [...this.openingBalances];
  }

  openCreate(): void {
    this.form = { id: 0, budgetLineId: null, openingBalanceAmount: null };
    this.editMode = false;
    this.showForm = true;
    this.message = '';
    this.error = '';
  }

  openEdit(item: any): void {
    this.form = {
      id: item.id,
      budgetLineId: item.budgetLineId != null ? Number(item.budgetLineId) : null,
      openingBalanceAmount: Number(item.openingBalanceAmount ?? 0)
    };
    this.editMode = true;
    this.showForm = true;
    this.message = '';
    this.error = '';
  }

  cancelForm(): void {
    this.showForm = false;
  }

  save(): void {
    if (!this.form.budgetLineId) { Swal.fire({ icon: 'warning', title: 'Required', text: 'Please select a ledger account.', confirmButtonColor: '#16a34a' }); return; }
    if (!(Number(this.form.openingBalanceAmount) >= 0)) { Swal.fire({ icon: 'warning', title: 'Required', text: 'Opening balance amount is required.', confirmButtonColor: '#16a34a' }); return; }

    this.saving = true;
    this.error = '';
    const now = new Date().toISOString();
    const payload = {
      id: this.form.id,
      budgetLineId: this.form.budgetLineId,
      openingBalanceAmount: Number(this.form.openingBalanceAmount) || 0,
      createdBy: this.userId,
      createdDate: now,
      updatedBy: this.userId,
      updatedDate: now,
      isActive: true
    };

    const req$ = this.form.id === 0
      ? this.finance.create({ create: '/OpeningBalance/insert' }, payload)
      : this.finance.putBody('/OpeningBalance/update', payload);

    req$.subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.message = this.form.id === 0 ? 'Opening balance created.' : 'Opening balance updated.';
        this.loadAll();
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message || 'Unable to save opening balance.';
      }
    });
  }

  delete(item: any): void {
    Swal.fire({
      title: 'Delete this entry?',
      text: `${this.getAccountLabel(item.budgetLineId)} — ${item.openingBalanceAmount}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, delete it'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.finance.delete({ delete: '/OpeningBalance/Delete/' }, item.id).subscribe({
        next: () => { this.message = 'Entry deleted.'; this.loadAll(); },
        error: err => { this.error = err?.error?.message || 'Unable to delete entry.'; }
      });
    });
  }
}
