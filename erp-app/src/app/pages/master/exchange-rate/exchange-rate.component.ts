import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

const blank = () => ({ fromCurrencyId: null as any, toCurrencyId: null as any, rate: null as number | null, rateDate: '' });

@Component({ selector: 'erp-exchange-rate', standalone: false, templateUrl: './exchange-rate.component.html', styleUrls: ['./exchange-rate.component.scss'] })
export class ExchangeRateComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  currencies: any[] = [];
  form = blank();

  constructor(private masterSvc: MasterService) {}

  ngOnInit(): void {
    this.load();
    this.masterSvc.getCurrencies().subscribe({ next: (res: any) => { this.currencies = res?.data || res || []; }, error: () => {} });
  }

  getCurrencyName(id: any): string {
    if (!id) return '?';
    const c = this.currencies.find(x => x.id === id || x.id === Number(id));
    return c ? (c.currencyCode || c.currencyName || c.name || '?') : (String(id));
  }

  load(): void { this.loading = true; this.masterSvc.getExchangeRates().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }

  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = blank(); this.message = ''; }

  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    const fromId = item.fromCurrencyId || this.currencies.find(c => (c.currencyCode || c.currencyName || c.name) === item.fromCurrency)?.id || null;
    const toId = item.toCurrencyId || this.currencies.find(c => (c.currencyCode || c.currencyName || c.name) === item.toCurrency)?.id || null;
    this.form = {
      fromCurrencyId: fromId,
      toCurrencyId: toId,
      rate: item.rate ?? null,
      rateDate: item.rateDate ? item.rateDate.substring(0, 10) : ''
    };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = blank(); }

  onSubmit(): void {
    if (!this.form.fromCurrencyId) { this.message = 'From Currency is required.'; this.isError = true; return; }
    const payload = { fromCurrencyId: this.form.fromCurrencyId, toCurrencyId: this.form.toCurrencyId, rate: this.form.rate, rateDate: this.form.rateDate };
    const obs = this.isEditMode ? this.masterSvc.updateExchangeRate(this.selectedId, payload) : this.masterSvc.createExchangeRate(payload);
    obs.subscribe({ next: () => { this.message = this.isEditMode ? 'Updated.' : 'Created.'; this.isError = false; this.cancel(); this.load(); }, error: () => { this.message = 'Save failed.'; this.isError = true; } });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteExchangeRate(this.itemToDelete.id).subscribe({ next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); }, error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; } });
  }
}
