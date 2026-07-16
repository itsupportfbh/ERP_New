import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';
import { SharedModule } from 'app/shared/shared.module';

interface AccountOption { id: any; label: string; }

const blank = () => ({
  assetCode: '',
  assetName: '',
  assetCategory: '',
  acquisitionDate: '',
  cost: null as number | null,
  salvageValue: 0 as number | null,
  usefulLifeMonths: null as number | null,
  assetAccountId: null as any,
  accumDepAccountId: null as any,
  depExpenseAccountId: null as any,
  remarks: ''
});

@Component({
  selector: 'erp-fixed-assets',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './fixed-assets.component.html',
  styleUrls: ['./fixed-assets.component.scss']
})
export class FixedAssetsComponent implements OnInit {
  items: any[] = [];
  loading = false;
  isFormVisible = false;
  isEditMode = false;
  selectedId: any = null;
  message = '';
  isError = false;
  search = '';

  showDeleteModal = false;
  itemToDelete: any = null;
  showResultPopup = false;
  popupIsSuccess = false;
  popupMessage = '';

  form = blank();
  accounts: AccountOption[] = [];

  // Run depreciation modal
  showDepModal = false;
  depAsOfDate = '';
  depRunning = false;

  // Post acquisition modal
  showAcqModal = false;
  acqRow: any = null;
  acqFundingAccountId: any = null;
  acqPosting = false;

  permission: FunctionPermission;
  isPermissionLoaded = false;
  userId = 0;
  functionId = 'fixed-asset';

  constructor(private masterSvc: MasterService, private permissionService: PermissionService) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void {
    this.loadAccounts();
    this.loadPermission();
  }

  // ---- data ----
  load(): void {
    this.loading = true;
    this.masterSvc.getFixedAssets().subscribe({
      next: (res: any) => { this.items = res?.data || res || []; this.loading = false; },
      error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; }
    });
  }

  loadAccounts(): void {
    this.masterSvc.getChartOfAccounts().subscribe({
      next: (res: any) => {
        const data = (res?.data || res || []).filter((a: any) => a.isActive !== false);
        this.accounts = data.map((a: any) => ({
          id: a.id ?? a.accountId ?? a.iD,
          label: [a.accountCode, a.accountName || a.headName].filter(Boolean).join(' - ')
        }));
      },
      error: () => { this.accounts = []; }
    });
  }

  get filteredItems(): any[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.items;
    return this.items.filter(i =>
      String(i.assetName || '').toLowerCase().includes(q) ||
      String(i.assetCode || '').toLowerCase().includes(q) ||
      String(i.assetCategory || '').toLowerCase().includes(q));
  }

  accountLabel(id: any): string {
    if (id == null || id === '') return '';
    return this.accounts.find(a => String(a.id) === String(id))?.label || '';
  }

  // ---- form ----
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = blank(); this.message = ''; }

  edit(item: any): void {
    this.isFormVisible = true;
    this.isEditMode = true;
    this.selectedId = item.id;
    this.form = {
      assetCode: item.assetCode || '',
      assetName: item.assetName || '',
      assetCategory: item.assetCategory || '',
      acquisitionDate: item.acquisitionDate ? String(item.acquisitionDate).substring(0, 10) : '',
      cost: item.cost ?? null,
      salvageValue: item.salvageValue ?? 0,
      usefulLifeMonths: item.usefulLifeMonths ?? null,
      assetAccountId: item.assetAccountId ?? null,
      accumDepAccountId: item.accumDepAccountId ?? null,
      depExpenseAccountId: item.depExpenseAccountId ?? null,
      remarks: item.remarks || ''
    };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = blank(); }

  onSubmit(): void {
    if (!this.form.assetName?.trim()) { this.message = 'Asset Name is required.'; this.isError = true; return; }
    if (!this.form.acquisitionDate) { this.message = 'Acquisition Date is required.'; this.isError = true; return; }
    if (this.form.cost == null || isNaN(Number(this.form.cost))) { this.message = 'Cost is required.'; this.isError = true; return; }
    if (this.form.usefulLifeMonths == null || isNaN(Number(this.form.usefulLifeMonths))) { this.message = 'Useful Life (months) is required.'; this.isError = true; return; }

    const payload = {
      ...this.form,
      cost: Number(this.form.cost),
      salvageValue: this.form.salvageValue == null ? 0 : Number(this.form.salvageValue),
      usefulLifeMonths: Number(this.form.usefulLifeMonths)
    };

    const obs = this.isEditMode
      ? this.masterSvc.updateFixedAsset(this.selectedId, payload)
      : this.masterSvc.createFixedAsset(payload);

    obs.subscribe({
      next: (res: any) => {
        this.popupIsSuccess = res?.isSuccess !== false;
        this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.');
        this.showResultPopup = true;
        if (res?.isSuccess !== false) { this.cancel(); this.load(); }
      },
      error: (err: any) => {
        this.popupIsSuccess = false;
        this.popupMessage = err?.error?.message || 'Save failed. Please try again.';
        this.showResultPopup = true;
      }
    });
  }

  // ---- delete ----
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteFixedAsset(this.itemToDelete.id).subscribe({
      next: (res: any) => {
        this.showDeleteModal = false; this.itemToDelete = null;
        this.popupIsSuccess = res?.isSuccess !== false;
        this.popupMessage = res?.message || 'Deleted successfully.';
        this.showResultPopup = true;
        if (res?.isSuccess !== false) { this.load(); }
      },
      error: (err: any) => {
        this.showDeleteModal = false;
        this.popupIsSuccess = false;
        this.popupMessage = err?.error?.message || 'Delete failed. Please try again.';
        this.showResultPopup = true;
      }
    });
  }

  // ---- run depreciation ----
  openDepModal(): void {
    this.depAsOfDate = new Date().toISOString().substring(0, 10);
    this.showDepModal = true;
  }
  closeDepModal(): void { this.showDepModal = false; }
  runDepreciation(): void {
    if (!this.depAsOfDate) { return; }
    this.depRunning = true;
    this.masterSvc.runFixedAssetDepreciation(this.depAsOfDate).subscribe({
      next: (res: any) => {
        this.depRunning = false;
        this.showDepModal = false;
        this.popupIsSuccess = res?.isSuccess !== false;
        this.popupMessage = res?.message || 'Depreciation run completed.';
        this.showResultPopup = true;
        this.load();
      },
      error: (err: any) => {
        this.depRunning = false;
        this.showDepModal = false;
        this.popupIsSuccess = false;
        this.popupMessage = err?.error?.message || 'Depreciation run failed. Please try again.';
        this.showResultPopup = true;
      }
    });
  }

  // ---- post acquisition ----
  openAcqModal(item: any): void {
    this.acqRow = item;
    this.acqFundingAccountId = null;
    this.showAcqModal = true;
  }
  closeAcqModal(): void { this.showAcqModal = false; this.acqRow = null; }
  postAcquisition(): void {
    if (!this.acqRow || this.acqFundingAccountId == null) { return; }
    this.acqPosting = true;
    this.masterSvc.postFixedAssetAcquisition(this.acqRow.id, this.acqFundingAccountId).subscribe({
      next: (res: any) => {
        this.acqPosting = false;
        this.showAcqModal = false;
        this.acqRow = null;
        this.popupIsSuccess = res?.isSuccess !== false;
        this.popupMessage = res?.message || 'Acquisition posted successfully.';
        this.showResultPopup = true;
        this.load();
      },
      error: (err: any) => {
        this.acqPosting = false;
        this.showAcqModal = false;
        this.popupIsSuccess = false;
        this.popupMessage = err?.error?.message || 'Posting failed. Please try again.';
        this.showResultPopup = true;
      }
    });
  }

  // ---- permission ----
  loadPermission(): void {
    if (!this.userId || this.userId <= 0) {
      this.permission = this.permissionService.getEmptyPermission(this.functionId);
      this.isPermissionLoaded = true;
      this.load();
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

  /** No permId is wired for Fixed Assets in the menu (always shown), so when the
   *  function has no configured permission row we fall back to full access. */
  private get unconfigured(): boolean {
    const p = this.permission;
    return !(p.view || p.create || p.edit || p.delete);
  }
  canCreate(): boolean { return this.permissionService.hasCreate(this.permission) || this.unconfigured; }
  canEdit(): boolean { return this.permissionService.hasEdit(this.permission) || this.unconfigured; }
  canDelete(): boolean { return this.permissionService.hasDelete(this.permission) || this.unconfigured; }
}
