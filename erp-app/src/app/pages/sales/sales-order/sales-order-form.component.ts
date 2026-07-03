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
  0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Rejected'
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
  private lastAutoRemarks: string | null = null;

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
    this.baseCurrencyName = 'SGD';

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
    const gst = +this.header.taxPct || 0;
    if (gst === 9) return ['Standard-Rated', 'Zero-Rated', 'Exempt'];
    return ['Zero-Rated'];
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
        uomId: Number(item.uomId ?? item.UomId ?? item.baseUomId ?? 0) || null
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
          .map(this.mapQuotationRow)
          .filter((q: QuotationRow) => q.id > 0 && !usedQuotationIds.has(q.id));
      },
      error: () => {
        // Fallback: show all quotations if the sales-order list can't be loaded
        this.svc.getQuotations().subscribe((res: any) => {
          this.quotations = this.svc.unwrap(res).map(this.mapQuotationRow).filter((q: QuotationRow) => q.id > 0);
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
    if (custId > 0) {
      this.header.customerId = custId;
      this.onCustomerChange(custId);
      const custName = dto.customerName ?? dto.CustomerName ?? '';
      if (custName) this.customerSearch = String(custName);
    }
    const curId = Number(dto.currencyId ?? dto.CurrencyId ?? 0);
    if (curId > 0) {
      this.header.currencyId = curId;
      const curName = dto.currencyName ?? dto.CurrencyName ?? '';
      if (curName) { this.currencySearch = String(curName); this.header.currency = String(curName); }
    }
    if (dto.fxRate ?? dto.FxRate) this.header.fxRate = Number(dto.fxRate ?? dto.FxRate);
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
          // Fresh SO (new / from quotation): 'Both' items start Pending so the
          // procurement team resolves them on the Pending Fulfillment screen.
          if (!this.isEdit && l.allowManualFulfillment) l.fulfillmentMode = null;
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
    if (l.isSellable && !l.isConsumable) return 1; // Sales Item → PP
    if (!l.isSellable && l.isConsumable) return 2; // Purchase Item → Direct DO
    return 2; // both / neither → default Direct DO (staff can switch if manual)
  }


  // Non-manual items are system-decided and locked to the auto value.
  // 'Both' items stay Pending (null) — sales does not decide; the procurement
  // team resolves PP / Direct DO later. Any value already set is preserved.
  private applyFulfillmentByPolicy(l: UiLine): void {
    if (l.isSetHeader) return;
    if (!l.allowManualFulfillment) { l.fulfillmentMode = this.autoFulfillmentFromFlags(l); return; }
    // 'Both' → leave as-is (Pending when new)
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
        this.loading = false;
        this.computeTotals();
        this.loadFlagsForLines(this.lines.filter(x => !x.isSetHeader));
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
    return {
      itemId: 0, uomId: null, qty: null, unitPrice: null, discountPct: 0,
      taxMode: 'Zero-Rated', isSetHeader: true, isFromSet: true,
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
    for (const k of this.setChildren(header.itemSetId)) { k.qty = q; this.computeLine(k); }
    this.computeTotals();
  }

  onSetPriceChange(header: UiLine): void {
    header.unitPrice = header.unitPrice == null || (header.unitPrice as any) === ''
      ? null : Math.max(0, +header.unitPrice);
    this.distributeSetPrice(header);
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
      if (!kids.length) continue;
      header.qty = kids[0].qty ?? null;
      header.unitPrice = this.round2(kids.reduce((s, k) => s + (+(k.unitPrice ?? 0) || 0), 0));
      const fms = Array.from(new Set(kids.map(k => k.fulfillmentMode ?? null)));
      header.fulfillmentMode = fms.length === 1 ? fms[0] : null;
      this.refreshSetHeaderTotal(header);
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

  get canAddManual(): boolean {
    return this.header.lineSourceId === 1 || this.header.lineSourceId === 3;
  }
  get showPackages(): boolean {
    return this.header.lineSourceId === 2 || this.header.lineSourceId === 3;
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
        this.lines.push(this.makeSetHeader(itemSetId, dto?.setName ?? setName));

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

  private computeLine(l: UiLine): { base: number; discount: number } {
    if (l.isSetHeader) { l.lineNet = l.lineTax = l.lineTotal = 0; return { base: 0, discount: 0 }; }

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
      if (l.isSetHeader) continue;
      const { base } = this.computeLine(l);
      baseSubtotal += base;
      if ((+(l.discountPct ?? 0) || 0) > 10) hod = true;
    }
    // package header rows show the sum of their children (display only)
    for (const h of this.lines) if (h.isSetHeader) this.refreshSetHeaderTotal(h);
    this.header.subtotal = this.round2(baseSubtotal);

    const gstPct = +this.header.taxPct || 0;
    const docTax = gstPct > 0
      ? this.lines.filter(l => !l.isSetHeader).reduce((s, l) => s + (l.lineTax || 0), 0)
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
  fetchFxRate(fromCurrencyId: number): void {
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
      itemId: null, itemSearch: '', qty: null, uomId: null, unitPrice: null,
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
    this.modal.uomId = (row.uomId ?? null) as any;
    this.modal.dropdownOpen = false;
    this.loadModalItemFulfillment(row.id);
    this.previewLineTotals();
  }

  onModalItemSelect(id: number | null): void {
    const row = id ? this.itemsList.find(x => x.id === id) : null;
    this.modal.uomId = row ? ((row.uomId ?? null) as any) : null;
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
        const sellable = !!f.isSellable;
        const consumable = !!f.isConsumable;
        this.modal.allowManualFulfillment = !!f.allowManualFulfillment;
        // 'Both' items stay Pending (procurement decides); auto items show their value.
        this.modal.fulfillmentMode = f.allowManualFulfillment
          ? null
          // Sales Item (sellable-only) → PP (1); Purchase Item (consumable-only) → Direct DO (2)
          : ((sellable && !consumable) ? 1 : (!sellable && consumable) ? 2 : 2);
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
      ln.shortageQty = Math.max((Number(ln.qty) || 0) - ln.availability, 0);
      done?.();
      return;
    }

    this.svc.getAvailability(locId, itemId, sm).subscribe({
      next: (res: any) => {
        const rows: any[] = res?.data ?? res ?? [];
        const avl = Number(rows[0]?.available ?? 0) || 0;
        this.availabilityCache.set(key, avl);
        ln.availability = avl;
        ln.shortageQty = Math.max((Number(ln.qty) || 0) - avl, 0);
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
      const req = Number(ln.qty || 0);
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
    const itemRows = this.lines.filter(l => !l.isSetHeader);
    if (!itemRows.length) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please add at least one line.', confirmButtonColor: '#16a34a' }); return false; }
    for (let idx = 0; idx < itemRows.length; idx++) {
      const l = itemRows[idx];
      const q = l.qty == null ? 0 : +l.qty;
      const p = l.unitPrice == null ? 0 : +l.unitPrice;
      const name = l.itemName || this.getItemName(l.itemId) || `Line ${idx + 1}`;
      if (q <= 0 || p <= 0) { void Swal.fire('Validation', `Please enter Qty & Unit Price for ${name}.`, 'warning'); return false; }
      // 'Both' items may be saved Pending (procurement decides later); auto items
      // always carry a value, so no fulfillment block is needed here.
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

    // Step 1: fetch availability for any Direct DO lines missing it
    await this.ensureAvailabilityBeforeSave();

    // Step 2: check shortage — only Direct DO lines with insufficient stock
    const shortageLines = this.getDirectDoShortageLines();

    if (shortageLines.length) {
      const txt = shortageLines
        .map(l => `${l.itemName || this.getItemName(l.itemId)} | Req: ${l.qty} | Avl: ${l.availability ?? 0}`)
        .join('\n');

      const confirm = await Swal.fire({
        icon: 'warning',
        title: 'Stock Not Available',
        text: `Some Direct DO items do not have enough stock.\n\n${txt}\n\nPR will be auto-created. Continue?`,
        showCancelButton: true,
        confirmButtonText: 'Yes, Continue',
        cancelButtonText: 'No',
        confirmButtonColor: '#16a34a'
      });

      if (!confirm.isConfirmed) return;
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
            const msg = data?.message ?? data?.Message ?? '';
            let html = 'Sales Order saved successfully.';
            if (created) html += `<br/><br/><b>PR Auto Created</b>${prNo ? '<br/>PR No: ' + prNo : ''}`;
            else html += `<br/><br/><b>PR NOT created.</b>${msg ? '<br/>Reason: ' + msg : ''}`;
            void Swal.fire({ icon: created ? 'success' : 'warning', title: created ? 'Success' : 'Saved — no PR', html, confirmButtonColor: '#16a34a' })
              .then(() => { if (created) this.router.navigate(['/app/purchase/requests']); else this.back(); });
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
