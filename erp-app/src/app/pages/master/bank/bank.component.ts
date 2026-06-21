import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

const blank = { bankName: '', accountHolderName: '', accountNumber: '', accountType: '', branch: '', ifscSwift: '', routingCode: '', currencyId: null as any, countryId: null as any, ledgerName: '', primaryContact: '', contactEmail: '', contactPhone: '', address: '' };

@Component({ selector: 'erp-bank', standalone: false, templateUrl: './bank.component.html', styleUrls: ['./bank.component.scss'] })
export class BankComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  currencies: any[] = []; countries: any[] = [];
  searchText = ''; pageSize = 10; sortField = ''; sortAsc = true;
  form = { ...blank };

  get filteredItems(): any[] {
    let list = this.items;
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      list = list.filter(i => Object.values(i).join(' ').toLowerCase().includes(q));
    }
    if (this.sortField) {
      list = [...list].sort((a, b) => {
        const va = (a[this.sortField] || '').toString().toLowerCase();
        const vb = (b[this.sortField] || '').toString().toLowerCase();
        return this.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }

  get pagedItems(): any[] { return this.filteredItems.slice(0, this.pageSize); }

  constructor(private masterSvc: MasterService) {}

  ngOnInit(): void {
    this.load();
    this.masterSvc.getCurrencies().subscribe({ next: (res: any) => { this.currencies = res?.data || res || []; }, error: () => {} });
    this.masterSvc.getCountries().subscribe({ next: (res: any) => { this.countries = res?.data || res || []; }, error: () => {} });
  }

  load(): void { this.loading = true; this.masterSvc.getBanks().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }
  applyFilter(): void {}
  sortBy(field: string): void { if (this.sortField === field) { this.sortAsc = !this.sortAsc; } else { this.sortField = field; this.sortAsc = true; } }

  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { ...blank }; this.message = ''; }

  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    this.form = {
      bankName: item.bankName || '',
      accountHolderName: item.accountHolderName || item.accountName || '',
      accountNumber: item.accountNumber || '',
      accountType: item.accountType || '',
      branch: item.branch || item.branchName || '',
      ifscSwift: item.ifscSwift || item.ifsc || item.swift || '',
      routingCode: item.routingCode || item.routingNumber || '',
      currencyId: item.currencyId || null,
      countryId: item.countryId || null,
      ledgerName: item.ledgerName || '',
      primaryContact: item.primaryContact || '',
      contactEmail: item.contactEmail || item.email || '',
      contactPhone: item.contactPhone || '',
      address: item.address || ''
    };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { ...blank }; }

  onSubmit(): void {
    if (!this.form.bankName?.trim()) { this.message = 'Bank Name is required.'; this.isError = true; return; }
    const obs = this.isEditMode ? this.masterSvc.updateBank(this.selectedId, this.form) : this.masterSvc.createBank(this.form);
    obs.subscribe({ next: () => { this.message = this.isEditMode ? 'Updated.' : 'Created.'; this.isError = false; this.cancel(); this.load(); }, error: () => { this.message = 'Save failed.'; this.isError = true; } });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteBank(this.itemToDelete.id).subscribe({ next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); }, error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; } });
  }
}
