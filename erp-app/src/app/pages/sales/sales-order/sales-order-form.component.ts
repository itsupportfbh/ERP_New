import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SalesService } from '../sales.service';
import { PermissionService } from '../../../core/services/permission.service';
import Swal from 'sweetalert2';

type LineTaxMode = 'Standard-Rated' | 'Zero-Rated' | 'Exempt';
type LineSourceId = 1 | 2 | 3;

type SimpleItem = {
  id: number;
  itemName: string;
  itemCode?: string;
  uomId?: number | null;
  price?: number | null;
  baseUomId?: number | null;
  uomFactor?: number | null;
  baseUomName?: string | null;
};

type Country = { id: number; countryName: string; gstPercentage: number };

type Customer = {
  id: number;
  name: string;
  countryId: number;
  isCashSales?: boolean;
};

type CurrencyRow = { id: number; name: string; code?: string };
type PaymentTermsRow = { id: number; name: string; description: string };
type ItemSetHeaderRow = { id: number; setName: string; description?: string };
type QuotationRow = { id: number; label: string };

type UiLine = {
  itemId: number;
  itemName?: string;
  uomId: number | null;
  uomName?: string | null;
  // UOM conversion (from item master): selling UOM, base UOM and factor (base units per 1 selling UOM)
  sellUomId?: number | null;
  baseUomId?: number | null;
  uomFactor?: number | null;
  uomIdPrev?: number | null;
  baseQty?: number | null;
  qty: number | null;
  unitPrice: number | null;
  discountPct: number | null;
  description?: string;

  taxMode?: LineTaxMode;
  taxCodeId?: number | null;
  lineNet?: number;
  lineTax?: number;
  lineTotal?: number;

  isSetHeader?: boolean;
  itemSetId?: number | null;
  setName?: string;
  isFromSet?: boolean;

  fulfillmentMode: number | null;

  isSellable?: boolean;
  isConsumable?: boolean;
  allowManualFulfillment?: boolean;

  availability?: number;
  shortageQty?: number;
};

const STATUS_MAP: Record<number, string> = {
  0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Completed', 4: 'Rejected'
};

@Component({
  selector: 'erp-sales-order-form',
  standalone: false,
  templateUrl: './sales-order-form.component.html',
  styleUrls: ['./sales-order-form.component.scss']
})
export class SalesOrderFormComponent implements OnInit {

  // ── Route / state ───────────────────────────────────
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;

  number = '';
  minDate = '';

  // ── Header model ─────────────────────────────────────
  header = {
    status: 1,
    customerId: null as number | null,
    currencyId: 0,
    currency: '',
    fxRate: 1,
    paymentTermsId: 0,
    paymentTerms: '',

    orderDate: new Date().toISOString().substring(0, 10) as string | null,
    deliveryDate: null as string | null,
    orderTime: null as string | null,
    validityDate: null as string | null,
    deliveryTo: '',

    taxPct: 0,
    countryId: null as number | null,

    lineSourceId: 1 as LineSourceId,
    costCentre: '',
    customerPoNo: '',
    remarks: '',

    subtotal: 0,
    discountValue: 0,
    discountType: 'percent' as 'percent' | 'amount',
    discountAmount: 0,
    netTotal: 0,
    taxAmount: 0,
    rounding: 0,
    grandTotal: 0,
    needsHodApproval: false,

    isCashSales: false
  };

  // ── Create from quotation ───────────────────────────
  quotationId: number | null = null;
  quotations: QuotationRow[] = [];

  // ── Lookups ──────────────────────────────────────────
  customers: Customer[] = [];
  countries: Country[] = [];
  activeCustomerCountry: Country | null = null;

  currenciesSrv: CurrencyRow[] = [];
  paymentTermsSrv: PaymentTermsRow[] = [];
  itemsList: SimpleItem[] = [];
  uomList: Array<{ id: number; name: string }> = [];
  itemSets: ItemSetHeaderRow[] = [];

  // ── Customer searchable dd ──────────────────────────
  customerSearch = '';
  customerDdOpen = false;
  filteredCustomers: Customer[] = [];

  // ── Currency searchable dd ──────────────────────────
  currencySearch = '';
  currencyDdOpen = false;
  filteredCurrencies: CurrencyRow[] = [];

  // ── Payment terms searchable dd ─────────────────────
  paymentTermsSearch = '';
  paymentTermsDdOpen = false;
  filteredPaymentTerms: PaymentTermsRow[] = [];

  // ── Item set multi dd ───────────────────────────────
  itemSetSearch = '';
  itemSetDdOpen = false;
  filteredItemSets: ItemSetHeaderRow[] = [];
  selectedItemSets: ItemSetHeaderRow[] = [];
  selectedPackageIds: number[] = [];

  // ── Lines ────────────────────────────────────────────
  lines: UiLine[] = [];

  // ── Base currency (FX) ──────────────────────────────
  baseCurrencyId = 0;
  baseCurrencyName = 'SGD';
  grandTotalBase = 0;
  fxRateLoading = false;

  // ── Add-line modal ──────────────────────────────────
  showModal = false;
  modalPreview: { net: number; tax: number; total: number } | null = null;
  modal = {
    itemId: null as number | null,
    itemSearch: '',
    qty: null as number | null,
    uomId: null as number | null,
    sellUomId: null as number | null,
    baseUomId: null as number | null,
    uomFactor: 1 as number | null,
    uomIdPrev: null as number | null,
    baseQty: null as number | null,
    unitPrice: null as number | null,
    discountPct: 0 as number | null,
    taxMode: 'Standard-Rated' as LineTaxMode,
    fulfillmentMode: null as number | null,
    allowManualFulfillment: false,
    description: '',
    dropdownOpen: false,
    filteredItems: [] as SimpleItem[]
  };

  lineSourceOptions = [
    { value: 1, label: 'Items / Custom Selection' },
    { value: 2, label: 'Bundle Packages' }
  ];

  fulfillmentOptions: { value: number | null; label: string }[] = [
    { value: null, label: 'Select' },
    { value: 1, label: 'PP' },
    { value: 2, label: 'Direct DO' }
  ];

  // ── internal trackers ───────────────────────────────
  private loadedItemSetIds = new Set<number>();
  private uomNameToId = new Map<string, number>();
  private itemIdToSet = new Map<number, { itemSetId: number; setName: string }>();
  // package money values loaded from SalesOrderItemSetMap, keyed by itemSetId
  private setValuesById = new Map<number, { qty: number | null; unitPrice: number | null; discountPct: number | null; taxMode: any; lineNet: number | null; lineTax: number | null; lineTotal: number | null }>();
  private lastAutoRemarks: string | null = null;

  // Collapsed package sets (by itemSetId). Child lines hide when their set is collapsed.
  collapsedSets = new Set<number>();
  private seenSets = new Set<number>();
  toggleSet(itemSetId: number | null | undefined): void {
    const id = Number(itemSetId ?? 0);
    if (!id) return;
    if (this.collapsedSets.has(id)) this.collapsedSets.delete(id);
    else this.collapsedSets.add(id);
  }
  isSetCollapsed(itemSetId: number | null | undefined): boolean {
    return this.collapsedSets.has(Number(itemSetId ?? 0));
  }
  private isPackageChild(l: UiLine): boolean { return !!l.isFromSet && !l.isSetHeader; }

  loginUserId = Number(localStorage.getItem('id')) || null;
  private locationId = Number(localStorage.getItem('locationId') || 0);
  private availabilityCache = new Map<string, number>();

  @ViewChild('customerBox') customerBox!: ElementRef<HTMLElement>;
  @ViewChild('currencyBox') currencyBox!: ElementRef<HTMLElement>;
  @ViewChild('paymentBox') paymentBox!: ElementRef<HTMLElement>;
  @ViewChild('itemSetBox') itemSetBox!: ElementRef<HTMLElement>;
  @ViewChild('modalItemBox') modalItemBox!: ElementRef<HTMLElement>;

  readonly fnId = 'so-list';
  constructor(
    private svc: SalesService,
    private route: ActivatedRoute,
    private router: Router,
    public perm: PermissionService
  ) {}

  // ── Lifecycle ────────────────────────────────────────
  ngOnInit(): void {
    this.setMinDate();
    this.baseCurrencyId = Number(localStorage.getItem('companyCurrencyId') || 0);
    this.baseCurrencyName = (localStorage.getItem('companyCurrencyName') || '').trim() || 'SGD';

    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    this.id = this.isEdit ? Number(paramId) : null;

    this.loadLookups();

    if (this.isEdit && this.id && this.id > 0) {
      this.loadForEdit(this.id);
    }
  }

  // ── Helpers ──────────────────────────────────────────
  round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  get statusLabel(): string { return STATUS_MAP[this.header.status] ?? 'Pending'; }

  get packageNames(): string {
    return (this.selectedItemSets || []).map(s => s.setName).filter(Boolean).join(', ') || '—';
  }

  get title(): string {
    return this.isEdit
      ? `Edit Sales Order${this.number ? ' – ' + this.number : ''}`
      : 'New Sales Order';
  }

  getItemName(id?: number | null): string {
    return this.itemsList.find(x => x.id === id)?.itemName ?? '';
  }

  getUomName = (id?: number | null): string =>
    this.uomList.find(u => u.id === id)?.name ?? '';

  fulfillmentLabel(v: number | null | undefined): string {
    return v === 2 ? 'Direct DO' : v === 1 ? 'PP' : 'Select';
  }

  private normalizeUomName(v: any): string {
    return String(v ?? '').trim().toLowerCase();
  }

  private rebuildUomMap(): void {
    this.uomNameToId.clear();
    for (const u of this.uomList || []) {
      const key = this.normalizeUomName(u.name);
      if (key) this.uomNameToId.set(key, u.id);
    }
  }

  private getUomIdFromItemMaster(itemId: number): number | null {
    const it = this.itemsList.find(x => x.id === itemId);
    return (it?.uomId ?? null) as any;
  }

  private resolveUomIdFromItemSetRow(row: any, itemId: number): number | null {
    const rawUomId = row?.uomId ?? row?.UomId;
    if (rawUomId !== null && rawUomId !== undefined && rawUomId !== '') {
      const n = Number(rawUomId);
      if (!Number.isNaN(n) && n > 0) return n;
    }
    const uomName = row?.uomName ?? row?.UomName;
    const key = this.normalizeUomName(uomName);
    if (key && this.uomNameToId.has(key)) return this.uomNameToId.get(key)!;
    return this.getUomIdFromItemMaster(itemId);
  }

  private backfillMissingUoms(): void {
    if (!this.lines?.length) return;
    let changed = false;
    for (const l of this.lines) {
      if (l.isSetHeader) continue;
      if ((l.uomId === null || l.uomId === undefined) && l.uomName) {
        const key = this.normalizeUomName(l.uomName);
        const idd = key ? this.uomNameToId.get(key) : null;
        if (idd) { l.uomId = idd; changed = true; }
      }
    }
    if (changed) this.computeTotals();
  }

  // ── Tax mapping ──────────────────────────────────────
  private taxCodeIdToTaxMode(id?: number | null): LineTaxMode {
    switch (Number(id)) {
      case 1: return 'Standard-Rated';
      case 2: return 'Zero-Rated';
      case 3: return 'Exempt';
      default: return (+this.header.taxPct || 0) === 9 ? 'Standard-Rated' : 'Zero-Rated';
    }
  }

  taxModeToTaxCodeId(mode?: LineTaxMode): number {
    switch (mode) {
      case 'Standard-Rated': return 1;
      case 'Zero-Rated': return 2;
      case 'Exempt': return 3;
      default: return 1;
    }
  }

  get taxModesForCurrentGst(): LineTaxMode[] {
    // All three modes are always offered so a line can be taxed independently of the header's GST%.
    return ['Standard-Rated', 'Zero-Rated', 'Exempt'];
  }

  get taxModeItems(): { value: LineTaxMode; label: string }[] {
    return this.taxModesForCurrentGst.map(m => ({ value: m, label: m }));
  }

  get packageOptions(): { label: string; value: any }[] {
    return (this.itemSets || []).map(s => ({ label: s.setName, value: s.id }));
  }

  // ── Date helpers ─────────────────────────────────────
  setMinDate(): void {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    this.minDate = `${yyyy}-${mm}-${dd}`;
  }

  private toDateInputValue(v: any): string | null {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    if (typeof v === 'string' && v.includes('T')) return v.split('T')[0];
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // ── Outside click / esc ──────────────────────────────
  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    const t = ev.target as Node;
    if (this.customerDdOpen && this.customerBox && !this.customerBox.nativeElement.contains(t)) this.customerDdOpen = false;
    if (this.currencyDdOpen && this.currencyBox && !this.currencyBox.nativeElement.contains(t)) this.currencyDdOpen = false;
    if (this.paymentTermsDdOpen && this.paymentBox && !this.paymentBox.nativeElement.contains(t)) this.paymentTermsDdOpen = false;
    if (this.itemSetDdOpen && this.itemSetBox && !this.itemSetBox.nativeElement.contains(t)) this.itemSetDdOpen = false;
    if (this.showModal && this.modal.dropdownOpen && this.modalItemBox && !this.modalItemBox.nativeElement.contains(t)) {
      this.modal.dropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.customerDdOpen = this.currencyDdOpen = this.paymentTermsDdOpen = false;
    this.itemSetDdOpen = false;
    if (this.showModal) this.closeModal();
  }

  // ── Lookups ──────────────────────────────────────────
  loadLookups(): void {
    this.svc.getItems().subscribe((res: any) => {
      const raw = this.svc.unwrap(res);
      this.itemsList = raw.map((item: any) => ({
        id: Number(item.id ?? item.itemId ?? 0),
        itemName: item.itemName ?? item.name ?? '',
        itemCode: item.itemCode ?? '',
        uomId: Number(item.uomId ?? item.UomId ?? item.baseUomId ?? 0) || null,
        // Sales module always prices from the item's SALES price (legacy `price` kept as fallback).
        price: Number(item.salesPrice ?? item.SalesPrice ?? item.price ?? 0) || 0,
        baseUomId: Number(item.baseUomId ?? item.BaseUomId ?? 0) || null,
        uomFactor: Number(item.uomFactor ?? item.UomFactor ?? 1) || 1,
        baseUomName: item.baseUomName ?? item.BaseUomName ?? null
      })) as SimpleItem[];
    });

    this.svc.getUOMs().subscribe((res: any) => {
      this.uomList = this.svc.unwrap(res).map((u: any) => ({
        id: Number(u.id ?? u.Id),
        name: String(u.uomName ?? u.name ?? u.Name ?? '').trim()
      }));
      this.rebuildUomMap();
      this.backfillMissingUoms();
    });

    this.svc.getCountries().subscribe((res: any) => {
      this.countries = this.svc.unwrap(res).map((c: any) => ({
        id: Number(c.id ?? c.Id),
        countryName: String(c.countryName ?? c.CountryName ?? '').trim(),
        gstPercentage: Number(c.gstPercentage ?? c.GSTPercentage ?? 0)
      }));

      this.svc.getCustomers().subscribe((cres: any) => {
        const arr = this.svc.unwrap(cres);
        const dbCustomers: Customer[] = arr.map((c: any) => ({
          id: Number(c.id ?? c.Id),
          name: String(c.customerName ?? c.CustomerName ?? c.name ?? '').trim(),
          countryId: Number(c.countryId ?? c.CountryId ?? 0),
          isCashSales: false
        }));
        this.customers = [
          { id: 0, name: 'Cash Sales', countryId: 0, isCashSales: true },
          ...dbCustomers
        ];
      });
    });

    this.svc.getCurrencies().subscribe((res: any) => {
      this.currenciesSrv = this.svc.unwrap(res).map((r: any) => ({
        id: Number(r.id ?? r.Id),
        name: String(r.currencyName ?? r.CurrencyName ?? r.name ?? '').trim(),
        code: r.currencyCode ?? r.code ?? ''
      })) as CurrencyRow[];

      this.resolveBaseCurrency();
    });

    this.svc.getPaymentTerms().subscribe((res: any) => {
      this.paymentTermsSrv = this.svc.unwrap(res).map((r: any) => ({
        id: Number(r.id ?? r.Id),
        name: String(r.paymentTermsName ?? r.PaymentTermsName ?? r.termName ?? r.name ?? '').trim(),
        description: r.description ?? ''
      })) as PaymentTermsRow[];
    });

    this.svc.getItemSets().subscribe((res: any) => {
      this.itemSets = this.svc.unwrap(res).map((x: any) => ({
        id: Number(x.id ?? x.Id),
        setName: String(x.setName ?? x.SetName ?? x.name ?? '').trim(),
        description: String(x.description ?? x.Description ?? '').trim()
      })) as ItemSetHeaderRow[];
    });

    // Quotations available to convert into a Sales Order
    // (exclude quotations that have already been turned into a sales order)
    this.loadAvailableQuotations();
  }

  private mapQuotationRow = (q: any): QuotationRow => ({
    id: Number(q.id ?? q.Id),
    label: `${q.number ?? q.quotationNo ?? q.id}${(q.customerName ?? q.CustomerName) ? ' - ' + (q.customerName ?? q.CustomerName) : ''}`
  });

  // A quotation is expired once its validity date is strictly before today.
  private isQuotationExpired(q: any): boolean {
    const v = q.validityDate ?? q.ValidityDate;
    if (!v) return false;
    const d = new Date(v);
    if (isNaN(d.getTime())) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  }

  private loadAvailableQuotations(): void {
    forkJoin({
      quotes: this.svc.getQuotations(),
      orders: this.svc.getSalesOrders()
    }).subscribe({
      next: ({ quotes, orders }: any) => {
        const usedQuotationIds = new Set<number>(
          this.svc.unwrap(orders)
            .map((so: any) => Number(so.quotationNo ?? so.QuotationNo ?? 0))
            .filter((n: number) => n > 0)
        );
        this.quotations = this.svc.unwrap(quotes)
          // keep the quotation this SO was created from, even if used/expired;
          // otherwise drop used quotations and any past their validity date.
          .filter((q: any) => {
            const id = Number(q.id ?? q.Id);
            if (id === this.quotationId) return true;
            return !usedQuotationIds.has(id) && !this.isQuotationExpired(q);
          })
          .map(this.mapQuotationRow)
          .filter((q: QuotationRow) => q.id > 0);
      },
      error: () => {
        // Fallback: show all quotations if the sales-order list can't be loaded
        this.svc.getQuotations().subscribe((res: any) => {
          this.quotations = this.svc.unwrap(res)
            .filter((q: any) => Number(q.id ?? q.Id) === this.quotationId || !this.isQuotationExpired(q))
            .map(this.mapQuotationRow)
            .filter((q: QuotationRow) => q.id > 0);
        });
      }
    });
  }

  // ── Create from quotation ────────────────────────────
  onQuotationChange(): void {
    const qid = Number(this.quotationId);
    if (!qid || qid <= 0) return;
    this.loading = true;
    this.svc.getQuotationDetailsForSO(qid).subscribe({
      next: (res: any) => {
        const dto = this.svc.unwrapOne(res);
        if (!dto) { this.loading = false; return; }
        this.applyHeaderFromSource(dto);
        this.lines = this.mapApiLines(dto.lines ?? dto.Lines ?? dto.lineItems ?? []);

        // Rebuild package grouping carried over from the quotation
        const apiItemSets = dto.itemSets ?? dto.ItemSets ?? [];
        let sets: ItemSetHeaderRow[] = (apiItemSets || [])
          .map((x: any) => ({
            id: Number(x.itemSetId ?? x.ItemSetId ?? x.id ?? x.Id ?? 0),
            setName: String(x.setName ?? x.SetName ?? x.itemSetName ?? x.ItemSetName ?? '').trim()
          }))
          .filter((x: ItemSetHeaderRow) => x.id > 0);
        if (!sets.length) {
          const ids: number[] = String(dto.itemSetIds ?? dto.ItemSetIds ?? '')
            .split(',').map((n: any) => Number(n)).filter((n: number) => n > 0);
          sets = ids.map(sid => ({ id: sid, setName: `Set #${sid}` }));
        }
        this.selectedItemSets = sets;
        this.selectedPackageIds = sets.map(s => s.id);
        this.loadedItemSetIds.clear();
        this.selectedItemSets.forEach(s => this.loadedItemSetIds.add(s.id));

        // capture package-level money values (from SalesOrderItemSetMap) for header population
        this.setValuesById.clear();
        const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
        for (const x of (apiItemSets || [])) {
          const sid = Number(x.itemSetId ?? x.ItemSetId ?? x.id ?? x.Id ?? 0);
          if (sid <= 0) continue;
          this.setValuesById.set(sid, {
            qty: num(x.qty ?? x.Qty),
            unitPrice: num(x.unitPrice ?? x.UnitPrice),
            discountPct: num(x.discountPct ?? x.DiscountPct),
            taxMode: x.taxMode ?? x.TaxMode ?? null,
            lineNet: num(x.lineNet ?? x.LineNet),
            lineTax: num(x.lineTax ?? x.LineTax),
            lineTotal: num(x.lineTotal ?? x.LineTotal)
          });
        }
        if (sets.length) this.header.lineSourceId = 2 as LineSourceId;

        if (sets.length) {
          this.hydrateSetInfoForEditThenRebuildRows();
        } else {
          this.computeTotals();
          this.loadFlagsForLines(this.lines.filter(x => !x.isSetHeader));
        }
        this.loading = false;
      },
      error: () => { this.loading = false; void Swal.fire({ icon: 'error', title: 'Error', text: 'Unable to load quotation details.', confirmButtonColor: '#16a34a' }); }
    });
  }

  // Fetch each package's items, tag matching lines, then group under package headers.
  private hydrateSetInfoForEditThenRebuildRows(): void {
    const sets = (this.selectedItemSets || [])
      .map(s => ({ id: Number(s.id), setName: String(s.setName || '').trim() }))
      .filter(s => s.id > 0);

    if (!sets.length) {
      this.computeTotals();
      this.loadFlagsForLines(this.lines.filter(x => !x.isSetHeader));
      return;
    }

    const calls = sets.map(s => this.svc.getItemSetById(s.id));
    forkJoin(calls).subscribe({
      next: (responses: any[]) => {
        this.itemIdToSet.clear();
        responses.forEach((res: any, idx: number) => {
          const setId = sets[idx].id;
          const dto = this.svc.unwrapOne(res);
          const setName = sets[idx].setName || String(dto?.setName || `Set #${setId}`);
          const chip = this.selectedItemSets.find(s => s.id === setId);
          if (chip && (!chip.setName || /^Set #/.test(chip.setName))) chip.setName = setName;

          const rows: any[] = dto?.items ?? dto?.itemSetItems ?? dto?.lines ?? [];
          for (const r of rows) {
            const itemId = Number(r.itemId ?? r.ItemId ?? 0);
            if (!itemId) continue;
            if (!this.itemIdToSet.has(itemId)) this.itemIdToSet.set(itemId, { itemSetId: setId, setName });
          }
        });

        for (const l of this.lines) {
          if (l.isSetHeader) continue;
          const m = this.itemIdToSet.get(Number(l.itemId));
          if (m) { l.isFromSet = true; l.itemSetId = m.itemSetId; l.setName = m.setName; }
        }

        // Reconstruct each package's header price from its converted children
        // (they still carry their prices here) — used when SalesOrderItemSetMap
        // has no stored package values yet (e.g. converted from a quotation).
        for (const s of sets) {
          if (this.setValuesById.has(s.id)) continue; // prefer stored package values
          const kids = this.lines.filter(l => !l.isSetHeader && l.isFromSet && Number(l.itemSetId) === s.id);
          if (!kids.length) continue;
          const priceSum = this.round2(kids.reduce((acc, k) => acc + (+(k.unitPrice ?? 0) || 0), 0));
          const qty = kids[0].qty ?? null;
          if (priceSum > 0 || qty != null) {
            this.setValuesById.set(s.id, {
              qty, unitPrice: priceSum > 0 ? priceSum : null,
              discountPct: null, taxMode: null, lineNet: null, lineTax: null, lineTotal: null
            });
          }
        }

        this.rebuildLinesWithSetHeaders();
        this.syncAllSetHeaders();
        this.computeTotals();
        this.loadFlagsForLines(this.lines.filter(x => !x.isSetHeader));
      },
      error: () => {
        this.computeTotals();
        this.loadFlagsForLines(this.lines.filter(x => !x.isSetHeader));
      }
    });
  }

  private rebuildLinesWithSetHeaders(): void {
    const items = this.lines.filter(x => !x.isSetHeader);
    const rebuilt: UiLine[] = [];
    const added = new Set<number>();
    const setOrder = (this.selectedItemSets || []).map(s => Number(s.id));

    for (const sid of setOrder) {
      const setName = this.selectedItemSets.find(x => x.id === sid)?.setName || `Set #${sid}`;
      const group = items.filter(x => x.isFromSet && Number(x.itemSetId) === sid);
      if (!group.length) continue;
      rebuilt.push(this.makeSetHeader(sid, setName));
      for (const g of group) rebuilt.push(g);
      added.add(sid);
    }

    const nonSet = items.filter(x => !x.isFromSet || !x.itemSetId);
    for (const l of nonSet) rebuilt.push(l);

    this.lines = rebuilt;
  }

  private applyHeaderFromSource(dto: any): void {
    const custId = Number(dto.customerId ?? dto.CustomerId ?? 0);
    const custName = dto.customerName ?? dto.CustomerName ?? '';
    const isCash = !!(dto.isCashSales ?? dto.IsCashSales ?? false) || (custId === 0 && !String(custName).trim());
    if (custId > 0) {
      this.header.customerId = custId;
      this.onCustomerChange(custId);
      if (custName) this.customerSearch = String(custName);
    } else if (isCash) {
      // Cash-sales quotation carries customerId 0 (synthetic Cash Sales customer).
      // custId > 0 alone would drop it, so bind the Cash Sales entry explicitly.
      const cashCust = this.customers.find(x => x.isCashSales) || { id: 0, name: 'Cash Sales', countryId: 0, isCashSales: true } as Customer;
      this.onCustomerChange(0, cashCust);
      this.customerSearch = custName ? String(custName) : 'Cash Sales';
    }
    const curId = Number(dto.currencyId ?? dto.CurrencyId ?? 0);
    if (curId > 0) {
      this.header.currencyId = curId;
      const curName = dto.currencyName ?? dto.CurrencyName ?? '';
      if (curName) { this.currencySearch = String(curName); this.header.currency = String(curName); }
    }
    if (dto.fxRate ?? dto.FxRate) this.header.fxRate = Number(dto.fxRate ?? dto.FxRate);
    // Quotations saved before the base-currency fix carry an fxRate of 1; re-fetch so the
    // order converts against the real rate instead of inheriting the broken one.
    this.resolveBaseCurrency();
    const payId = Number(dto.paymentTermsId ?? dto.PaymentTermsId ?? 0);
    if (payId > 0) {
      this.header.paymentTermsId = payId;
      const payName = dto.paymentTermsName ?? dto.PaymentTermsName ?? '';
      if (payName) { this.paymentTermsSearch = String(payName); this.header.paymentTerms = String(payName); }
    }
    if (dto.deliveryDate ?? dto.DeliveryDate) this.header.deliveryDate = this.toDateInputValue(dto.deliveryDate ?? dto.DeliveryDate);
    if (dto.remarks ?? dto.Remarks) this.header.remarks = String(dto.remarks ?? dto.Remarks);
    if (dto.deliveryTo ?? dto.DeliveryTo) this.header.deliveryTo = String(dto.deliveryTo ?? dto.DeliveryTo);
    if (dto.orderTime ?? dto.OrderTime) this.header.orderTime = String(dto.orderTime ?? dto.OrderTime);
    const taxPct = dto.taxPct ?? dto.TaxPct ?? dto.gstPct ?? dto.GstPct ?? dto.taxPercent ?? dto.TaxPercent;
    if (taxPct != null) this.header.taxPct = Number(taxPct);
    const srcId = dto.lineSourceId ?? dto.LineSourceId;
    if (srcId != null) this.header.lineSourceId = Number(srcId) as LineSourceId;
  }

  // ── Item flags ───────────────────────────────────────
  private loadFlagsForLines(lines: UiLine[]): void {
    const ids = Array.from(new Set(
      (lines || []).filter(x => !x.isSetHeader && (x.itemId || 0) > 0).map(x => Number(x.itemId))
    ));
    if (!ids.length) return;

    this.svc.getItemFlagsBulk(ids).subscribe({
      next: (res: any) => {
        const arr: any[] = (res?.data ?? res ?? []) as any;
        if (!Array.isArray(arr)) return;
        const map = new Map<number, any>();
        for (const f of arr) map.set(Number(f.itemId), f);
        for (const l of lines) {
          if (l.isSetHeader) continue;
          const f = map.get(Number(l.itemId));
          if (!f) continue;
          l.isSellable = !!f.isSellable;
          l.isConsumable = !!f.isConsumable;
          l.allowManualFulfillment = !!f.allowManualFulfillment;
          this.applyFulfillmentByPolicy(l);
          // Finished food stock is not maintained, so keep "Both" items in the
          // normal DO flow instead of Pending Fulfillment.
          if (!this.isEdit && l.allowManualFulfillment) l.fulfillmentMode = 2;
        }
        this.syncAllSetHeaders();
        this.computeTotals();
      },
      error: () => { /* degrade gracefully */ }
    });
  }

  // System's automatic fulfillment from item flags: sellable-only (Sales Item) → PP,
  // consumable-only (Purchase Item) → Direct DO, both/neither → Direct DO (default).
  private autoFulfillmentFromFlags(l: UiLine): number {
    // Recipe / Production Planning module is hidden — no screen can complete a PP
    // line (set its ProcurementStatus to 4), so a PP line would get stuck and could
    // never be delivered or invoiced. Route everything to Direct DO (ship from stock)
    // so the plain Sales flow works standalone. Restore the PP branch below when the
    // Recipe/Production module is re-enabled.
    //   if (l.isSellable && !l.isConsumable) return 1; // Sales Item → PP
    return 2; // all items → Direct DO (ship from stock)
  }


  // Sales should not run recipe/finished-item shortage routing now; every line
  // stays in the normal DO flow.
  private applyFulfillmentByPolicy(l: UiLine): void {
    if (l.isSetHeader) return;
    l.fulfillmentMode = 2;
  }

  onFulfillmentChanged(l: UiLine, i: number): void {
    l.fulfillmentMode = (l.fulfillmentMode == null || (l.fulfillmentMode as any) === '')
      ? null
      : Number(l.fulfillmentMode);
    this.onLineChanged(i);
  }

  // ── Edit load ────────────────────────────────────────
  private mapApiLines(apiLines: any): UiLine[] {
    const arr: any[] = Array.isArray(apiLines)
      ? apiLines
      : (typeof apiLines === 'string' ? this.safeParse(apiLines) : []);
    const rawLines: UiLine[] = [];
    for (const l of arr) {
      const itemId = Number(l.itemId ?? l.ItemId ?? 0);
      if (!itemId) continue;

      const taxCodeId = Number(l.taxCodeId ?? l.TaxCodeId ?? 0);
      const taxModeRaw = (l.taxMode ?? l.TaxMode ?? l.tax ?? l.Tax ?? null) as any;
      const taxMode: LineTaxMode = (taxModeRaw ? taxModeRaw : this.taxCodeIdToTaxMode(taxCodeId)) as LineTaxMode;
      const fulfillmentMode = this.getRawFulfillment(l);

      const ui: UiLine = {
        itemId,
        itemName: String(l.itemName ?? l.ItemName ?? this.getItemName(itemId) ?? ''),
        uomId: (l.uomId ?? l.UomId) != null ? Number(l.uomId ?? l.UomId) : null,
        uomName: l.uomName ?? l.UomName ?? l.uom ?? l.Uom ?? null,
        qty: Number(l.qty ?? l.Qty ?? l.quantity ?? 0),
        unitPrice: Number(l.unitPrice ?? l.UnitPrice ?? 0),
        discountPct: Number(l.discountPct ?? l.DiscountPct ?? l.discount ?? l.Discount ?? 0),
        description: String(l.description ?? l.Description ?? l.remarks ?? ''),
        taxMode,
        taxCodeId: (!Number.isNaN(taxCodeId) && taxCodeId > 0) ? taxCodeId : this.taxModeToTaxCodeId(taxMode),
        isFromSet: false,
        itemSetId: null,
        setName: '',
        isSetHeader: false,
        fulfillmentMode,
        isSellable: false,
        isConsumable: false,
        allowManualFulfillment: false
      };
      this.attachUomConversion(ui);
      this.computeLine(ui);
      rawLines.push(ui);
    }
    return rawLines;
  }

  private safeParse(s: string): any[] {
    try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }

  private loadForEdit(id: number): void {
    this.loading = true;
    this.svc.getSalesOrderById(id).subscribe({
      next: (res: any) => {
        const dto = this.svc.unwrapOne(res);
        if (!dto) { this.loading = false; return; }

        this.number = String(dto.salesOrderNo ?? dto.SalesOrderNo ?? dto.soNo ?? dto.number ?? '');
        // linked quotation (Quotation No dropdown)
        this.quotationId = Number(dto.quotationNo ?? dto.QuotationNo ?? dto.quotationId ?? dto.QuotationId ?? 0) || null;
        if (this.quotationId) this.loadAvailableQuotations();

        this.header = {
          ...this.header,
          status: Number(dto.approvalStatus ?? dto.ApprovalStatus ?? dto.status ?? dto.Status ?? 1),
          customerId: Number(dto.customerId ?? dto.CustomerId ?? 0) || null,
          currencyId: Number(dto.currencyId ?? dto.CurrencyId ?? 0),
          fxRate: Number(dto.fxRate ?? dto.FxRate ?? 1),
          paymentTermsId: Number(dto.paymentTermId ?? dto.PaymentTermId ?? dto.paymentTermsId ?? 0),
          orderDate: this.toDateInputValue(dto.orderDate ?? dto.OrderDate ?? dto.requestedDate) ?? this.header.orderDate,
          deliveryDate: this.toDateInputValue(dto.deliveryDate ?? dto.DeliveryDate),
          validityDate: this.toDateInputValue(dto.validityDate ?? dto.ValidityDate),
          orderTime: dto.orderTime ?? dto.OrderTime ?? null,
          deliveryTo: String(dto.deliveryTo ?? dto.DeliveryTo ?? dto.location ?? dto.Location ?? ''),
          remarks: String(dto.remarks ?? dto.Remarks ?? ''),
          rounding: Number(dto.rounding ?? dto.Rounding ?? 0),
          taxPct: Number(dto.taxPct ?? dto.gstPct ?? dto.GstPct ?? 0) || 0,
          lineSourceId: (Number(dto.lineSourceId ?? dto.LineSource ?? 1) as LineSourceId),
          costCentre: String(dto.costCentre ?? dto.CostCentre ?? ''),
          customerPoNo: String(dto.customerPoNo ?? dto.CustomerPoNo ?? ''),
          isCashSales: !!(dto.isCashSales ?? dto.IsCashSales ?? false),
          discountValue: Number(dto.discountValue ?? dto.DiscountValue ?? 0),
          discountType: ((dto.discountType ?? dto.DiscountType ?? 'percent') === 'amount' ? 'amount' : 'percent') as 'percent' | 'amount',
          subtotal: 0, discountAmount: 0, netTotal: 0, taxAmount: 0, grandTotal: 0, needsHodApproval: false,
          currency: this.header.currency, paymentTerms: this.header.paymentTerms,
          countryId: this.header.countryId
        };

        const custId = Number(dto.customerId ?? dto.CustomerId ?? 0);
        const custName = dto.customerName ?? dto.CustomerName ?? '';
        if (custId === 0 || !String(custName).trim()) {
          this.customerSearch = custName ? String(custName) : 'Cash Sales';
          this.header.isCashSales = custId === 0;
        } else {
          this.customerSearch = String(custName);
          this.header.isCashSales = false;
        }

        const curName = dto.currencyName ?? dto.CurrencyName;
        if (curName) { this.currencySearch = String(curName); this.header.currency = String(curName); }

        const payName = dto.paymentTermsName ?? dto.PaymentTermsName;
        if (payName) { this.paymentTermsSearch = String(payName); this.header.paymentTerms = String(payName); }

        this.lines = this.mapApiLines(dto.salesOrderLines ?? dto.SalesOrderLines ?? dto.lines ?? dto.Lines ?? dto.lineItems ?? []);

        // Load package grouping so the package header rows render on edit
        const apiItemSets = dto.itemSets ?? dto.ItemSets ?? [];
        const sets: ItemSetHeaderRow[] = (apiItemSets || [])
          .map((x: any) => ({
            id: Number(x.itemSetId ?? x.ItemSetId ?? x.id ?? x.Id ?? 0),
            setName: String(x.setName ?? x.SetName ?? x.itemSetName ?? x.ItemSetName ?? '').trim()
          }))
          .filter((x: ItemSetHeaderRow) => x.id > 0);
        this.selectedItemSets = sets;
        this.selectedPackageIds = sets.map(s => s.id);
        this.loadedItemSetIds.clear();
        this.selectedItemSets.forEach(s => this.loadedItemSetIds.add(s.id));
        if (sets.length) this.header.lineSourceId = 2 as LineSourceId;

        // package-level money values (from SalesOrderItemSetMap) for header population
        this.setValuesById.clear();
        const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
        for (const x of (apiItemSets || [])) {
          const sid = Number(x.itemSetId ?? x.ItemSetId ?? x.id ?? x.Id ?? 0);
          if (sid <= 0) continue;
          this.setValuesById.set(sid, {
            qty: num(x.qty ?? x.Qty),
            unitPrice: num(x.unitPrice ?? x.UnitPrice),
            discountPct: num(x.discountPct ?? x.DiscountPct),
            taxMode: x.taxMode ?? x.TaxMode ?? null,
            lineNet: num(x.lineNet ?? x.LineNet),
            lineTax: num(x.lineTax ?? x.LineTax),
            lineTotal: num(x.lineTotal ?? x.LineTotal)
          });
        }

        this.loading = false;
        if (sets.length) {
          this.hydrateSetInfoForEditThenRebuildRows();
        } else {
          this.computeTotals();
          this.loadFlagsForLines(this.lines.filter(x => !x.isSetHeader));
        }
      },
      error: () => {
        this.loading = false;
        void Swal.fire({ icon: 'error', title: 'Error', text: 'Unable to load sales order for edit.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  private getRawFulfillment(src: any): number | null {
    const raw = src?.supplyMethod ?? src?.SupplyMethod ??
      src?.supplyMethodId ?? src?.SupplyMethodId ??
      src?.fulfillmentMode ?? src?.FulfillmentMode ?? null;
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return (n === 1 || n === 2) ? n : null;
  }

  private makeSetHeader(itemSetId: number, setName: string): UiLine {
    // Collapse a package the first time it appears; later rebuilds keep the user's toggle.
    if (!this.seenSets.has(itemSetId)) {
      this.seenSets.add(itemSetId);
      this.collapsedSets.add(itemSetId);
    }
    return {
      itemId: 0, uomId: null, qty: null, unitPrice: null, discountPct: 0,
      taxMode: 'Standard-Rated', isSetHeader: true, isFromSet: true,
      itemSetId, setName, description: '', fulfillmentMode: null
    };
  }

  // ── Package (set) header controls ────────────────────
  private setChildren(setId: number | null | undefined): UiLine[] {
    if (setId == null) return [];
    return this.lines.filter(
      l => !l.isSetHeader && l.isFromSet && Number(l.itemSetId) === Number(setId)
    );
  }

  // Spread the package's total price across its child lines (sum === package price).
  private distributeSetPrice(header: UiLine): void {
    const kids = this.setChildren(header.itemSetId);
    const n = kids.length;
    if (!n) return;
    const total = Math.max(0, +(header.unitPrice ?? 0) || 0);
    const share = this.round2(total / n);
    let acc = 0;
    kids.forEach((k, idx) => {
      k.unitPrice = idx === n - 1 ? this.round2(total - acc) : share;
      if (idx !== n - 1) acc = this.round2(acc + share);
      this.computeLine(k);
    });
  }

  onSetQtyChange(header: UiLine): void {
    const q = header.qty == null || (header.qty as any) === '' ? null : Math.max(0, +header.qty);
    header.qty = q;
    // package qty flows into every child line's qty (children stay money-zero)
    for (const k of this.setChildren(header.itemSetId)) { k.qty = q; }
    this.computeTotals();
  }

  // Package Price stays on the header (children are money-zero).
  onSetPriceChange(header: UiLine): void {
    header.unitPrice = header.unitPrice == null || (header.unitPrice as any) === ''
      ? null : Math.max(0, +header.unitPrice);
    this.computeTotals();
  }

  // Any other header field (discount / tax) changed → recompute.
  onSetLineChanged(_header: UiLine): void {
    this.computeTotals();
  }

  onSetFulfillmentChange(header: UiLine): void {
    const fm = header.fulfillmentMode == null || (header.fulfillmentMode as any) === ''
      ? null : Number(header.fulfillmentMode);
    header.fulfillmentMode = fm;
    // locked (non-manual) items keep their system-decided value
    for (const k of this.setChildren(header.itemSetId)) {
      if (k.allowManualFulfillment) k.fulfillmentMode = fm;
    }
    this.computeTotals();
  }

  private refreshSetHeaderTotal(header: UiLine): void {
    const kids = this.setChildren(header.itemSetId);
    header.lineNet = this.round2(kids.reduce((s, k) => s + (k.lineNet || 0), 0));
    header.lineTax = this.round2(kids.reduce((s, k) => s + (k.lineTax || 0), 0));
    header.lineTotal = this.round2(kids.reduce((s, k) => s + (k.lineTotal || 0), 0));
  }

  private syncAllSetHeaders(): void {
    for (const header of this.lines) {
      if (!header.isSetHeader) continue;
      const kids = this.setChildren(header.itemSetId);
      const v = this.setValuesById.get(Number(header.itemSetId ?? 0));

      // Populate the header ONCE (while still un-edited: unitPrice == null).
      // Never overwrite a price the user has already typed.
      if (header.unitPrice == null) {
        if (v && (v.qty != null || v.unitPrice != null || v.lineTotal != null)) {
          header.qty = v.qty ?? (kids.length ? kids[0].qty ?? null : null);
          header.unitPrice = v.unitPrice ?? null;
          header.discountPct = v.discountPct ?? null;
          if (v.taxMode) header.taxMode = v.taxMode;
        } else if (kids.length) {
          header.qty = header.qty ?? kids[0].qty ?? null;
        }
      }
      // keep children qty in sync with the header (money stays zero)
      if (header.qty != null) for (const k of kids) k.qty = header.qty;
      this.computeLine(header);
    }
  }

  // ── Line source ──────────────────────────────────────
  onLineSourceChange(): void {
    if (this.showModal) this.closeModal();
    const src = Number(this.header.lineSourceId) as LineSourceId;
    this.header.lineSourceId = src;

    if (src === 1) {
      this.selectedItemSets = [];
      this.selectedPackageIds = [];
      this.itemSetSearch = '';
      this.lines = this.lines.filter(l => !l.isFromSet && !l.isSetHeader);
      this.loadedItemSetIds.clear();
    }
    if (src === 2) {
      this.lines = this.lines.filter(l => l.isFromSet || l.isSetHeader);
    }
    this.computeTotals();
  }

  // The Source Line dropdown was removed, so both input modes are always available:
  // custom "Add Line" and the package selector. (lineSourceId is still sent in the payload
  // for backend compatibility.)
  get canAddManual(): boolean {
    return true;
  }
  get showPackages(): boolean {
    return true;
  }

  // ── Customer dd ──────────────────────────────────────
  openCustomerDropdown(): void {
    this.customerDdOpen = true;
    this.filteredCustomers = (this.customers || []).slice(0, 50);
  }
  filterCustomers(): void {
    const q = (this.customerSearch || '').trim().toLowerCase();
    this.filteredCustomers = !q
      ? (this.customers || []).slice(0, 50)
      : (this.customers || []).filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 50);
    this.customerDdOpen = true;
  }
  selectCustomer(c: Customer): void {
    this.customerSearch = c.name;
    this.customerDdOpen = false;
    this.onCustomerChange(c.id, c);
  }
  onCustomerChange(custId: number | null, selectedCustomer?: Customer): void {
    this.header.customerId = custId;
    const cust = selectedCustomer || this.customers.find(x => x.id === custId) || null;

    if (cust?.isCashSales) {
      this.header.isCashSales = true;
      this.header.countryId = null;
      this.activeCustomerCountry = null;
      this.header.taxPct = 0;
      this.lines.forEach(l => {
        if (!l.isSetHeader) {
          l.taxMode = 'Zero-Rated';
          l.taxCodeId = this.taxModeToTaxCodeId('Zero-Rated');
          this.computeLine(l);
        }
      });
      this.computeTotals();
      return;
    }

    this.header.isCashSales = false;
    this.header.countryId = cust?.countryId ?? null;
    const country = this.countries.find(c => c.id === (cust?.countryId ?? -1)) || null;
    this.activeCustomerCountry = country;
    this.header.taxPct = country?.gstPercentage ?? 0;

    const gst = +this.header.taxPct || 0;
    if (gst !== 9) {
      this.lines.forEach(l => {
        if (!l.isSetHeader && (l.taxMode === 'Standard-Rated' || l.taxMode === 'Exempt')) {
          l.taxMode = 'Zero-Rated';
          l.taxCodeId = this.taxModeToTaxCodeId('Zero-Rated');
          this.computeLine(l);
        }
      });
    }

    if (this.showModal) {
      if ((+this.header.taxPct || 0) !== 9 && this.modal.taxMode !== 'Zero-Rated') {
        this.modal.taxMode = 'Zero-Rated';
      }
      this.previewLineTotals();
    }
    this.computeTotals();
  }

  // ── Currency dd ──────────────────────────────────────
  openCurrencyDropdown(): void {
    this.currencyDdOpen = true;
    this.filteredCurrencies = this.currenciesSrv.slice();
  }
  filterCurrencies(): void {
    const q = (this.currencySearch || '').trim().toUpperCase();
    this.filteredCurrencies = !q ? this.currenciesSrv.slice()
      : this.currenciesSrv.filter(c => c.name.toUpperCase().includes(q));
    this.currencyDdOpen = true;
  }
  selectCurrency(cur: CurrencyRow): void {
    this.currencySearch = cur.name;
    this.currencyDdOpen = false;
    this.header.currencyId = cur.id;
    this.header.currency = cur.name;
    this.ensureBaseCurrencyId();

    if (cur.id === this.baseCurrencyId) {
      this.header.fxRate = 1;
      this.computeTotals();
      this.calcGrandTotalBase();
    } else {
      this.fetchFxRate(cur.id);
      this.computeTotals();
    }
  }

  // ── Payment terms dd ─────────────────────────────────
  openPaymentTermsDropdown(): void {
    this.paymentTermsDdOpen = true;
    this.filteredPaymentTerms = this.paymentTermsSrv.slice();
  }
  filterPaymentTerms(): void {
    const q = (this.paymentTermsSearch || '').trim().toLowerCase();
    this.filteredPaymentTerms = !q ? this.paymentTermsSrv.slice()
      : this.paymentTermsSrv.filter(p => p.name.toLowerCase().includes(q));
    this.paymentTermsDdOpen = true;
  }
  selectPaymentTerms(p: PaymentTermsRow): void {
    this.paymentTermsSearch = p.name;
    this.paymentTermsDdOpen = false;
    this.header.paymentTermsId = p.id;
    this.header.paymentTerms = p.name;

    const desc = (p.description || '').trim();
    if (!desc) return;
    const current = (this.header.remarks || '').trim();
    if (!current) { this.header.remarks = desc; this.lastAutoRemarks = desc; return; }
    if (this.lastAutoRemarks && current === this.lastAutoRemarks.trim()) {
      this.header.remarks = desc; this.lastAutoRemarks = desc; return;
    }
    this.header.remarks = `${this.header.remarks}\n${desc}`;
    this.lastAutoRemarks = desc;
  }

  // ── Item set multi ───────────────────────────────────
  trackByItemSetId = (_: number, s: ItemSetHeaderRow) => s.id;
  trackByItemId = (_: number, it: SimpleItem) => it.id;

  toggleItemSetDropdown(): void {
    this.itemSetDdOpen = !this.itemSetDdOpen;
    if (this.itemSetDdOpen) this.filterItemSets();
  }
  openItemSetDropdown(): void {
    this.itemSetDdOpen = true;
    this.filterItemSets();
  }
  isItemSetSelected(id: number): boolean {
    return this.selectedItemSets.some(x => x.id === id);
  }
  filterItemSets(): void {
    const q = (this.itemSetSearch || '').trim().toLowerCase();
    this.filteredItemSets = (this.itemSets || [])
      .filter(s => !this.selectedItemSets.some(x => x.id === s.id))
      .filter(s => !q || (s.setName || '').toLowerCase().includes(q))
      .slice(0, 60);
    this.itemSetDdOpen = true;
  }
  addItemSetDirect(s: ItemSetHeaderRow): void {
    if (this.selectedItemSets.some(x => x.id === s.id)) return;
    this.selectedItemSets.push(s);
    this.loadItemSetItemsAndAppend(s.id, s.setName);
    this.itemSetSearch = '';
    this.filterItemSets();
    setTimeout(() => { this.itemSetDdOpen = true; }, 0);
  }
  removeItemSet(setId: number): void {
    this.selectedItemSets = this.selectedItemSets.filter(s => s.id !== setId);
    this.selectedPackageIds = this.selectedPackageIds.filter(id => id !== setId);
    this.lines = this.lines.filter(l => l.itemSetId !== setId);
    this.loadedItemSetIds.delete(setId);
    this.computeTotals();
  }

  onPackageSelectionChange(newIds: number[]): void {
    const oldIds = this.selectedItemSets.map(s => s.id);
    const added = newIds.filter(id => !oldIds.includes(id));
    for (const id of added) {
      const set = this.itemSets.find(s => s.id === id);
      if (set) this.addItemSetDirect(set);
    }
    const removed = oldIds.filter(id => !newIds.includes(id));
    for (const id of removed) {
      this.removeItemSet(id);
    }
  }

  private loadItemSetItemsAndAppend(itemSetId: number, setName: string): void {
    if (this.loadedItemSetIds.has(itemSetId)) return;
    this.loadedItemSetIds.add(itemSetId);

    this.svc.getItemSetById(itemSetId).subscribe({
      next: (res: any) => {
        const dto = this.svc.unwrapOne(res);
        const rows: any[] = dto?.items ?? dto?.itemSetItems ?? dto?.lines ?? [];
        if (!rows.length) { this.loadedItemSetIds.delete(itemSetId); return; }

        this.lines = this.lines.filter(x => x.itemSetId !== itemSetId);
        const setHeader = this.makeSetHeader(itemSetId, dto?.setName ?? setName);
        // Auto-fill the package's default price onto the header (user can still edit it).
        const setPrice = Number(dto?.price ?? dto?.Price ?? 0) || 0;
        if (setPrice > 0) setHeader.unitPrice = setPrice;
        this.lines.push(setHeader);

        const defaultTax: LineTaxMode = (+this.header.taxPct || 0) === 9 ? 'Standard-Rated' : 'Zero-Rated';

        for (const it of rows) {
          const itemId = Number(it.itemId ?? it.ItemId ?? it.id ?? 0);
          if (!itemId) continue;
          const item = this.itemsList.find(x => x.id === itemId);
          const uomId = (item?.uomId ?? this.resolveUomIdFromItemSetRow(it, itemId)) as number | null;

          const line: UiLine = {
            itemId,
            itemName: String(it.itemName ?? it.ItemName ?? this.getItemName(itemId) ?? ''),
            uomId,
            uomName: it.uomName ?? it.UomName ?? null,
            qty: null,
            unitPrice: null,
            discountPct: 0,
            description: String(it.description ?? it.Description ?? ''),
            taxMode: defaultTax,
            taxCodeId: this.taxModeToTaxCodeId(defaultTax),
            isFromSet: true,
            itemSetId,
            setName: dto?.setName ?? setName,
            isSetHeader: false,
            fulfillmentMode: this.getRawFulfillment(it),
            isSellable: false,
            isConsumable: false,
            allowManualFulfillment: false
          };
          this.attachUomConversion(line);
          this.computeLine(line);
          this.lines.push(line);
        }
        this.syncAllSetHeaders();
        this.computeTotals();
        this.loadFlagsForLines(this.lines.filter(x => !x.isSetHeader));
      },
      error: () => this.loadedItemSetIds.delete(itemSetId)
    });
  }

  // ── Line compute ─────────────────────────────────────
  onLineChanged(i: number): void {
    const l = this.lines[i];
    if (!l || l.isSetHeader) return;

    const qty = l.qty === null || l.qty === undefined ? 0 : +l.qty;
    const price = l.unitPrice === null || l.unitPrice === undefined ? 0 : +l.unitPrice;
    l.qty = qty < 0 ? 0 : qty;
    l.unitPrice = price < 0 ? 0 : price;
    const disc = +(l.discountPct ?? 0) || 0;
    l.discountPct = Math.min(100, Math.max(0, disc));

    if (!l.taxMode && l.taxCodeId != null) l.taxMode = this.taxCodeIdToTaxMode(l.taxCodeId);
    l.taxCodeId = this.taxModeToTaxCodeId(l.taxMode);

    l.fulfillmentMode = (l.fulfillmentMode == null || (l.fulfillmentMode as any) === '') ? null : Number(l.fulfillmentMode);

    this.computeLine(l);
    this.computeTotals();
  }

  // ── UOM conversion (Selling UOM ↔ Base UOM) ──────────
  private round4(n: number): number { return Math.round((Number(n) || 0) * 10000) / 10000; }

  private attachUomConversion(l: UiLine): void {
    const it = this.itemsList.find(x => x.id === Number(l.itemId));
    const sell = (it?.uomId ?? l.uomId ?? null) as number | null;
    const base = (it?.baseUomId ?? sell) as number | null;
    const factor = Number(it?.uomFactor ?? 1) || 1;
    l.sellUomId = sell;
    l.baseUomId = base;
    l.uomFactor = factor;
    if (l.uomId == null) l.uomId = sell;
    l.uomIdPrev = l.uomId;
    this.recomputeBaseQty(l);
  }

  private recomputeBaseQty(l: UiLine): void {
    const qty = l.qty == null ? 0 : +l.qty;
    const factor = Number(l.uomFactor ?? 1) || 1;
    const inBase = l.baseUomId != null && Number(l.uomId) === Number(l.baseUomId);
    l.baseQty = this.round4(inBase ? qty : qty * factor);
  }

  lineUomOptions(l: UiLine): { id: number; name: string }[] {
    const opts: { id: number; name: string }[] = [];
    const add = (id: number | null | undefined) => {
      if (id == null) return;
      if (opts.some(o => o.id === Number(id))) return;
      opts.push({ id: Number(id), name: this.getUomName(id) || String(id) });
    };
    add(l.sellUomId ?? l.uomId);
    add(l.baseUomId);
    add(l.uomId);
    return opts;
  }

  onLineUomChange(i: number): void {
    const l = this.lines[i];
    // Qty stays as entered; convert only the Unit Price so it is per the chosen UOM
    // (e.g. 12 / CTN → 1 / KG when 1 CTN = 12 KG). Base Qty + totals recompute below.
    if (!l.isFromSet) {
      const factor = Number(l.uomFactor ?? 1) || 1;
      const prev = l.uomIdPrev ?? null;
      const next = l.uomId ?? null;
      if (prev !== next && factor > 0 && l.baseUomId != null && l.sellUomId != null && Number(l.baseUomId) !== Number(l.sellUomId) && l.unitPrice != null) {
        const toBase = Number(next) === Number(l.baseUomId) && Number(prev) === Number(l.sellUomId);
        const toSell = Number(next) === Number(l.sellUomId) && Number(prev) === Number(l.baseUomId);
        if (toBase) l.unitPrice = this.round4(+l.unitPrice / factor);
        else if (toSell) l.unitPrice = this.round4(+l.unitPrice * factor);
      }
    }
    l.uomIdPrev = l.uomId;
    this.onLineChanged(i);
  }

  modalUomOptions(): { id: number; name: string }[] {
    const opts: { id: number; name: string }[] = [];
    const add = (id: number | null | undefined) => {
      if (id == null) return;
      if (opts.some(o => o.id === Number(id))) return;
      opts.push({ id: Number(id), name: this.getUomName(id) || String(id) });
    };
    add(this.modal.sellUomId ?? this.modal.uomId);
    add(this.modal.baseUomId);
    add(this.modal.uomId);
    return opts;
  }

  onModalUomChange(): void {
    // Qty stays as entered; convert only the Unit Price so it is per the chosen UOM.
    const factor = Number(this.modal.uomFactor ?? 1) || 1;
    const prev = this.modal.uomIdPrev ?? null;
    const next = this.modal.uomId ?? null;
    if (prev !== next && factor > 0 && this.modal.baseUomId != null && this.modal.sellUomId != null && Number(this.modal.baseUomId) !== Number(this.modal.sellUomId) && this.modal.unitPrice != null) {
      const toBase = Number(next) === Number(this.modal.baseUomId) && Number(prev) === Number(this.modal.sellUomId);
      const toSell = Number(next) === Number(this.modal.sellUomId) && Number(prev) === Number(this.modal.baseUomId);
      if (toBase) this.modal.unitPrice = this.round4(+this.modal.unitPrice / factor);
      else if (toSell) this.modal.unitPrice = this.round4(+this.modal.unitPrice * factor);
    }
    this.modal.uomIdPrev = next;
    this.previewLineTotals();
  }

  get modalBaseQty(): number {
    const qty = this.modal.qty == null ? 0 : +this.modal.qty;
    const factor = Number(this.modal.uomFactor ?? 1) || 1;
    const inBase = this.modal.baseUomId != null && Number(this.modal.uomId) === Number(this.modal.baseUomId);
    return this.round4(inBase ? qty : qty * factor);
  }

  private applyModalItemUom(row: SimpleItem | null): void {
    const sell = (row?.uomId ?? null) as number | null;
    const base = (row?.baseUomId ?? sell) as number | null;
    this.modal.sellUomId = sell;
    this.modal.baseUomId = base;
    this.modal.uomFactor = Number(row?.uomFactor ?? 1) || 1;
    this.modal.uomId = sell;
    this.modal.uomIdPrev = sell;
  }

  private computeLine(l: UiLine): { base: number; discount: number } {
    // keep base qty in sync whenever a line is recomputed
    this.recomputeBaseQty(l);
    // Package children carry ONLY the qty; money lives on the package header.
    if (this.isPackageChild(l)) {
      l.unitPrice = 0; l.discountPct = 0;
      l.lineNet = 0; l.lineTax = 0; l.lineTotal = 0;
      return { base: 0, discount: 0 };
    }

    if (!l.taxMode && l.taxCodeId != null) l.taxMode = this.taxCodeIdToTaxMode(l.taxCodeId);
    l.taxCodeId = this.taxModeToTaxCodeId(l.taxMode);

    const qty = l.qty === null || l.qty === undefined ? 0 : +l.qty;
    const price = l.unitPrice === null || l.unitPrice === undefined ? 0 : +l.unitPrice;
    const discP = Math.min(Math.max(+(l.discountPct ?? 0) || 0, 0), 100);

    const gross = qty * price;
    const discountAmt = gross * (discP / 100);
    const afterDisc = gross - discountAmt;
    const rate = l.taxMode === 'Standard-Rated' ? +this.header.taxPct || 0 : 0;

    l.lineNet = this.round2(afterDisc);
    l.lineTax = this.round2(rate > 0 ? (afterDisc * rate) / 100 : 0);
    l.lineTotal = this.round2((l.lineNet || 0) + (l.lineTax || 0));
    return { base: gross, discount: discountAmt };
  }

  computeTotals(): void {
    let baseSubtotal = 0;
    let hod = false;
    for (const l of this.lines) {
      if (this.isPackageChild(l)) { this.computeLine(l); continue; }
      const { base } = this.computeLine(l);
      baseSubtotal += base;
      if ((+(l.discountPct ?? 0) || 0) > 10) hod = true;
    }
    this.header.subtotal = this.round2(baseSubtotal);

    const gstPct = +this.header.taxPct || 0;
    const docTax = gstPct > 0
      ? this.lines.filter(l => !this.isPackageChild(l)).reduce((s, l) => s + (l.lineTax || 0), 0)
      : 0;
    this.header.taxAmount = this.round2(docTax);

    // Document-level discount (percent of subtotal, or fixed amount)
    const discInput = +this.header.discountValue || 0;
    let discAmt = this.header.discountType === 'amount' ? discInput : this.header.subtotal * (discInput / 100);
    if (discAmt < 0) discAmt = 0;
    if (discAmt > this.header.subtotal) discAmt = this.header.subtotal;
    this.header.discountAmount = this.round2(discAmt);
    this.header.netTotal = this.round2(this.header.subtotal - this.header.discountAmount);

    const rounding = +this.header.rounding || 0;
    this.header.grandTotal = this.round2(this.header.netTotal + this.header.taxAmount + rounding);
    this.header.needsHodApproval = hod;
    this.calcGrandTotalBase();
  }

  // ── FX ───────────────────────────────────────────────
  /**
   * The base currency id in localStorage can be missing, 0, or stale (pointing at a currency
   * that no longer exists). fetchFxRate() needs a valid id and bails out silently without one,
   * which leaves fxRate stuck at 1 — a base of RM with an SGD order showed "1 SGD = 1.0000 RM"
   * instead of 3.15. The base currency NAME is always present, so the loaded currency list is
   * the source of truth: keep the stored id only if the list contains it, else re-derive it.
   */
  private ensureBaseCurrencyId(): void {
    if (!this.currenciesSrv.length) return;
    if (this.currenciesSrv.some(c => c.id === this.baseCurrencyId)) return;

    const base = this.currenciesSrv.find(
      c => c.name.trim().toLowerCase() === this.baseCurrencyName.trim().toLowerCase()
    );
    if (!base) return;
    this.baseCurrencyId = base.id;
    localStorage.setItem('companyCurrencyId', String(base.id));
  }

  /**
   * Fetch the rate for an already-selected foreign currency whose fxRate is still the default 1
   * — either because the id wasn't resolvable when the currency was picked, or because the
   * source quotation was saved with a stale rate of 1. An fxRate the user (or an earlier
   * document) set to a real value is left alone.
   */
  private resolveBaseCurrency(): void {
    this.ensureBaseCurrencyId();

    const curId = Number(this.header.currencyId || 0);
    if (!curId || !this.baseCurrencyId || curId === this.baseCurrencyId) return;
    if (Number(this.header.fxRate || 1) === 1) this.fetchFxRate(curId);
  }

  fetchFxRate(fromCurrencyId: number): void {
    this.ensureBaseCurrencyId();
    if (!fromCurrencyId || !this.baseCurrencyId) return;
    this.fxRateLoading = true;
    // Use the document (order) date so re-opened orders keep their historical rate.
    const rateDate = this.header.orderDate || new Date().toISOString().substring(0, 10);
    this.svc.getExchangeRate(fromCurrencyId, this.baseCurrencyId, rateDate).subscribe({
      next: (res: any) => {
        this.fxRateLoading = false;
        if (res?.isSuccess && res?.data?.rate) this.header.fxRate = Number(res.data.rate);
        else if (res?.data && typeof res.data === 'number') this.header.fxRate = Number(res.data) || 1;
        else this.header.fxRate = 1;
        this.calcGrandTotalBase();
      },
      error: () => { this.fxRateLoading = false; this.header.fxRate = 1; this.calcGrandTotalBase(); }
    });
  }
  calcGrandTotalBase(): void {
    const fx = Number(this.header.fxRate || 1);
    this.grandTotalBase = +(Number(this.header.grandTotal || 0) * fx).toFixed(2);
  }
  onFxRateChange(): void { this.calcGrandTotalBase(); }
  isForeignCurrency(): boolean {
    return !!(
      this.header.currencyId &&
      this.header.currencyId !== this.baseCurrencyId &&
      this.header.currency &&
      this.header.currency !== this.baseCurrencyName
    );
  }

  // ── Modal (add line) ─────────────────────────────────
  openAdd(): void {
    if (!this.canAddManual) return;
    this.modalPreview = null;
    this.modal = {
      itemId: null, itemSearch: '', qty: null, uomId: null,
      sellUomId: null, baseUomId: null, uomFactor: 1, uomIdPrev: null, baseQty: null,
      unitPrice: null,
      discountPct: 0,
      taxMode: (+this.header.taxPct || 0) === 9 ? 'Standard-Rated' : 'Zero-Rated',
      fulfillmentMode: null, allowManualFulfillment: false, description: '', dropdownOpen: false, filteredItems: []
    };
    this.showModal = true;
  }
  closeModal(): void {
    this.showModal = false;
    this.modal.dropdownOpen = false;
    this.modalPreview = null;
  }
  onModalContainer(ev: MouseEvent): void { ev.stopPropagation(); }
  toggleModalItemDropdown(): void {
    this.modal.dropdownOpen = !this.modal.dropdownOpen;
    if (this.modal.dropdownOpen) this.filterModalItemsOnly();
  }
  onModalItemInput(): void { if (this.modal.dropdownOpen) this.filterModalItemsOnly(); }
  private filterModalItemsOnly(): void {
    const q = (this.modal.itemSearch || '').trim().toLowerCase();
    this.modal.filteredItems = !q
      ? this.itemsList.slice(0, 120)
      : this.itemsList.filter(x =>
          (x.itemName || '').toLowerCase().includes(q) ||
          (x.itemCode || '').toLowerCase().includes(q)).slice(0, 120);
  }
  selectModalItem(row: SimpleItem): void {
    this.modal.itemId = row.id;
    this.modal.itemSearch = row.itemName;
    this.applyModalItemUom(row);
    // Auto-fill the item's default price (user can still edit it).
    this.modal.unitPrice = (row.price != null ? +row.price : null) as any;
    this.modal.dropdownOpen = false;
    this.loadModalItemFulfillment(row.id);
    this.previewLineTotals();
  }

  onModalItemSelect(id: number | null): void {
    const row = id ? this.itemsList.find(x => x.id === id) : null;
    this.applyModalItemUom(row ?? null);
    // Auto-fill the item's default price (user can still edit it).
    this.modal.unitPrice = (row && row.price != null ? +row.price : null) as any;
    this.loadModalItemFulfillment(id);
    this.previewLineTotals();
  }

    // Auto-set the modal's fulfillment from the selected item's flags (same as grid lines).
  private loadModalItemFulfillment(itemId: number | null): void {
    this.modal.fulfillmentMode = null;
    this.modal.allowManualFulfillment = false;
    if (!itemId) return;
    this.svc.getItemFlagsBulk([itemId]).subscribe({
      next: (res: any) => {
        const arr: any[] = (res?.data ?? res ?? []) as any;
        const f = Array.isArray(arr) ? arr.find((x: any) => Number(x.itemId) === Number(itemId)) : null;
        if (!f) return;
        this.modal.allowManualFulfillment = !!f.allowManualFulfillment;
        this.modal.fulfillmentMode = 2;
      },
      error: () => { /* leave defaults; policy resolves after add */ }
    });
  }

  previewLineTotals(): void {
    const qty = +(this.modal.qty ?? 0);
    const price = +(this.modal.unitPrice ?? 0);
    const discPct = Math.min(100, Math.max(0, +(this.modal.discountPct ?? 0)));
    const gross = qty * price;
    const afterDisc = gross - gross * (discPct / 100);
    const gst = +this.header.taxPct || 0;
    const rate = this.modal.taxMode === 'Standard-Rated' ? gst : 0;
    const net = this.round2(afterDisc);
    const tax = this.round2(rate > 0 ? (afterDisc * rate) / 100 : 0);
    const total = this.round2(net + tax);
    this.modalPreview = (qty > 0 || price > 0 || discPct > 0) ? { net, tax, total } : null;
  }
  addLineFromModal(): void {
    if (!this.modal.itemId) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Item is required.', confirmButtonColor: '#16a34a' }); return; }
    // Fulfillment is system-decided (auto) or left Pending for procurement — sales never picks it here.
    const payload: UiLine = {
      itemId: this.modal.itemId,
      itemName: this.modal.itemSearch,
      uomId: this.modal.uomId ?? null,
      qty: +(this.modal.qty ?? 0),
      unitPrice: +(this.modal.unitPrice ?? 0),
      discountPct: +(this.modal.discountPct ?? 0),
      description: (this.modal.description || '').trim(),
      taxMode: this.modal.taxMode,
      taxCodeId: this.taxModeToTaxCodeId(this.modal.taxMode),
      isFromSet: false, isSetHeader: false, itemSetId: null, setName: '',
      fulfillmentMode: this.modal.fulfillmentMode == null ? null : Number(this.modal.fulfillmentMode),
      isSellable: false, isConsumable: false, allowManualFulfillment: this.modal.allowManualFulfillment
    };
    this.attachUomConversion(payload);
    this.computeLine(payload);
    this.lines.push(payload);
    this.computeTotals();
    this.loadFlagsForLines([payload]);
    this.fetchAvailabilityForLine(payload);
    this.closeModal();
  }

  remove(i: number): void {
    const l = this.lines[i];
    if (!l) return;
    if (l.isSetHeader && l.itemSetId) { this.removeItemSet(l.itemSetId); return; }
    this.lines.splice(i, 1);
    this.computeTotals();
  }

  // ── Availability (Direct DO stock check) ─────────────
  // Stock/availability is tracked in BASE units, so a Direct-DO line's requirement must be its
  // base qty (e.g. 10 KG), not the line-UOM qty — otherwise a 1 CTN line would be checked as 1 KG.
  private lineBaseNeed(ln: UiLine): number {
    const b = Number(ln.baseQty ?? 0) || 0;
    return b > 0 ? b : (Number(ln.qty) || 0);
  }

  private fetchAvailabilityForLine(ln: UiLine, done?: () => void): void {
    const locId = this.locationId;
    const itemId = Number(ln.itemId || 0);
    const sm = Number(ln.fulfillmentMode || 0);

    if (sm !== 2 || itemId <= 0 || locId <= 0) {
      ln.availability = undefined;
      ln.shortageQty = 0;
      done?.();
      return;
    }

    const key = `${itemId}|${sm}`;
    if (this.availabilityCache.has(key)) {
      ln.availability = this.availabilityCache.get(key)!;
      ln.shortageQty = Math.max(this.lineBaseNeed(ln) - ln.availability, 0);
      done?.();
      return;
    }

    this.svc.getAvailability(locId, itemId, sm).subscribe({
      next: (res: any) => {
        const rows: any[] = res?.data ?? res ?? [];
        const avl = Number(rows[0]?.available ?? 0) || 0;
        this.availabilityCache.set(key, avl);
        ln.availability = avl;
        ln.shortageQty = Math.max(this.lineBaseNeed(ln) - avl, 0);
        done?.();
      },
      error: () => { ln.availability = 0; ln.shortageQty = 0; done?.(); }
    });
  }

  private async ensureAvailabilityBeforeSave(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const ln of this.lines) {
      if (ln.isSetHeader || ln.fulfillmentMode !== 2) continue;
      if (ln.availability !== undefined && ln.availability !== null) continue;
      promises.push(new Promise<void>(resolve => this.fetchAvailabilityForLine(ln, resolve)));
    }
    if (promises.length) await Promise.all(promises);
  }

  private getDirectDoShortageLines(): UiLine[] {
    return this.lines.filter(ln => {
      if (ln.isSetHeader || ln.fulfillmentMode !== 2) return false;
      const req = this.lineBaseNeed(ln);
      const avl = Number(ln.availability ?? 0);
      ln.shortageQty = req > 0 ? Math.max(req - avl, 0) : 0;
      return req > 0 && ln.shortageQty > 0;
    });
  }

  // ── Save ─────────────────────────────────────────────
  private validateBeforeSave(): boolean {
    if (!this.header.customerId && !this.header.isCashSales) {
      void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please select a Customer.', confirmButtonColor: '#16a34a' }); return false;
    }
    if (!this.header.deliveryDate) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please set a Delivery Date.', confirmButtonColor: '#16a34a' }); return false; }
    // Money lives on package headers + custom lines; package children are qty-only and skipped.
    const payRows = this.lines.filter(l => !this.isPackageChild(l));
    if (!payRows.length) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please add at least one line.', confirmButtonColor: '#16a34a' }); return false; }
    for (let idx = 0; idx < payRows.length; idx++) {
      const l = payRows[idx];
      const q = l.qty == null ? 0 : +l.qty;
      const p = l.unitPrice == null ? 0 : +l.unitPrice;
      const name = l.isSetHeader ? (l.setName || `Package ${idx + 1}`) : (l.itemName || this.getItemName(l.itemId) || `Line ${idx + 1}`);
      if (q <= 0 || p <= 0) { void Swal.fire('Validation', `Please enter Qty & ${l.isSetHeader ? 'Package Price' : 'Unit Price'} for ${name}.`, 'warning'); return false; }
    }
    return true;
  }

  // Build lines to match the backend SalesOrderLines model
  private buildLineData(): any[] {
    return this.lines.filter(l => !l.isSetHeader).map(l => {
      this.computeLine(l);
      const taxMode = (l.taxMode || (l.taxCodeId != null ? this.taxCodeIdToTaxMode(l.taxCodeId) : 'Zero-Rated')) as LineTaxMode;
      const taxCodeId = l.taxCodeId ?? this.taxModeToTaxCodeId(taxMode);
      const supplyMethodId = l.fulfillmentMode == null ? 0 : Number(l.fulfillmentMode);
      return {
        ItemId: l.itemId,
        ItemName: l.itemName ?? '',
        Uom: l.uomName || this.getUomName(l.uomId) || '',
        BaseUom: this.getUomName(l.baseUomId) || '',
        BaseQty: +(l.baseQty ?? 0) || 0,
        Quantity: +(l.qty ?? 0) || 0,
        UnitPrice: +(l.unitPrice ?? 0) || 0,
        Discount: +(l.discountPct ?? 0) || 0,
        Tax: taxMode,
        TaxCodeId: taxCodeId,
        Total: +(l.lineTotal ?? 0),
        Description: (l.description || '').trim(),
        SupplyMethodId: supplyMethodId
      };
    });
  }

  // TimeSpan-friendly "HH:mm:ss" (or null) for the backend OrderTime column
  private formatOrderTime(t: string | null): string | null {
    if (!t) return null;
    return t.length === 5 ? `${t}:00` : t;
  }

  // Build header to match the backend SalesOrder model
  private buildPayload(): any {
    return {
      QuotationNo: Number(this.quotationId) || 0,
      CustomerId: this.header.customerId,
      RequestedDate: this.header.orderDate || this.header.deliveryDate,
      DeliveryDate: this.header.deliveryDate,
      Status: this.header.status,
      DeliveryTo: (this.header.deliveryTo || '').trim(),
      Remarks: (this.header.remarks || '').trim(),
      Shipping: 0,
      Discount: Number((this.header.discountAmount || 0).toFixed(2)),
      GstPct: this.header.taxPct,
      SubTotal: Number(this.header.subtotal.toFixed(2)),
      TaxAmount: Number(this.header.taxAmount.toFixed(2)),
      GrandTotal: Number(this.header.grandTotal.toFixed(2)),
      LineSourceId: this.header.lineSourceId,
      ItemSetIds: (this.selectedItemSets || []).map(x => Number(x.id)),
      // package-level money values persisted to SalesOrderItemSetMap
      ItemSetValues: this.lines.filter(l => l.isSetHeader).map(h => {
        this.computeLine(h);
        const taxMode = (h.taxMode || (h.taxCodeId != null ? this.taxCodeIdToTaxMode(h.taxCodeId) : 'Zero-Rated')) as LineTaxMode;
        return {
          ItemSetId: h.itemSetId ?? null,
          Qty: +(h.qty ?? 0) || 0,
          UnitPrice: +(h.unitPrice ?? 0) || 0,
          DiscountPct: +(h.discountPct ?? 0) || 0,
          TaxMode: taxMode,
          LineNet: +(h.lineNet ?? 0),
          LineTax: +(h.lineTax ?? 0),
          LineTotal: +(h.lineTotal ?? 0)
        };
      }),
      OrderTime: this.formatOrderTime(this.header.orderTime),
      FxRate: this.header.fxRate ?? 1,
      CurrencyId: this.header.currencyId || null,
      CurrencyName: this.header.currency || null,
      IsActive: true,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0,
      LineItems: this.buildLineData()
    };
  }

  async submit(): Promise<void> {
    for (const l of this.lines) {
      if (l.isSetHeader) continue;
      this.applyFulfillmentByPolicy(l);
    }
    if (!this.validateBeforeSave()) return;

    const shortageLines: UiLine[] = [];

    // Status rule:
    //   Approved (2) → no finished-item shortage check for food sales.
    //   Completed (3)→ set later when a Delivery Order is created
    //   Rejected (4) → manual reject
    if (!this.isEdit || this.header.status === 1 || this.header.status === 2) {
      this.header.status = 2;
    }

    // Step 3: save the SO
    this.saving = true;
    const payload = this.buildPayload();
    const obs$ = this.isEdit
      ? this.svc.updateSalesOrder({ Id: this.id, ...payload })
      : this.svc.createSalesOrder(payload);

    obs$.subscribe({
      next: (res: any) => {
        this.saving = false;
        const soId = this.isEdit ? this.id! : (res?.data ?? res?.id ?? res);

        // Step 4: if shortage → auto-create PR, else navigate back
        if (!shortageLines.length) {
          void Swal.fire({ icon: 'success', title: 'Success', text: 'Sales Order saved successfully.', confirmButtonColor: '#16a34a' }).then(() => this.back());
          return;
        }

        // PR cannot be auto-created without a location in the session.
        if (!this.locationId || this.locationId <= 0) {
          void Swal.fire({ icon: 'warning', title: 'Saved — PR NOT created',
            text: 'Your session has no Location (locationId = 0), so the Purchase Request could not be auto-created. Please log in with a location assigned, then create the PR.',
            confirmButtonColor: '#16a34a' }).then(() => this.back());
          return;
        }

        this.svc.triggerAutoPr(Number(soId), Number(this.loginUserId) || 1, this.locationId).subscribe({
          next: (prRes: any) => {
            const data = prRes?.data ?? prRes;
            const created = data?.created ?? data?.Created ?? false;
            const prNo = data?.purchaseRequestNo ?? data?.PurchaseRequestNo ?? '';
            const msg = (data?.message ?? data?.Message ?? '').toString();

            // We only reach here when shortage lines existed and a location is present.
            // The SO save itself auto-creates the PR for Direct-DO shortage lines
            // (converting them to purchase UOM), so this second trigger reporting
            // "no Direct DO lines" is NOT a failure — a PR was already raised on save.
            const prRaised = created || /no direct do/i.test(msg) || /converted/i.test(msg) || !!prNo;

            let html = 'Sales Order saved successfully.';
            if (prRaised) {
              html += `<br/><br/><b>Purchase Request auto-created for the shortage.</b><br/>Direct DO shortage was converted to purchase UOM.${prNo ? '<br/>PR No: ' + prNo : ''}`;
              void Swal.fire({ icon: 'success', title: 'PR Auto-Created', html, confirmButtonColor: '#16a34a' })
                .then(() => this.router.navigate(['/app/purchase/requests']));
            } else {
              html += `<br/><br/><b>PR NOT created.</b>${msg ? '<br/>Reason: ' + msg : ''}`;
              void Swal.fire({ icon: 'warning', title: 'Saved — no PR', html, confirmButtonColor: '#16a34a' })
                .then(() => this.back());
            }
          },
          error: () => {
            void Swal.fire({ icon: 'warning', title: 'Success', text: 'Sales Order saved. PR creation failed — please create manually.', confirmButtonColor: '#16a34a' })
              .then(() => this.back());
          }
        });
      },
      error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Save failed. Please try again.', 'error'); }
    });
  }

  approve(status: number): void {
    if (!this.id) return;
    this.saving = true;
    const obs$ = status === 2
      ? this.svc.approveSalesOrder(this.id)
      : this.svc.rejectSalesOrder(this.id);
    obs$.subscribe({
      next: () => {
        this.saving = false;
        this.header.status = status;
        void Swal.fire('Success', status === 2 ? 'Sales Order approved.' : 'Sales Order rejected.', 'success');
      },
      error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Update failed.', 'error'); }
    });
  }

  back(): void { this.router.navigate(['/app/sales/orders']); }
}
