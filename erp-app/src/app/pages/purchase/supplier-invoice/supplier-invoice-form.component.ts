import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { DocumentNumberService } from '../../../core/services/document-number.service';
import { MasterService } from '../../../core/services/master.service';
import { CalculatedTaxMode, TaxDecisionService } from '../../../core/services/tax-decision.service';
import { PurchaseService } from '../purchase.service';

type TaxMode = 'Exclusive' | 'Inclusive' | 'Zero';

interface GrnHeader {
  id: number;
  grnNo: string;
  poId: number;
  poNo: string;
  supplierId: number;
  supplierName: string;
  supplierCountryId: number | null;
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
  isOverseas = false;
  status = 'Draft';

  grnList: GrnHeader[] = [];
  grnFiltered: GrnHeader[] = [];
  grnOpen = false;
  grnSearch = '';
  selectedGrnIds: number[] = [];
  selectedGrnNos: string[] = [];

  lines: PinLine[] = [];

  ledgerOptions: any[] = [];
  locationOptions: any[] = [];
  private itemLedgerMap = new Map<number, number>();
  private itemCategoryMap = new Map<number, number>();
  private categoryLedgerMap = new Map<number, number>();
  private itemLeafLedgerMap = new Map<number, number>(); // itemId → item-specific leaf COA id (e.g. 501021601 butter milk)

  taxModeOptions = [
    { label: 'Exclusive', value: 'Exclusive' },
    { label: 'Inclusive', value: 'Inclusive' },
    { label: 'Zero', value: 'Zero' }
  ];

  loginUserId = Number(localStorage.getItem('id')) || null;
  companyId = Number(localStorage.getItem('companyId') || 0);
  companyCountryId = Number(localStorage.getItem('companyCountryId') || 0) || null;
  private suggestedInvoiceNo = '';
  private selectedSupplierCountryId: number | null = null;
  private defaultTaxMode: CalculatedTaxMode = 'Exclusive';

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router,
    private masterSvc: MasterService,
    private docNoSvc: DocumentNumberService,
    private taxDecisionSvc: TaxDecisionService
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    this.loadCompanyContext();
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    else { this.loadGrnList(true); }
    this.loadLookups();
  }

  private loadCompanyContext(): void {
    const applySuggestion = () => {
      this.suggestedInvoiceNo = this.docNoSvc.peekNextNumber('PIN', this.companyId || undefined);
      if (!this.isEdit && !this.invoiceNo) this.invoiceNo = this.suggestedInvoiceNo;
    };
    if (!this.companyId) {
      applySuggestion();
      return;
    }
    this.masterSvc.getCompanyById(this.companyId).subscribe({
      next: (res: any) => {
        if (res?.numberSeries?.length) this.docNoSvc.cacheCompanySeries(this.companyId, res.numberSeries);
        const countryId = Number(res?.financeTax?.countryId ?? res?.general?.countryId ?? 0) || null;
        this.companyCountryId = countryId;
        if (countryId) localStorage.setItem('companyCountryId', String(countryId));
        applySuggestion();
      },
      error: () => applySuggestion()
    });
  }

  private applyOcrDraft(): void {
    const raw = sessionStorage.getItem('ocrPinDraft');
    if (!raw) return;
    sessionStorage.removeItem('ocrPinDraft');
    try {
      const draft = JSON.parse(raw);
      if (draft.invoiceNo) this.invoiceNo = draft.invoiceNo;
      if (draft.invoiceDate) this.invoiceDate = draft.invoiceDate.substring(0, 10);
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
          this.selectedSupplierCountryId = selectedGrns[0].supplierCountryId;
          this.currencyId = selectedGrns[0].currencyId;
          this.currencyName = selectedGrns[0].currencyName;
          this.fxRate = selectedGrns[0].fxRate;
          this.applyTaxDecision(this.taxRate);
        }
        this.loadLinesWithPoFetch(selectedGrns);
      }
    } catch {}
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!(ev.target as HTMLElement).closest('.grn-combobox')) this.grnOpen = false;
  }

  loadLookups(): void {
    this.svc.getLocations().subscribe(r =>
      this.locationOptions = this.svc.unwrap(r).map((l: any) => ({
        label: l.locationName ?? l.name, value: l.id
      })));

    // Load COA + categories + items together so we can resolve each item's
    // own leaf ledger (Item → Category → category COA → item leaf COA).
    forkJoin({
      coa: this.svc.getChartOfAccounts().pipe(catchError(() => of([]))),
      cats: this.svc.getCategories().pipe(catchError(() => of([]))),
      items: this.svc.getItems().pipe(catchError(() => of([])))
    }).subscribe(({ coa, cats, items }) => {
      const coaList: any[] = this.svc.unwrap(coa);
      const catList: any[] = (cats as any)?.data || cats || [];
      const itemList: any[] = this.svc.unwrap(items);

      this.ledgerOptions = coaList.map((c: any) => ({
        label: `${c.headCode ?? ''} ${c.headName ?? ''}`.trim(), value: c.id
      }));

      const norm = (s: any) => String(s ?? '').trim().toUpperCase();

      // category by id
      const catById = new Map<number, any>();
      catList.forEach((c: any) => {
        const id = c.id ?? c.iD;
        if (id) catById.set(Number(id), c);
      });

      // headCode → COA id (for the category-level fallback ledger)
      const headCodeToId = new Map<number, number>();
      // "parentHead|HEADNAME" → COA row, for O(1) parent/child resolution
      const coaByParentAndName = new Map<string, any>();
      coaList.forEach((c: any) => {
        if (c.headCode != null && c.id != null) headCodeToId.set(Number(c.headCode), Number(c.id));
        if (c.parentHead != null) coaByParentAndName.set(`${Number(c.parentHead)}|${norm(c.headName)}`, c);
      });

      // categoryId → purchase parent head COA id (fallback when no item leaf exists)
      this.categoryLedgerMap.clear();
      catList.forEach((cat: any) => {
        const catId = cat.id ?? cat.iD;
        const headCode = cat.purchaseParentHeadCode ?? cat.PurchaseParentHeadCode;
        if (catId && headCode) {
          const coaId = headCodeToId.get(Number(headCode));
          if (coaId) this.categoryLedgerMap.set(Number(catId), coaId);
        }
      });

      // itemId → leaf ledger (the item's own COA account)
      this.itemLedgerMap.clear();
      this.itemCategoryMap.clear();
      this.itemLeafLedgerMap.clear();
      itemList.forEach((i: any) => {
        const itemId = Number(i.id ?? i.iD ?? 0);
        if (!itemId) return;
        const itemName = i.itemName ?? i.ItemName ?? i.name ?? '';
        const catId = Number(i.categoryId ?? i.CategoryId ?? 0);
        const ledger = Number(i.budgetLineId ?? i.BudgetLineId ?? 0);

        if (ledger) this.itemLedgerMap.set(itemId, ledger);
        if (catId) this.itemCategoryMap.set(itemId, catId);

        const cat = catById.get(catId);
        if (!cat || !itemName) return;

        // Purchase context (supplier invoice): use PurchaseParentHeadCode; fall back to Sales.
        const parentHeadCode =
          cat.purchaseParentHeadCode ?? cat.PurchaseParentHeadCode ??
          cat.salesParentHeadCode ?? cat.SalesParentHeadCode ?? null;
        if (!parentHeadCode) return;

        const catName = cat.catagoryName ?? cat.CatagoryName ?? cat.categoryName ?? '';

        // 1) category COA: ParentHead == parentHeadCode AND HeadName == CatagoryName → its HeadCode (e.g. 5010216)
        const categoryCoa = coaByParentAndName.get(`${Number(parentHeadCode)}|${norm(catName)}`);
        if (categoryCoa?.headCode == null) return;

        // 2) item leaf COA: ParentHead == categoryCoa.HeadCode AND HeadName == ItemName → its Id (e.g. 1977)
        const leafCoa = coaByParentAndName.get(`${Number(categoryCoa.headCode)}|${norm(itemName)}`);
        if (leafCoa?.id != null) this.itemLeafLedgerMap.set(itemId, Number(leafCoa.id));
      });
    });
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
      supplierCountryId: Number(g.countryId ?? g.CountryId ?? g.supplierCountryId ?? 0) || null,
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
      const currentSelected = this.grnList.filter(x => prev.includes(Number(x.id)));
      if (currentSelected.length > 0) {
        const existingSupplier = currentSelected[0].supplierId;
        if (existingSupplier && g.supplierId && existingSupplier !== g.supplierId) {
          Swal.fire({ icon: 'warning', title: 'Invalid', text: 'Multiple supplier GRNs cannot be combined into one invoice.', confirmButtonColor: '#16a34a' });
          return;
        }
        const existingPoId = currentSelected[0].poId;
        if (existingPoId && g.poId && existingPoId !== g.poId) {
          Swal.fire({ icon: 'warning', title: 'Invalid', text: 'GRNs from different POs cannot be combined into one invoice (3-way match).', confirmButtonColor: '#16a34a' });
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
      this.selectedSupplierCountryId = selectedGrns[0].supplierCountryId;
      this.currencyId = selectedGrns[0].currencyId;
      this.currencyName = selectedGrns[0].currencyName;
      this.fxRate = selectedGrns[0].fxRate;
    } else {
      this.supplierName = '';
      this.supplierId = null;
      this.selectedSupplierCountryId = null;
      this.currencyId = null;
      this.currencyName = '';
      this.fxRate = 1;
    }

    this.grnSearch = selectedGrns.map(x => x.grnNo).join(', ');
    this.applyTaxDecision(this.taxRate);
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
      this.selectedSupplierCountryId = selectedGrns[0].supplierCountryId;
    } else {
      this.supplierName = '';
      this.supplierId = null;
      this.selectedSupplierCountryId = null;
    }
    this.applyTaxDecision(this.taxRate);
    this.loadLinesWithPoFetch(selectedGrns);
  }

  private applyTaxDecision(defaultTaxRate: number): void {
    const decision = this.taxDecisionSvc.decide({
      companyCountryId: this.companyCountryId,
      partnerCountryId: this.selectedSupplierCountryId,
      companyCurrencyId: Number(localStorage.getItem('companyCurrencyId') || 0),
      documentCurrencyId: this.currencyId,
      defaultTaxRate
    });
    this.isOverseas = decision.isOverseas;
    this.defaultTaxMode = decision.taxMode;
    this.taxRate = decision.taxRate;
    this.lines.forEach(line => {
      line.taxMode = this.defaultTaxMode === 'ZeroRated' ? 'Zero' : (line.taxMode === 'Zero' ? 'Exclusive' : line.taxMode);
      this.recalcLine(line);
    });
  }

  private loadLinesWithPoFetch(grns: GrnHeader[]): void {
    if (!grns.length) { this.lines = []; return; }
    const needFetch = grns.filter(g => g.poId > 0 && (!this.safeJsonArray(g.poLines).length || !this.taxRate));
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
        if (rawLines) grns.filter(g => g.poId === poId && !this.safeJsonArray(g.poLines).length).forEach(g => g.poLines = rawLines);
        if (!this.taxRate) {
          const poTax = Number(po?.tax ?? po?.gstPct ?? po?.taxRate ?? po?.taxPct ?? 0);
          if (poTax > 0) {
            this.taxRate = poTax;
            this.applyTaxDecision(poTax);
          }
        }
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
      if (!this.taxRate && grnItems.length) {
        const grnTax = Number(grnItems[0].taxRate ?? 0);
        if (grnTax > 0) {
          this.taxRate = grnTax;
          this.applyTaxDecision(grnTax);
        }
      }

      grnItems.forEach((x: any) => {
        const itemId = x.itemId ?? null;
        const itemName = x.itemName ?? x.itemSearch ?? x.item ?? '';
        const grnQty = Number(x.qtyReceived ?? x.qty ?? 0);
        const unitPrice = Number(x.unitPrice ?? x.price ?? 0);
        const poLine = poItems.find((p: any) =>
          (itemId && Number(p.itemId) === Number(itemId)) ||
          (x.itemCode && p.itemCode === x.itemCode) ||
          (itemName && (p.itemName === itemName || p.itemSearch === itemName || p.item === itemName))
        );
        const poQty = poLine ? Number(poLine.qty ?? poLine.quantity ?? 0) : 0;
        const leafLedger = itemId ? (this.itemLeafLedgerMap.get(Number(itemId)) || null) : null;
        const itemLedger = itemId ? (this.itemLedgerMap.get(Number(itemId)) || null) : null;
        const catId = itemId ? (this.itemCategoryMap.get(Number(itemId)) || null) : null;
        const catLedger = catId ? (this.categoryLedgerMap.get(catId) || null) : null;
        // Prefer the item's own leaf ledger (e.g. 501021601 butter milk), then the saved
        // item ledger, and only fall back to the category parent (e.g. 50102 Purchases).
        const itemDefault = leafLedger || itemLedger || catLedger || null;
        const ledgerId = x.budgetLineId ?? x.BudgetLineId ?? poLine?.budgetLineId ?? poLine?.BudgetLineId ?? itemDefault;

        const existing = merged.find(pl => pl.itemId === itemId && pl.unitPrice === unitPrice);
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
          taxMode: this.defaultTaxMode === 'ZeroRated' ? 'Zero' : 'Exclusive',
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
    if (!poQty) return grnQty === invQty ? 'OK' : 'Mismatch';
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
        this.isOverseas = !!(d.isOverseas ?? d.IsOverseas);
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
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626'
    }).then(r => {
      if (!r.isConfirmed) return;
      this.posting = true;
      this.svc.postPinToAP(this.id!).subscribe({
        next: () => {
          this.posting = false;
          this.isGlPosted = true;
          this.status = 'Posted';
          Swal.fire({ icon: 'success', title: 'Posted!', text: 'Supplier invoice posted to Accounts Payable.', confirmButtonColor: '#16a34a' });
        },
        error: err => {
          this.posting = false;
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? 'GL posting failed.', confirmButtonColor: '#16a34a' });
        }
      });
    });
  }

  submit(draft = false): void {
    if (!this.selectedGrnIds.length) {
      Swal.fire({ icon: 'warning', title: 'Required', text: 'Please select at least one GRN.', confirmButtonColor: '#16a34a' });
      return;
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

  private resolveInvoiceNo(): string {
    const current = (this.invoiceNo || '').trim();
    if (this.isEdit && current) return current;
    if (!current || current === this.suggestedInvoiceNo) {
      this.invoiceNo = this.docNoSvc.reserveNextNumber('PIN', this.companyId || undefined);
      return this.invoiceNo;
    }
    return current;
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

    const payload: any = {
      InvoiceNo: this.resolveInvoiceNo(),
      InvoiceDate: this.invoiceDate,
      SupplierId: this.supplierId,
      CurrencyId: this.currencyId ?? 0,
      FxRate: this.fxRate ?? 1,
      TaxRate: this.taxRate,
      Tax: this.totalTax,
      Amount: this.grandTotal,
      BaseAmount: +(this.grandTotal * (this.fxRate || 1)).toFixed(2),
      GrnNos: this.selectedGrnNos.join(','),
      Status: draft ? 0 : 1,
      LinesJson: JSON.stringify(linesData),
      GrnId: this.selectedGrnIds[0] ?? null,
      GrnIds: this.selectedGrnIds,
      IsPartial: this.isPartial,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0,
      IsOverseas: this.isOverseas
    };

    const obs$ = this.isEdit
      ? this.svc.updateSupplierInvoice(this.id!, payload)
      : this.svc.createSupplierInvoice(payload);

    obs$.subscribe({
      next: () => {
        this.saving = false;
        Swal.fire({ icon: 'success', title: 'Saved!', text: draft ? 'Invoice saved as draft.' : 'Invoice saved successfully.', confirmButtonColor: '#16a34a' })
          .then(() => this.back());
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message ?? 'Save failed.';
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? 'Save failed.', confirmButtonColor: '#16a34a' });
      }
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
