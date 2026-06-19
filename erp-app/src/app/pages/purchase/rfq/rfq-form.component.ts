import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';

interface RfqSupplier {
  name: string;
  email: string;
  phone: string;
}

interface RfqItem {
  itemId: number | null;
  itemName: string;
  quantity: number | null;
  uomId: number | null;
  remarks: string;
}

interface QuoteEntry {
  supplierIndex: number;
  itemIndex: number;
  price: number | null;
}

interface WinnerLine {
  itemIndex: number;
  itemName: string;
  quantity: number;
  bestSupplierIndex: number;
  bestSupplierName: string;
  bestPrice: number;
  amount: number;
}

@Component({
  selector: 'erp-rfq-form',
  standalone: false,
  templateUrl: './rfq-form.component.html',
  styleUrls: ['./rfq-form.component.scss']
})
export class RfqFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  activeTab: 'setup' | 'quotes' | 'winners' = 'setup';
  loading = false;
  saving = false;
  sending = false;
  error = '';
  successMsg = '';

  validUntil = '';
  sendVia: 'Email' | 'WhatsApp' = 'Email';

  suppliers: RfqSupplier[] = [];
  items: RfqItem[] = [];
  quotes: QuoteEntry[] = [];
  winners: WinnerLine[] = [];

  itemOptions: any[] = [];
  uomOptions: any[] = [];

  sendViaOptions = [
    { label: 'Email', value: 'Email' },
    { label: 'WhatsApp', value: 'WhatsApp' }
  ];

  loginUserId = Number(localStorage.getItem('id')) || null;
  companyId = Number(localStorage.getItem('companyId')) || null;

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    this.loadLookups();
  }

  loadLookups(): void {
    this.svc.getItems().subscribe(r =>
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({ label: `${i.itemCode ?? ''} - ${i.itemName ?? i.name}`, value: i.id, raw: i })));
    this.svc.getUOMs().subscribe(r =>
      this.uomOptions = this.svc.unwrap(r).map((u: any) => ({ label: u.uomName ?? u.name, value: u.id })));
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getRfqById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.validUntil = d.validUntil ? d.validUntil.substring(0, 10) : '';
        this.sendVia = d.sendVia ?? 'Email';
        this.suppliers = (d.suppliers ?? []).map((s: any) => ({ name: s.name, email: s.email, phone: s.phone }));
        this.items = (d.items ?? []).map((i: any) => ({ itemId: i.itemId, itemName: i.itemName, quantity: i.quantity, uomId: i.uomId, remarks: i.remarks }));
        this.quotes = d.quotes ?? [];
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  addSupplier(): void { this.suppliers.push({ name: '', email: '', phone: '' }); }
  removeSupplier(i: number): void { this.suppliers.splice(i, 1); }

  addItem(): void { this.items.push({ itemId: null, itemName: '', quantity: null, uomId: null, remarks: '' }); }
  removeItem(i: number): void { this.items.splice(i, 1); }

  onItemSelect(item: RfqItem): void {
    const found = this.itemOptions.find(o => o.value === item.itemId);
    if (found) item.itemName = found.raw?.itemName ?? found.label;
  }

  getQuotePrice(sIdx: number, iIdx: number): number | null {
    return this.quotes.find(q => q.supplierIndex === sIdx && q.itemIndex === iIdx)?.price ?? null;
  }

  setQuotePrice(sIdx: number, iIdx: number, val: number | null): void {
    const existing = this.quotes.find(q => q.supplierIndex === sIdx && q.itemIndex === iIdx);
    if (existing) { existing.price = val; }
    else { this.quotes.push({ supplierIndex: sIdx, itemIndex: iIdx, price: val }); }
  }

  calculateWinners(): void {
    this.winners = [];
    this.items.forEach((item, iIdx) => {
      let bestPrice: number | null = null;
      let bestSIdx = -1;
      this.suppliers.forEach((_, sIdx) => {
        const p = this.getQuotePrice(sIdx, iIdx);
        if (p !== null && (bestPrice === null || p < bestPrice)) {
          bestPrice = p;
          bestSIdx = sIdx;
        }
      });
      if (bestSIdx >= 0 && bestPrice !== null) {
        this.winners.push({
          itemIndex: iIdx,
          itemName: item.itemName || this.getItemLabel(item.itemId),
          quantity: item.quantity ?? 0,
          bestSupplierIndex: bestSIdx,
          bestSupplierName: this.suppliers[bestSIdx].name,
          bestPrice,
          amount: (item.quantity ?? 0) * bestPrice
        });
      }
    });
    this.activeTab = 'winners';
  }

  get winnerTotal(): number {
    return this.winners.reduce((s, w) => s + w.amount, 0);
  }

  save(): void {
    this.saving = true;
    this.error = '';
    const payload = {
      validUntil: this.validUntil,
      sendVia: this.sendVia,
      suppliers: this.suppliers,
      items: this.items,
      quotes: this.quotes,
      companyId: this.companyId,
      createdBy: this.loginUserId,
      updatedBy: this.loginUserId
    };

    const obs$ = this.isEdit
      ? this.svc.updateRfq(this.id!, payload)
      : this.svc.createRfq(payload);

    obs$.subscribe({
      next: res => {
        this.saving = false;
        const d = this.svc.unwrapOne(res);
        if (!this.isEdit && d.id) { this.id = d.id; this.isEdit = true; }
        this.successMsg = 'RFQ saved successfully.';
        setTimeout(() => this.successMsg = '', 3000);
      },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  send(): void {
    if (!this.id) { this.error = 'Please save the RFQ first.'; return; }
    this.sending = true;
    this.error = '';
    this.svc.sendRfq({ id: this.id, sendVia: this.sendVia, suppliers: this.suppliers }).subscribe({
      next: res => {
        this.sending = false;
        const d = this.svc.unwrapOne(res);
        this.successMsg = `RFQ sent: ${d.sentCount ?? 0} sent, ${d.failedCount ?? 0} failed.`;
        setTimeout(() => this.successMsg = '', 5000);
      },
      error: err => { this.sending = false; this.error = err?.error?.message ?? 'Send failed.'; }
    });
  }

  back(): void { this.router.navigate(['/app/purchase/rfq']); }

  getItemLabel(id: any): string {
    return this.itemOptions.find(o => o.value === id)?.label ?? '—';
  }

  getLabel(opts: any[], val: any): string {
    return opts.find(o => o.value === val)?.label ?? '—';
  }

  get today(): string { return new Date().toISOString().substring(0, 10); }
  get title(): string { return this.isEdit ? 'Edit RFQ' : 'New RFQ'; }
}
