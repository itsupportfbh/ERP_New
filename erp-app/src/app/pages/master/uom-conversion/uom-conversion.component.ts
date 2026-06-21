import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

@Component({ selector: 'erp-uom-conversion', standalone: false, templateUrl: './uom-conversion.component.html', styleUrls: ['./uom-conversion.component.scss'] })
export class UomConversionComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  showResultPopup = false; popupIsSuccess = false; popupMessage = '';
  uoms: any[] = [];
  form: { fromUomId: any; toUomId: any; factor: number | null; description: string } = { fromUomId: null, toUomId: null, factor: null, description: '' };
  constructor(private masterSvc: MasterService) {}
  ngOnInit(): void {
    this.load();
    this.masterSvc.getUoms().subscribe({ next: (res: any) => { this.uoms = res?.data || res || []; }, error: () => {} });
  }
  load(): void { this.loading = true; this.masterSvc.getUomConversions().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { fromUomId: null, toUomId: null, factor: null, description: '' }; this.message = ''; }
  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    const fromU = this.uoms.find(u => (u.uomName || u.name) === item.fromUom);
    const toU = this.uoms.find(u => (u.uomName || u.name) === item.toUom);
    this.form = { fromUomId: item.fromUomId || (fromU ? fromU.id : null), toUomId: item.toUomId || (toU ? toU.id : null), factor: item.factor ?? item.conversionFactor ?? null, description: item.description || '' };
    this.message = '';
  }
  getUomName(id: any): string {
    if (!id) return '?';
    const u = this.uoms.find(x => x.id === id || x.id === Number(id));
    return u ? (u.uomCode || u.uomName || u.name || '?') : String(id);
  }
  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { fromUomId: null, toUomId: null, factor: null, description: '' }; }
  onSubmit(): void {
    if (!this.form.fromUomId) { this.message = 'From UOM is required.'; this.isError = true; return; }
    const payload: any = { fromUomId: this.form.fromUomId, toUomId: this.form.toUomId, factor: this.form.factor, description: this.form.description };
    const obs = this.isEditMode ? this.masterSvc.updateUomConversion(this.selectedId, payload) : this.masterSvc.createUomConversion(payload);
    obs.subscribe({ next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } }, error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; } });
  }
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteUomConversion(this.itemToDelete.id).subscribe({ next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } }, error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; } });
  }
}
