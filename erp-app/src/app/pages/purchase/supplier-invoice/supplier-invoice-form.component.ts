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
  alreadyInvoicedJson: any;
  totalInvoicedQty: number;
}

interface PinLine {
  itemId: number | null;
  itemCode?: string | null;
  itemName: string;
  locationId: number | null;
  // Direct purchase only. Where a stock line's goods land. locationId above is a Location,
  // not a warehouse; a line with no warehouse is treated as an expense (nothing received).
  warehouseId: number | null;
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
  isPartial: boolean;
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
  // The company's base currency (e.g. RM). The invoice is billed in the supplier's currency
  // (e.g. SGD); fxRate converts it, so the totals also show the base-currency amount.
  baseCurrencyName = (localStorage.getItem('companyCurrencyName') || '').trim() || 'SGD';
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
  warehouseOptions: any[] = [];
  private defaultWarehouseId: number | null = null;
  supplierOptions: { label: string; value: number }[] = [];
  private supplierById = new Map<number, any>();

  /**
   * Direct purchase — bought over the counter, so there is no PO and no GRN to tick. Not a
   * mode the user switches: it simply IS one while no GRN is selected, which is exactly the
   * condition the server keys off. One less field to get wrong, and the two sides can't
   * disagree about what kind of invoice this is.
   */
  get isCashPurchase(): boolean { return this.selectedGrnIds.length === 0; }
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
        // Prefer the SCANNED (OCR) line items so the user reviews what the supplier
        // billed. Fall back to GRN lines only if the scan produced no lines.
        const draftLines: any[] = draft.lines ?? [];
        if (draftLines.length) {
          this.lines = draftLines.map((l: any) => this.makeOcrLine(l));
        } else {
          this.loadLinesWithPoFetch(selectedGrns);
        }
      }
    } catch {}
  }

  // Build an editable invoice line from a scanned (OCR) line item.
  // itemId is left null so the user can map it to a real item before saving.
  private makeOcrLine(l: any): PinLine {
    const qty = Number(l.qty ?? 0) || 0;
    const unitPrice = Number(l.unitPrice ?? 0) || 0;
    const line: PinLine = {
      itemId: null,
      itemName: String(l.item ?? l.itemName ?? ''),
      locationId: null,
      warehouseId: null,
      poQty: 0,
      grnQty: qty,
      qty,
      unitPrice,
      discountPct: Number(l.discountPct ?? 0) || 0,
      taxMode: this.defaultTaxMode === 'ZeroRated' ? 'Zero' : 'Exclusive',
      lineTotal: 0,
      taxAmt: 0,
      lineGrandTotal: 0,
      budgetLineId: null,
      dcNoteNo: '',
      remarks: 'From scan',
      matchStatus: '',
      isPartial: false
    };
    this.recalcLine(line);
    return line;
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

    // A stock line on a direct purchase has to say which warehouse the goods went to —
    // there is no GRN to carry it. Only used when no GRN is selected.
    this.svc.getWarehouses().subscribe(r => {
      this.warehouseOptions = this.svc.unwrap(r).map((w: any) => ({
        label: w.name ?? w.warehouseName, value: w.id
      }));
      // Default the warehouse used by stock lines (the column is hidden). First one if only one.
      this.defaultWarehouseId = this.warehouseOptions[0]?.value ?? null;
      this.lines.forEach(l => { if (l.warehouseId == null) l.warehouseId = this.defaultWarehouseId; });
    });

    // Normally the supplier is read off the selected GRN, so this screen never needed a list.
    // A direct purchase has no GRN and still has to name who was paid — the AP leg resolves
    // Suppliers.BudgetLineId and the proc refuses to post without it. The supplier's currency
    // and rate come from here too, since there is no GRN to bring them.
    this.svc.getSuppliers().subscribe(r => {
      const list = this.svc.unwrap(r);
      this.supplierOptions = list.map((s: any) => ({
        label: s.name ?? s.supplierName ?? s.Name, value: Number(s.id ?? s.Id)
      }));
      this.supplierById.clear();
      list.forEach((s: any) => this.supplierById.set(Number(s.id ?? s.Id), s));
    });

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

  // ─── Direct purchase (no PO/GRN) ────────────────────────────────

  /** A blank invoice line to type into. Expense by default; becomes stock only when the
   *  description matches an item and a warehouse is set. */
  addCashLine(): void {
    this.lines.push({
      itemId: null, itemCode: null, itemName: '', locationId: null,
      // Warehouse is no longer a column — a stock line just goes to the default warehouse.
      // Harmless on an expense line: the server only receives a line whose name matches an item.
      warehouseId: this.defaultWarehouseId,
      poQty: 0, grnQty: 0, qty: 1, unitPrice: 0, discountPct: 0,
      taxMode: this.defaultTaxMode === 'ZeroRated' ? 'Zero' : 'Exclusive',
      lineTotal: 0, taxAmt: 0, lineGrandTotal: 0,
      budgetLineId: null, dcNoteNo: '', remarks: '', matchStatus: '', isPartial: false
    });
  }

  removeCashLine(i: number): void { this.lines.splice(i, 1); }

  /** Supplier picked by hand (no GRN to read it off): bring its name, country — which drives
   *  the tax treatment — currency and rate, exactly as selecting a GRN would. */
  onSupplierPicked(): void {
    const s = this.supplierById.get(Number(this.supplierId));
    if (!s) {
      this.supplierName = ''; this.selectedSupplierCountryId = null;
      this.currencyId = null; this.currencyName = ''; this.fxRate = 1;
      return;
    }
    this.supplierName = s.name ?? s.supplierName ?? s.Name ?? '';
    this.selectedSupplierCountryId = Number(s.countryId ?? s.CountryId) || null;
    this.currencyId = Number(s.currencyId ?? s.CurrencyId) || null;
    this.currencyName = s.currencyName ?? s.CurrencyName ?? '';
    this.applyTaxDecision(this.taxRate);
    this.resolveCashFxRate();
  }

  /** Rate for the supplier's currency on the invoice date, from Master > Exchange Rate.
   *  Left at 1 rather than guessed — a wrong rate is worse than an obvious one. */
  private resolveCashFxRate(): void {
    const baseId = Number(localStorage.getItem('companyCurrencyId') || 0);
    if (!this.currencyId || !baseId || !this.invoiceDate) { this.fxRate = 1; return; }
    if (Number(this.currencyId) === baseId) { this.fxRate = 1; return; }
    this.svc.getExchangeRate(Number(this.currencyId), baseId, this.invoiceDate).subscribe({
      next: (r: any) => {
        const rate = Number(r?.data?.rate ?? r?.rate ?? 0);
        this.fxRate = rate > 0 ? rate : 1;
      },
      error: () => { this.fxRate = 1; }
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
      // NOTE: the API serialises the SQL column POID as camelCase "pOID" (only the first
      // letter is lower-cased, like GRNJson -> gRNJson). Missing this variant left poId = 0,
      // so the PO was never fetched and the invoice tax rate stayed 0 (no tax on the SI).
      poId: Number(g.pOID ?? g.poid ?? g.poId ?? g.POID ?? g.PoId ?? 0),
      poNo: String(g.poNo ?? g.PoNo ?? g.PONo ?? g.pOID ?? g.POID ?? ''),
      supplierId: Number(g.supplierId ?? g.SupplierId ?? 0),
      supplierName: g.supplierName ?? g.SupplierName ?? '',
      supplierCountryId: Number(g.countryId ?? g.CountryId ?? g.supplierCountryId ?? 0) || null,
      currencyId: g.currencyId ?? g.CurrencyId ?? null,
      currencyName: g.currencyName ?? g.CurrencyName ?? '',
      fxRate: Number(g.fxRate ?? g.FxRate ?? 1),
      grnJson: g.gRNJson ?? g.GRNJson ?? g.grnJson ?? g.GrnJson,
      poLines: g.poLines ?? g.PoLines ?? g.poLinesJson ?? g.PoLinesJson,
      alreadyInvoicedJson: g.alreadyInvoicedJson ?? g.AlreadyInvoicedJson ?? null,
      totalInvoicedQty: Number(g.totalInvoicedQty ?? g.TotalInvoicedQty ?? 0)
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
          Swal.fire({ icon: 'warning', title: 'Invalid', text: 'All GRNs must be from the same supplier.', confirmButtonColor: '#16a34a' });
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
      this.taxRate = 0;   // no GRN selected — clear the tax rate
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
      this.taxRate = 0;   // no GRN selected — clear the tax rate
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
    // Tax % always follows the source rate (from the GRN/PO), even for overseas
    // orders — the decision's zero-rating is not applied to the displayed rate.
    const rate = Math.max(0, Number(defaultTaxRate || 0));
    this.taxRate = rate;
    this.defaultTaxMode = rate > 0 ? 'Exclusive' : 'ZeroRated';
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
        // Pull the tax rate carried on the GRN lines. Scan all lines (not just
        // the first) and accept common field-name variants so a differently
        // cased/named key still resolves.
        const readTax = (x: any) => Number(x?.taxRate ?? x?.TaxRate ?? x?.taxPct ?? x?.gstPct ?? x?.tax ?? 0);
        const grnTax = grnItems.reduce((max: number, x: any) => Math.max(max, readTax(x) || 0), 0);
        if (grnTax > 0) {
          this.taxRate = grnTax;
          this.applyTaxDecision(grnTax);
        }
      }

      const alreadyInvoiced: { itemId: number; invoicedQty: number }[] =
        this.safeJsonArray(g.alreadyInvoicedJson);
      const totalInvoicedQty = g.totalInvoicedQty ?? 0;
      const isSingleItem = grnItems.length === 1;

      grnItems.forEach((x: any) => {
        const itemId = x.itemId ?? null;
        const itemCode = x.itemCode ?? x.ItemCode ?? '';
        const itemName = x.itemName ?? x.itemSearch ?? x.item ?? '';
        const rawGrnQty = Number(x.qtyReceived ?? x.qty ?? 0);
        // Fix: use itemId != null (not truthy) to avoid skipping itemId=0
        const perItemMatch = itemId != null
          ? alreadyInvoiced.find(a => a.itemId === Number(itemId))?.invoicedQty
          : undefined;
        // Fallback: for single-item GRNs, use the total invoiced qty from backend
        const invoicedAlready = perItemMatch ?? (isSingleItem ? totalInvoicedQty : 0);
        const grnQty = Math.max(0, rawGrnQty - invoicedAlready);
        const unitPrice = Number(x.unitPrice ?? x.price ?? 0);
        const poLine = poItems.find((p: any) =>
          (itemId && Number(p.itemId) === Number(itemId)) ||
          (x.itemCode && p.itemCode === x.itemCode) ||
          (itemName && (p.itemName === itemName || p.itemSearch === itemName || p.item === itemName))
        );
        const poQty = poLine ? Number(poLine.qty ?? poLine.quantity ?? 0) : 0;
        const poTaxMode = this.mapPoTaxMode(poLine?.taxMode ?? poLine?.TaxMode);
        const leafLedger = itemId ? (this.itemLeafLedgerMap.get(Number(itemId)) || null) : null;
        const itemLedger = itemId ? (this.itemLedgerMap.get(Number(itemId)) || null) : null;
        const catId = itemId ? (this.itemCategoryMap.get(Number(itemId)) || null) : null;
        const catLedger = catId ? (this.categoryLedgerMap.get(catId) || null) : null;
        // Prefer the item's own leaf ledger (e.g. 501021601 butter milk), then the saved
        // item ledger, and only fall back to the category parent (e.g. 50102 Purchases).
        const itemDefault = leafLedger || itemLedger || catLedger || null;
        const ledgerId = x.budgetLineId ?? x.BudgetLineId ?? poLine?.budgetLineId ?? poLine?.BudgetLineId ?? itemDefault;

        // Merge only genuinely-identical lines. GRNs can store itemId=null (only itemCode
        // distinguishes items), so fall back to itemCode/name to avoid collapsing different items.
        const existing = merged.find(pl =>
          pl.unitPrice === unitPrice &&
          (itemId != null
            ? pl.itemId === itemId
            : (pl.itemId == null && (pl.itemCode || '') === (itemCode || '') && pl.itemName === itemName)));
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
          itemCode,
          itemName,
          locationId: null,
          warehouseId: null,   // GRN line — stock was placed by the receipt already
          poQty,
          grnQty,
          qty: grnQty,
          unitPrice,
          discountPct: 0,
          // Tax mode is inherited from the source PO line; fall back to the
          // document default only when the PO carries no tax mode.
          taxMode: poTaxMode ?? (this.defaultTaxMode === 'ZeroRated' ? 'Zero' : 'Exclusive'),
          lineTotal: 0,
          taxAmt: 0,
          lineGrandTotal: 0,
          budgetLineId: ledgerId,
          dcNoteNo: '',
          remarks: '',
          matchStatus: '',
          isPartial: false
        };
        this.recalcLine(line);
        line.matchStatus = this.calcMatchStatus(poQty, grnQty, grnQty);
        merged.push(line);
      });
    });

    this.lines = merged;
  }

  // Map a PO line's tax mode (Exclusive / Inclusive / ZeroRated) onto the
  // supplier-invoice tax mode ('Exclusive' | 'Inclusive' | 'Zero').
  private mapPoTaxMode(poMode: any): TaxMode | null {
    const m = String(poMode ?? '').trim().toLowerCase();
    if (m === 'inclusive') return 'Inclusive';
    if (m === 'exclusive') return 'Exclusive';
    if (m === 'zerorated' || m === 'zero' || m === 'exempt') return 'Zero';
    return null;
  }

  private calcMatchStatus(poQty: number, grnQty: number, invQty: number): 'OK' | 'Mismatch' | '' {
    if (!grnQty && !poQty) return '';
    if (!invQty) return '';
    const tol = 0.0001;
    // OK if invoice qty is within remaining GRN qty (supports partial invoices)
    if (invQty <= grnQty + tol) return 'OK';
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
    if (line.qty < line.grnQty) line.isPartial = true;
    else if (line.qty >= line.grnQty) line.isPartial = false;
  }

  recalcLines(): void { this.lines.forEach(l => this.recalcLine(l)); }

  /**
   * Typing a rate must also re-rate the lines. recalcLine alone reads taxMode, so a line left
   * as 'Zero' would keep charging no tax however high the % typed.
   */
  onTaxRateChange(rate: number): void {
    this.applyTaxDecision(Number(rate ?? 0));
  }

  get subTotal(): number { return +this.lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2); }
  get totalTax(): number { return +this.lines.reduce((s, l) => s + l.taxAmt, 0).toFixed(2); }
  get grandTotal(): number { return +this.lines.reduce((s, l) => s + l.lineGrandTotal, 0).toFixed(2); }
  /** Invoice currency differs from the company's base currency → show the converted total. */
  get isForeignCurrency(): boolean {
    const cur = (this.currencyName || '').trim().toLowerCase();
    return !!cur && cur !== this.baseCurrencyName.trim().toLowerCase();
  }
  get baseAmount(): number { return +(this.grandTotal * (this.fxRate || 1)).toFixed(2); }
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
        this.isPartial = d.isPartialInvoice ?? d.isPartial ?? false;
        this.isGlPosted = d.isGlPosted ?? d.glPosted ?? false;
        this.isOverseas = !!(d.isOverseas ?? d.IsOverseas);
        this.status = d.status ?? 'Draft';
        this.selectedGrnIds = d.grnId ? [d.grnId] : (d.grnIds ?? []);
        this.selectedGrnNos = (d.grnNos ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
        this.grnSearch = this.selectedGrnNos.join(', ');

        const rawLines = d.linesJson ?? d.LinesJson ?? d.lines ?? '[]';
        const parsed: any[] = typeof rawLines === 'string' ? JSON.parse(rawLines || '[]') : (Array.isArray(rawLines) ? rawLines : []);
        this.taxRate = d.taxRate ?? d.taxPct ?? this.recoverTaxRate(parsed);
        this.lines = parsed.map((l: any) => this.mapEditLine(l));
        this.loading = false;
        this.loadGrnListForEdit();
      },
      error: () => { this.loading = false; }
    });
  }

  /**
   * Recovers the invoice's tax % from its saved lines. Lines saved by the current form carry
   * `taxRate` directly; older ones only have `taxAmt`, so the rate is worked back out of the
   * amount. Returning 0 leaves the existing PO/GRN lookups to fill it in.
   */
  private recoverTaxRate(lines: any[]): number {
    return lines.reduce((max: number, l: any) => {
      const stated = Number(l?.taxRate ?? 0);
      if (stated > 0) return Math.max(max, stated);

      const taxAmt = Number(l?.taxAmt ?? 0);
      const lineTotal = Number(l?.lineTotal ?? 0);
      if (taxAmt <= 0 || lineTotal <= 0) return max;

      // Exclusive: tax sits on top of lineTotal. Inclusive: lineTotal already contains it.
      const derived = l?.taxMode === 'Inclusive'
        ? (lineTotal - taxAmt > 0 ? taxAmt / (lineTotal - taxAmt) * 100 : 0)
        : taxAmt / lineTotal * 100;
      return Math.max(max, +derived.toFixed(4));
    }, 0);
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
      warehouseId: l.warehouseId ?? null,
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
      matchStatus: this.calcMatchStatus(poQty, grnQty, qty),
      isPartial: !!(l.isPartial ?? false)
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
    // A direct purchase has no GRN on purpose — the lines are the receipt. The per-line and
    // supplier checks for that path live in doSubmit(); only a GRN-based invoice needs one here.
    if (!this.isCashPurchase && !this.selectedGrnIds.length) {
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
    // Direct purchase: no GRN, so the invoice has to stand on its own. The AP leg needs a
    // supplier, and each line needs enough to post — a stock line (matched item + warehouse)
    // carries a receipt, an expense line (typed description) needs a Ledger. Caught here where
    // it can still be fixed; the server would otherwise drop the line or refuse the whole post.
    if (!draft && this.isCashPurchase) {
      if (!this.supplierId) {
        Swal.fire({ icon: 'warning', title: 'Supplier required', text: 'Pick who you bought from — the payable has to be owed to someone.', confirmButtonColor: '#16a34a' });
        return;
      }
      if (!this.lines.length) {
        Swal.fire({ icon: 'warning', title: 'No lines', text: 'Add what you bought.', confirmButtonColor: '#16a34a' });
        return;
      }
      const bad = this.lines.findIndex(l =>
        !l.itemName?.trim() || !(Number(l.unitPrice) > 0) || !l.budgetLineId);
      if (bad >= 0) {
        const l = this.lines[bad];
        Swal.fire({
          icon: 'warning',
          title: `Line ${bad + 1} is incomplete`,
          text: !l.itemName?.trim() ? 'Type what was bought.'
              : !(Number(l.unitPrice) > 0) ? 'Enter the unit price.'
              : 'Pick a Ledger — the cost needs an account to post to.',
          confirmButtonColor: '#16a34a'
        });
        return;
      }
    }

    const linesData = this.lines.map(l => ({
      itemId: l.itemId,
      itemCode: l.itemCode ?? null,
      itemName: l.itemName,
      locationId: l.locationId,
      // Read server-side to build the direct-purchase GRN and place the stock.
      warehouseId: l.warehouseId,
      poQty: l.poQty,
      grnQty: l.grnQty,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      taxMode: l.taxMode,
      // The tax % has no column on SupplierInvoicePin, so it rides in the line JSON the way
      // the PO lines already carry it. Without it an edit reloads with taxRate 0, re-rates
      // every line as Zero, and silently strips the tax off the invoice.
      taxRate: this.taxRate,
      lineTotal: l.lineTotal,
      taxAmt: l.taxAmt,
      lineGrandTotal: l.lineGrandTotal,
      budgetLineId: l.budgetLineId,
      dcNoteNo: l.dcNoteNo,
      remarks: l.remarks,
      matchStatus: l.matchStatus,
      isPartial: l.isPartial
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
      IsPartialInvoice: this.lines.some(l => l.isPartial),
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
