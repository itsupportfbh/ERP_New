import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';

const accountTypes = [
  { id: 1, name: 'Checking' },
  { id: 2, name: 'Savings' },
  { id: 3, name: 'Current' },
  { id: 4, name: 'Other' }
];

const blank = {
  bankName: '',
  accountName: '',
  accountNumber: '',
  accountTypeId: null as number | null,
  branch: '',
  ifscSwift: '',
  routingNumber: '',
  currencyId: null as number | null,
  countryId: null as number | null,
  budgetLineId: null as number | null,
  primaryContact: '',
  contactEmail: '',
  contactPhone: '',
  address: ''
};

@Component({ selector: 'erp-bank', standalone: false, templateUrl: './bank.component.html', styleUrls: ['./bank.component.scss'] })
export class BankComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  showResultPopup = false; popupIsSuccess = false; popupMessage = '';
  currencies: any[] = []; countries: any[] = []; budgetLines: any[] = []; accountTypes = accountTypes;
  searchText = ''; pageSize = 10; sortField = ''; sortAsc = true;
  form = { ...blank };
  permission: FunctionPermission;
  isPermissionLoaded = false;
  userId: number = 0;
  functionId = 'bank';

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

  constructor(private masterSvc: MasterService, private permissionService: PermissionService) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void {
    this.loadPermission();
    this.masterSvc.getCurrencies().subscribe({ next: (res: any) => { this.currencies = res?.data || res || []; }, error: () => {} });
    this.masterSvc.getCountries().subscribe({ next: (res: any) => { this.countries = res?.data || res || []; }, error: () => {} });
    this.masterSvc.getChartOfAccounts().subscribe({
      next: (res: any) => {
        const all = (res?.data || res || []).filter((x: any) => x.isActive !== false);
        this.budgetLines = all.map((x: any) => ({
          id: Number(x.id),
          label: `${x.headCode || x.code || x.id} - ${x.headName || x.name || 'Head'}`
        }));
      },
      error: () => {}
    });
  }

  load(): void { this.loading = true; this.masterSvc.getBanks().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }
  applyFilter(): void {}
  sortBy(field: string): void { if (this.sortField === field) { this.sortAsc = !this.sortAsc; } else { this.sortField = field; this.sortAsc = true; } }

  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { ...blank }; this.message = ''; }

  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    this.form = {
      bankName: item.bankName || '',
      accountName: item.accountHolderName || item.accountName || '',
      accountNumber: String(item.accountNumber || item.accountNo || ''),
      accountTypeId: item.accountTypeId || item.accountType || null,
      branch: item.branch || item.branchName || '',
      ifscSwift: item.ifscSwift || item.ifsc || item.swift || '',
      routingNumber: item.routingCode || item.routingNumber || item.routing || '',
      currencyId: item.currencyId || null,
      countryId: item.countryId || null,
      budgetLineId: item.budgetLineId || null,
      primaryContact: item.primaryContact || '',
      contactEmail: item.contactEmail || item.email || '',
      contactPhone: item.contactPhone || item.contactNo || '',
      address: item.address || ''
    };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { ...blank }; }

  onSubmit(): void {
    this.message = '';
    this.isError = false;
    if (!this.form.bankName?.trim()) { this.message = 'Bank Name is required.'; this.isError = true; return; }
    if (!this.form.accountName?.trim()) { this.message = 'Account Holder Name is required.'; this.isError = true; return; }
    if (!this.form.accountNumber?.trim()) { this.message = 'Account Number is required.'; this.isError = true; return; }
    if (!this.form.accountTypeId) { this.message = 'Account Type is required.'; this.isError = true; return; }
    if (!this.form.currencyId) { this.message = 'Currency is required.'; this.isError = true; return; }
    if (!this.form.countryId) { this.message = 'Country is required.'; this.isError = true; return; }
    if (!this.form.contactEmail?.trim()) { this.message = 'Contact Email is required.'; this.isError = true; return; }
    if (!this.form.budgetLineId) { this.message = 'Ledger Account (Ledger Name) is required. Please select a ledger from the dropdown.'; this.isError = true; return; }

    const rawAccNo = this.form.accountNumber.trim().replace(/\D/g, '');
    const accountNo = rawAccNo ? Number(rawAccNo) : 0;

    const payload = {
      bankName: this.form.bankName.trim(),
      accountHolderName: this.form.accountName.trim(),
      accountNo,
      accountType: Number(this.form.accountTypeId),
      branch: this.form.branch?.trim() || '',
      ifsc: this.form.ifscSwift?.trim() || '',
      routing: this.form.routingNumber?.trim() || '',
      currencyId: Number(this.form.currencyId),
      countryId: Number(this.form.countryId),
      budgetLineId: Number(this.form.budgetLineId),
      primaryContact: this.form.primaryContact?.trim() || '',
      email: this.form.contactEmail?.trim() || '',
      contactNo: this.form.contactPhone?.trim() || '',
      address: this.form.address?.trim() || ''
    };

    const obs = this.isEditMode ? this.masterSvc.updateBank(this.selectedId, payload) : this.masterSvc.createBank(payload);
    obs.subscribe({ next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } }, error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; } });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteBank(this.itemToDelete.id).subscribe({ next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } }, error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; } });
  }

  loadPermission(): void {
    if (!this.userId || this.userId <= 0) {
      this.permission = this.permissionService.getEmptyPermission(this.functionId);
      this.isPermissionLoaded = true;
      return;
    }
    this.permissionService.getFunctionPermission(this.userId, this.functionId).subscribe({
      next: (res: FunctionPermission) => {
        this.permission = res || this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
        this.load();
      },
      error: () => {
        this.permission = this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
        this.load();
      }
    });
  }
  canCreate(): boolean { return this.permissionService.hasCreate(this.permission); }
  canEdit(): boolean { return this.permissionService.hasEdit(this.permission); }
  canDelete(): boolean { return this.permissionService.hasDelete(this.permission); }
}
