import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PurchaseService } from '../purchase.service';
import Swal from 'sweetalert2';

type TaxMode = 'Exclusive' | 'Inclusive' | 'Zero';

interface GrnHeader {
  id: number;
  grnNo: string;
  poId: number;
  poNo: string;
  supplierId: number;
  supplierName: string;
  currencyId: number | null;
  currencyName: string;
  fxRate: number;
  grnJson: any;
  poLines: any;
}

interface PinLine {
  itemId: number | null;
  itemName: string;
  locationId: number | null;
  poQty: number;
  grnQty: number;
  qty: number;
  unitPrice: number;
  discountPct: number;
  taxMode: TaxMode;
  lineTotal: number;
  taxAmt: number;
  lineGrandTotal: number;
  budgetLineId: number | null;
  dcNoteNo: string;
  remarks: string;
  matchStatus: 'OK' | 'Mismatch' | '';
}

@Component({
  selector: 'erp-supplier-invoice-form',
  standalone: false,
  templateUrl: './supplier-invoice-form.component.html',
  styleUrls: ['./supplier-invoice-form.component.scss']
})
export class SupplierInvoiceFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  posting = false;
  error = '';

  // Header
  invoiceNo = '';
  invoiceDate = new Date().toISOString().substring(0, 10);
  supplierId: number | null = null;
  supplierName = '';
  currencyId: number | null = null;
  currencyName = '';
  fxRate = 1;
  taxRate = 0;
  isPartial = false;
  isGlPosted = false;
  status = 'Draft';

  // GRN combobox state
  grnList: GrnHeader[] = [];
  grnFiltered: GrnHeader[] = [];
  grnOpen = false;
  grnSearch = '';
  selectedGrnIds: number[] = [];
  selectedGrnNos: string[] = [];

  // Lines
  lines: PinLine[] = [];

  // Dropdowns
  ledgerOptions: any[] = [];
  locationOptions: any[] = [];
  private itemLedgerMap = new Map<number, number>();     // itemId → budgetLineId
  private itemCategoryMap = new Map<number, number>();   // itemId → categoryId
  private categoryLedgerMap = new Map<number, number>(); // categoryId → purchaseParentHeadCode

  taxModeOptions = [
    { label: 'Exclusive', value: 'Exclusive' },
    { label: 'Inclusive', value: 'Inclusive' },
    { label: 'Zero',      value: 'Zero' }
  ];

  loginUserId = Number(localStorage.getItem('id')) || null;

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    else { this.loadGrnList(true); }
    this.loadLookups();
  }

  private applyOcrDraft(): void {
    const raw = sessionStorage.getItem('ocrPinDraft');
    if (!raw) return;
    sessionStorage.removeItem('ocrPinDraft');
    try {
      const draft = JSON.parse(raw);
      if (draft.invoiceNo) this.invoiceNo = draft.invoiceNo;
      if (draft.invoiceDate) this.invoiceDate = draft.invoiceDate.substring(0, 10);
      // Auto-select GRNs from draft
      const draftGrnIds: number[] = draft.grnIds ?? [];
      if (draftGrnIds.length) {
        const toSelect = this.grnList.filter(g => draftGrnIds.includes(Number(g.id)));
        toSelect.forEach(g => {
          if (!this.selectedGrnIds.includes(Number(g.id))) {
            this.selectedGrnIds.push(Number(g.id));
            this.selectedGrnNos.push(g.grnNo);
          }
        });
        const selectedGrns = this.grnList.filter(g => this.selectedGrnIds.includes(Number(g.id)));
        this.grnSearch = selectedGrns.map(x => x.grnNo).join(', ');
        if (selectedGrns.length > 0) {
          this.supplierName = selectedGrns[0].supplierName;
          this.supplierId = selectedGrns[0].supplierId;
          this.currencyId = selectedGrns[0].currencyId;
          this.currencyName = selectedGrns[0].currencyName;
          this.fxRate = selectedGrns[0].fxRate;
        }
        this.loadLinesWithPoFetch(selectedGrns);
      }
    } catch { /* ignore bad draft */ }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!(ev.target as HTMLElement).closest('.grn-combobox')) {
      this.grnOpen = false;
    }
  }

  loadLookups(): void {
    this.svc.getLocations().subscribe(r =>
      this.locationOptions = this.svc.unwrap(r).map((l: any) => ({
        label: l.locationName ?? l.name, value: l.id
      })));
    // Load COA first, then derive category → coaId mapping using headCode→id lookup
    this.svc.getChartOfAccounts().subscribe(r => {
      const list = this.svc.unwrap(r);
      this.ledgerOptions = list.map((c: any) => ({
        label: `${c.headCode ?? ''} ${c.headName ?? ''}`.trim(), value: c.id
      }));
      // headCode (e.g. 5001) → id (DB primary key) — needed to resolve category.purchaseParentHeadCode
      const headCodeToId = new Map<number, number>();
      list.forEach((c: any) => {
        if (c.headCode != null && c.id != null) headCodeToId.set(Number(c.headCode), Number(c.id));
      });
      this.svc.getCategories().subscribe(r2 =>
        (r2?.data || r2 || []).forEach((cat: any) => {
          const catId = cat.id ?? cat.iD;
          const headCode = cat.purchaseParentHeadCode ?? cat.PurchaseParentHeadCode;
          if (catId && headCode) {
            const coaId = headCodeToId.get(Number(headCode));
            if (coaId) this.categoryLedgerMap.set(Number(catId), coaId);
          }
        }));
    });
    this.svc.getItems().subscribe(r =>
      this.svc.unwrap(r).forEach((i: any) => {
        const id = i.id ?? i.iD;
        const ledger = i.budgetLineId ?? i.BudgetLineId;
        const catId = i.categoryId ?? i.CategoryId;
        if (id && ledger) this.itemLedgerMap.set(Number(id), Number(ledger));
        if (id && catId) this.itemCategoryMap.set(Number(id), Number(catId));
      }));
  }

  loadGrnList(applyOcr = false): void {
    this.svc.getAvailableGRNsForPin().subscribe({
      next: r => {
        this.grnList = this.svc.unwrap(r).map((g: any) => this.mapGrn(g));
        this.grnFiltered = [...this.grnList];
        if (applyOcr) this.applyOcrDraft();
      },
      error: () => {}
    });
  }

  loadGrnListForEdit(): void {
    this.svc.getAvailableGRNsForPinEdit(this.id!).subscribe({
      next: r => {
        this.grnList = this.svc.unwrap(r).map((g: any) => this.mapGrn(g));
        this.grnFiltered = [...this.grnList];
      },
      error: () => {}
    });
  }

  private mapGrn(g: any): GrnHeader {
    return {
      id: Number(g.id ?? g.ID ?? 0),
      grnNo: g.grnNo ?? g.GrnNo ?? g.GRNNo ?? '',
      poId: Number(g.poid ?? g.poId ?? g.POID ?? g.PoId ?? 0),
      poNo: String(g.poNo ?? g.PoNo ?? g.PONo ?? g.poid ?? g.POID ?? ''),
      supplierId: Number(g.supplierId ?? g.SupplierId ?? 0),
      supplierName: g.supplierName ?? g.SupplierName ?? '',
      currencyId: g.currencyId ?? g.CurrencyId ?? null,
      currencyName: g.currencyName ?? g.CurrencyName ?? '',
      fxRate: Number(g.fxRate ?? g.FxRate ?? 1),
      grnJson: g.gRNJson ?? g.GRNJson ?? g.grnJson ?? g.GrnJson,
      poLines: g.poLines ?? g.PoLines ?? g.poLinesJson ?? g.PoLinesJson
    };
  }

  onGrnFocus(): void {
    if (this.isGlPosted) return;
    this.grnFiltered = [...this.grnList];
    this.grnOpen = true;
  }

  onGrnSearch(e: any): void {
    if (this.isGlPosted) return;
    const q = (e?.target?.value ?? '').toLowerCase();
    this.grnSearch = q;
    this.grnFiltered = this.grnList.filter(g =>
      g.grnNo.toLowerCase().includes(q) ||
      g.poNo.toString().toLowerCase().includes(q) ||
      g.supplierName.toLowerCase().includes(q)
    );
    this.grnOpen = true;
  }

  isGrnSelected(id: number): boolean {
    return this.selectedGrnIds.includes(Number(id));
  }

  toggleGrn(g: GrnHeader): void {
    if (this.isGlPosted) return;
    const prev = [...this.selectedGrnIds];
    const gid = Number(g.id);
    const alreadySelected = prev.includes(gid);

    let newIds: number[];
    if (alreadySelected) {
      newIds = prev.filter(x => x !== gid);
    } else {
      // Validate same supplier
      const currentSelected = this.grnList.filter(x => prev.includes(Number(x.id)));
      if (currentSelected.length > 0) {
        const existingSupplier = currentSelected[0].supplierId;
        if (existingSupplier && g.supplierId && existingSupplier !== g.supplierId) {
          Swal.fire('Invalid', 'Multiple supplier GRNs cannot be combined into one invoice.', 'warning');
          return;
        }
        // Validate same PO (3-way match requires single PO)
        const existingPoId = currentSelected[0].poId;
        if (existingPoId && g.poId && existingPoId !== g.poId) {
          Swal.fire('Invalid', 'GRNs from different POs cannot be combined into one invoice (3-way match).', 'warning');
          return;
        }
      }
      newIds = [...prev, gid];
    }

    this.selectedGrnIds = newIds;
    const selectedGrns = this.grnList.filter(x => newIds.includes(Number(x.id)));
    this.selectedGrnNos = selectedGrns.map(x => x.grnNo);

    if (selectedGrns.length > 0) {
      this.supplierName = selectedGrns[0].supplierName;
      this.supplierId = selectedGrns[0].supplierId;
      this.currencyId = selectedGrns[0].currencyId;
      this.currencyName = selectedGrns[0].currencyName;
      this.fxRate = selectedGrns[0].fxRate;
    } else {
      this.supplierName = '';
      this.supplierId = null;
      this.currencyId = null;
      this.currencyName = '';
      this.fxRate = 1;
    }

    this.grnSearch = selectedGrns.map(x => x.grnNo).join(', ');
    this.loadLinesWithPoFetch(selectedGrns);
  }

  removeGrnByNo(grnNo: string): void {
    if (this.isGlPosted) return;
    const toRemove = this.grnList.find(x => x.grnNo === grnNo);
    if (!toRemove) return;
    const newIds = this.selectedGrnIds.filter(x => x !== Number(toRemove.id));
    this.selectedGrnIds = newIds;
    const selectedGrns = this.grnList.filter(x => newIds.includes(Number(x.id)));
    this.selectedGrnNos = selectedGrns.map(x => x.grnNo);
    this.grnSearch = selectedGrns.map(x => x.grnNo).join(', ');
    if (selectedGrns.length > 0) {
      this.supplierName = selectedGrns[0].supplierName;
      this.supplierId = selectedGrns[0].supplierId;
    } else {
      this.supplierName = '';
      this.supplierId = null;
    }
    this.loadLinesWithPoFetch(selectedGrns);
  }

  private loadLinesWithPoFetch(grns: GrnHeader[]): void {
    if (!grns.length) { this.lines = []; return; }
    // GRNs that have a PO link but no poLines loaded yet
    const needFetch = grns.filter(g => g.poId > 0 && !this.safeJsonArray(g.poLines).length);
    if (!needFetch.length) { this.loadLinesFromGrns(grns); return; }

    const uniquePoIds = [...new Set(needFetch.map(g => g.poId))];
    const fetches = uniquePoIds.map(poId =>
      this.svc.getPurchaseOrderById(poId).pipe(catchError(() => of(null)))
    );
    forkJoin(fetches).subscribe(results => {
      results.forEach((res: any, idx: number) => {
        if (!res) return;
        const po = this.svc.unwrapOne(res);
        const poId = uniquePoIds[idx];
        const rawLines = po?.poLines ?? po?.PoLines ?? null;
        if (rawLines) grns.filter(g => g.poId === poId).forEach(g => g.poLines = rawLines);
      });
      this.loadLinesFromGrns(grns);
    });
  }

  private loadLinesFromGrns(grns: GrnHeader[]): void {
    if (!grns.length) { this.lines = []; return; }

    const merged: PinLine[] = [];

    grns.forEach(g => {
      const grnItems = this.safeJsonArray(g.grnJson);
      const poItems = this.safeJsonArray(g.poLines);

      grnItems.forEach((x: any) => {
        const itemId = x.itemId ?? null;
        const itemName = x.itemName ?? x.itemSearch ?? x.item ?? '';
        const grnQty = Number(x.qtyReceived ?? x.qty ?? 0);
        const unitPrice = Number(x.unitPrice ?? x.price ?? 0);

        // Find matching PO line for PO qty (try by itemId, itemCode, or itemName)
        const poLine = poItems.find((p: any) =>
          (itemId && Number(p.itemId) === Number(itemId)) ||
          (x.itemCode && p.itemCode === x.itemCode) ||
          (itemName && (p.itemName === itemName || p.itemSearch === itemName || p.item === itemName))
        );
        const poQty = poLine ? Number(poLine.qty ?? poLine.quantity ?? 0) : 0;
        const itemLedger = itemId ? (this.itemLedgerMap.get(Number(itemId)) || null) : null;
        const catId = itemId ? (this.itemCategoryMap.get(Number(itemId)) || null) : null;
        const catLedger = catId ? (this.categoryLedgerMap.get(catId) || null) : null;
        const itemDefault = itemLedger || catLedger || null;
        const ledgerId = x.budgetLineId ?? x.BudgetLineId ?? poLine?.budgetLineId ?? poLine?.BudgetLineId ?? itemDefault;

        // Group same item
        const existing = merged.find(pl =>
          pl.itemId === itemId && pl.unitPrice === unitPrice
        );
        if (existing) {
          existing.grnQty += grnQty;
          existing.qty += grnQty;
          existing.poQty += poQty;
          this.recalcLine(existing);
          existing.matchStatus = this.calcMatchStatus(existing.poQty, existing.grnQty, existing.qty);
          return;
        }

        const line: PinLine = {
          itemId,
          itemName,
          locationId: null,
          poQty,
          grnQty,
          qty: grnQty,
          unitPrice,
          discountPct: 0,
          taxMode: 'Exclusive',
          lineTotal: 0,
          taxAmt: 0,
          lineGrandTotal: 0,
          budgetLineId: ledgerId,
          dcNoteNo: '',
          remarks: '',
          matchStatus: ''
        };
        this.recalcLine(line);
        line.matchStatus = this.calcMatchStatus(poQty, grnQty, grnQty);
        merged.push(line);
      });
    });

    this.lines = merged;
  }

  private calcMatchStatus(poQty: number, grnQty: number, invQty: number): 'OK' | 'Mismatch' | '' {
    if (!poQty && !grnQty) return '';
    // No PO linked — 2-way match: GRN qty vs invoice qty
    if (!poQty) return grnQty === invQty ? 'OK' : 'Mismatch';
    // Full 3-way match: PO qty = GRN qty = invoice qty
    if (poQty === grnQty && grnQty === invQty) return 'OK';
    return 'Mismatch';
  }

  recalcLine(line: PinLine): void {
    const base = (line.qty ?? 0) * (line.unitPrice ?? 0) * (1 - (line.discountPct ?? 0) / 100);
    line.lineTotal = +base.toFixed(2);
    if (line.taxMode === 'Exclusive') {
      line.taxAmt = +(base * (this.taxRate / 100)).toFixed(2);
      line.lineGrandTotal = +(base + line.taxAmt).toFixed(2);
    } else if (line.taxMode === 'Inclusive') {
      line.taxAmt = +(base - base / (1 + this.taxRate / 100)).toFixed(2);
      line.lineGrandTotal = +base.toFixed(2);
    } else {
      line.taxAmt = 0;
      line.lineGrandTotal = +base.toFixed(2);
    }
    line.matchStatus = this.calcMatchStatus(line.poQty, line.grnQty, line.qty);
  }

  recalcLines(): void { this.lines.forEach(l => this.recalcLine(l)); }

  get subTotal(): number { return +this.lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2); }
  get totalTax(): number { return +this.lines.reduce((s, l) => s + l.taxAmt, 0).toFixed(2); }
  get grandTotal(): number { return +this.lines.reduce((s, l) => s + l.lineGrandTotal, 0).toFixed(2); }
  get allMatchOk(): boolean { return this.lines.length > 0 && this.lines.every(l => l.matchStatus === 'OK' || l.matchStatus === ''); }
  get mismatchCount(): number { return this.lines.filter(l => l.matchStatus === 'Mismatch').length; }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getSupplierInvoiceById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.invoiceNo = d.invoiceNo ?? '';
        this.invoiceDate = d.invoiceDate ? d.invoiceDate.substring(0, 10) : this.invoiceDate;
        this.supplierId = d.supplierId ?? null;
        this.supplierName = d.supplierName ?? '';
        this.currencyId = d.currencyId ?? null;
        this.fxRate = d.fxRate ?? 1;
        this.taxRate = d.taxRate ?? d.taxPct ?? 0;
        this.isPartial = d.isPartial ?? false;
        this.isGlPosted = d.isGlPosted ?? d.glPosted ?? false;
        this.status = d.status ?? 'Draft';
        this.selectedGrnIds = d.grnId ? [d.grnId] : (d.grnIds ?? []);
        this.selectedGrnNos = (d.grnNos ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
        this.grnSearch = this.selectedGrnNos.join(', ');

        const rawLines = d.linesJson ?? d.LinesJson ?? d.lines ?? '[]';
        const parsed: any[] = typeof rawLines === 'string' ? JSON.parse(rawLines || '[]') : (Array.isArray(rawLines) ? rawLines : []);
        this.lines = parsed.map((l: any) => this.mapEditLine(l));
        this.loading = false;
        this.loadGrnListForEdit();
      },
      error: () => { this.loading = false; }
    });
  }

  private mapEditLine(l: any): PinLine {
    const qty = Number(l.qty ?? l.quantity ?? 0);
    const price = Number(l.unitPrice ?? 0);
    const disc = Number(l.discountPct ?? 0);
    const base = qty * price * (1 - disc / 100);
    const taxAmt = Number(l.taxAmt ?? 0);
    const poQty = Number(l.poQty ?? 0);
    const grnQty = Number(l.grnQty ?? qty);
    return {
      itemId: l.itemId ?? null,
      itemName: l.itemName ?? l.item ?? '',
      locationId: l.locationId ?? null,
      poQty,
      grnQty,
      qty,
      unitPrice: price,
      discountPct: disc,
      taxMode: (l.taxMode ?? 'Exclusive') as TaxMode,
      lineTotal: Number(l.lineTotal ?? base),
      taxAmt,
      lineGrandTotal: Number(l.lineGrandTotal ?? (base + taxAmt)),
      budgetLineId: l.budgetLineId ?? null,
      dcNoteNo: l.dcNoteNo ?? '',
      remarks: l.remarks ?? '',
      matchStatus: this.calcMatchStatus(poQty, grnQty, qty)
    };
  }

  postToAP(): void {
    if (!this.id) return;
    const matchWarning = this.mismatchCount > 0
      ? `<br><br><span style="color:#b91c1c;font-weight:600;">Warning: ${this.mismatchCount} line(s) have qty mismatch (PO/GRN/Invoice).</span>`
      : '';
    Swal.fire({
      title: 'Post to A/P?',
      html: `Post Supplier Invoice <b>${this.invoiceNo || ''}</b> to Accounts Payable?${matchWarning}`,
      icon: this.mismatchCount > 0 ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: 'Post to A/P',
      confirmButtonColor: '#0e7490'
    }).then(r => {
      if (!r.isConfirmed) return;
      this.posting = true;
      this.svc.postPinToAP(this.id!).subscribe({
        next: () => {
          this.posting = false;
          this.isGlPosted = true;
          this.status = 'Posted';
          Swal.fire('Posted!', 'Supplier invoice posted to Accounts Payable.', 'success');
        },
        error: err => {
          this.posting = false;
          Swal.fire('Error', err?.error?.message ?? 'GL posting failed.', 'error');
        }
      });
    });
  }

  submit(draft = false): void {
    if (!this.invoiceNo.trim()) {
      Swal.fire('Required', 'Please enter Invoice No.', 'warning'); return;
    }
    if (!this.selectedGrnIds.length) {
      Swal.fire('Required', 'Please select at least one GRN.', 'warning'); return;
    }
    this.saving = true;
    this.error = '';
    this.svc.checkPeriodLock(this.invoiceDate).subscribe({
      next: (res: any) => {
        const d = res?.data ?? res ?? {};
        if (!draft && (d.isClosed || d.IsClosed || d.status === 'Closed')) {
          this.saving = false;
          this.error = `Accounting period for ${this.invoiceDate} is closed. Please contact Finance.`;
          return;
        }
        this.doSubmit(draft);
      },
      error: () => this.doSubmit(draft)
    });
  }

  private doSubmit(draft: boolean): void {
    const linesData = this.lines.map(l => ({
      itemId: l.itemId,
      itemName: l.itemName,
      locationId: l.locationId,
      poQty: l.poQty,
      grnQty: l.grnQty,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      taxMode: l.taxMode,
      lineTotal: l.lineTotal,
      taxAmt: l.taxAmt,
      lineGrandTotal: l.lineGrandTotal,
      budgetLineId: l.budgetLineId,
      dcNoteNo: l.dcNoteNo,
      remarks: l.remarks,
      matchStatus: l.matchStatus
    }));

    const payload = {
      InvoiceNo: this.invoiceNo,
      InvoiceDate: this.invoiceDate,
      SupplierId: this.supplierId,
      CurrencyId: this.currencyId ?? 0,
      FxRate: this.fxRate ?? 1,
      TaxRate: this.taxRate,
      Tax: this.totalTax,
      Amount: this.grandTotal,
      GrnNos: this.selectedGrnNos.join(','),
      Status: draft ? 0 : 1,
      LinesJson: JSON.stringify(linesData),
      GrnId: this.selectedGrnIds[0] ?? null,
      GrnIds: this.selectedGrnIds,
      IsPartial: this.isPartial,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0
    };

    const obs$ = this.isEdit
      ? this.svc.updateSupplierInvoice(this.id!, payload)
      : this.svc.createSupplierInvoice(payload);

    obs$.subscribe({
      next: () => {
        this.saving = false;
        Swal.fire('Saved', draft ? 'Invoice saved as draft.' : 'Invoice saved successfully.', 'success')
          .then(() => this.back());
      },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  back(): void { this.router.navigate(['/app/purchase/supplier-invoice']); }

  get title(): string { return this.isEdit ? 'Edit Supplier Invoice' : 'New Supplier Invoice'; }

  private safeJsonArray(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (!s) return [];
      try { const p = JSON.parse(s); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  }
}
