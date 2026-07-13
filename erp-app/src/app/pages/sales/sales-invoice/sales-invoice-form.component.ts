import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SalesService } from '../sales.service';
import { PermissionService } from '../../../core/services/permission.service';
import Swal from 'sweetalert2';

interface SiLine {
  sourceLineId: number | null;
  itemId: number | null;
  itemName: string;
  description: string;
  ledgerId: number | null;
  uom: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  gstPct: number;
  tax: string;
  taxCodeId: number | null;
  lineAmount: number;
  taxAmount: number;
  // package grouping (derived from the source SO's item sets)
  isSetHeader?: boolean;
  itemSetId?: number | null;
  setName?: string;
}

@Component({
  selector: 'erp-sales-invoice-form',
  standalone: false,
  templateUrl: './sales-invoice-form.component.html',
  styleUrls: ['./sales-invoice-form.component.scss']
})
export class SalesInvoiceFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;

  // Header
  invoiceNo = '';
  sourceType = 1;
  sourceId: number | null = null;
  sourceRef = '';
  invoiceDate = new Date().toISOString().substring(0, 10);
  shippingCost = 0;
  discountValue = 0;
  discountType: 'percent' | 'amount' = 'percent';
  remarks = '';
  customerName = '';
  // Default to the logged-in company's base currency (e.g. RM), not a hardcoded 'SGD'.
  // Overwritten by the source document's currency when one is loaded.
  currencyName = (localStorage.getItem('companyCurrencyName') || '').trim() || 'SGD';
  currencyId: number | null = null;
  fxRate = 1;
  readonly baseCurrencyName = (localStorage.getItem('companyCurrencyName') || '').trim() || 'SGD';
  status = 'Draft';

  // OCR (scan invoice)
  ocrLoading = false;
  ocrResult: any = null;
  ocrError = '';
  showOcrPreview = false;

  // Lines
  lines: SiLine[] = [];

  // Collapsed package sets (by itemSetId) — child lines hide when collapsed.
  collapsedSets = new Set<number>();
  toggleSet(itemSetId: number | null | undefined): void {
    const id = Number(itemSetId ?? 0);
    if (!id) return;
    if (this.collapsedSets.has(id)) this.collapsedSets.delete(id);
    else this.collapsedSets.add(id);
  }
  isSetCollapsed(itemSetId: number | null | undefined): boolean {
    return this.collapsedSets.has(Number(itemSetId ?? 0));
  }
  isPackageChild(l: SiLine): boolean { return !!l.itemSetId && !l.isSetHeader; }

  // Dropdown data
  sourceTypeOptions = [
    { label: 'From SO', value: 1 },
    { label: 'From DO', value: 2 }
  ];
  sourceDocOptions: any[] = [];
  itemOptions: any[] = [];
  uomOptions: any[] = [];
  taxCodeOptions: any[] = [];
  ledgerOptions: any[] = [];

  private soList: any[] = [];
  private doList: any[] = [];

  readonly fnId = 'si-list';
  constructor(
    private svc: SalesService,
    private route: ActivatedRoute,
    private router: Router,
    public perm: PermissionService
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    this.loadLookups();
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    else { this.loadSourceDocs(); this.addLine(); }
  }

  // ── Lookups ───────────────────────────────────────────
  loadLookups(): void {
    this.svc.getItems().subscribe(r =>
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({
        label: i.itemName ?? i.name ?? '',
        value: i.id ?? i.itemId,
        raw: i
      })));
    this.svc.getUOMs().subscribe(r =>
      this.uomOptions = this.svc.unwrap(r).map((u: any) => ({
        label: u.uomName ?? u.name ?? u.code ?? '',
        value: u.id ?? u.uomId
      })));
    this.svc.getTaxCodes().subscribe(r =>
      this.taxCodeOptions = this.svc.unwrap(r).map((t: any) => ({
        label: t.taxCodeName ?? t.name ?? t.code ?? t.taxCode ?? '',
        value: t.id ?? t.taxCodeId
      })));
    this.svc.getChartOfAccounts().subscribe(r =>
      this.ledgerOptions = this.svc.unwrap(r).map((c: any) => ({
        label: (c.headName ?? c.accountName ?? c.name ?? '').trim(),
        value: c.id ?? c.headId
      })));
  }

  loadSourceDocs(): void {
    if (this.sourceType === 1) {
      this.svc.getAvailableSalesOrdersForInvoice().subscribe({
        next: r => {
          this.soList = this.svc.unwrap(r);
          this.sourceDocOptions = this.soList.map((s: any) => ({
            label: `${s.soNumber ?? s.salesOrderNo ?? s.orderNo ?? ('SO-' + (s.id ?? s.soId))} - ${s.customerName ?? ''}`,
            value: s.id ?? s.soId,
            raw: s
          }));
        },
        error: () => { void Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load Sales Orders.', confirmButtonColor: '#16a34a' }); }
      });
    } else {
      this.svc.getAvailableDeliveryOrdersForInvoice().subscribe({
        next: r => {
          this.doList = this.svc.unwrap(r);
          this.sourceDocOptions = this.doList.map((d: any) => ({
            label: `${d.doNumber ?? d.deliveryOrderNo ?? ('DO-' + (d.id ?? d.doId))} - ${d.customerName ?? ''}`,
            value: d.id ?? d.doId,
            raw: d
          }));
        },
        error: () => { void Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load Delivery Orders.', confirmButtonColor: '#16a34a' }); }
      });
    }
  }

  // ── Header events ─────────────────────────────────────
  onSourceTypeChange(): void {
    if (this.isEdit) return;
    this.sourceId = null;
    this.sourceDocOptions = [];
    this.lines = [this.emptyLine()];
    this.customerName = '';
    this.loadSourceDocs();
  }

  onSourceDocChange(): void {
    if (this.isEdit) return;
    this.lines = [];
    this.customerName = '';
    if (!this.sourceId) { this.addLine(); return; }

    const opt = this.sourceDocOptions.find(o => String(o.value) === String(this.sourceId));
    const raw = opt?.raw ?? {};
    this.customerName = raw.customerName ?? raw.CustomerName ?? raw.customer ?? raw.Customer ?? '';
    // The invoice is billed in the source document's currency (e.g. an SGD sales order), not
    // the company's base currency. Without this the SGD amounts were labelled "RM 212.00".
    this.applyDocCurrency(raw);

    this.svc.getSalesInvoiceSourceLines(this.sourceType, this.sourceId).subscribe({
      next: res => {
        const rows = this.svc.unwrap(res);
        const mapped = (rows ?? []).map((r: any) => this.mapSourceLine(r));
        this.lines = mapped.length ? mapped : [this.emptyLine()];
        this.recalcLines();
        if (!this.customerName && rows?.length) {
          const first = rows[0];
          this.customerName = first.customerName ?? first.CustomerName ?? first.customer ?? '';
        }
        // group lines under their package header (derived from the source SO's item sets)
        this.loadPackageGrouping();
      },
      error: () => {
        void Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load source lines. Please try again.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  /** Take currency + FX rate from the source SO/DO (or the SO DTO fetched for packages). */
  private applyDocCurrency(src: any): void {
    if (!src) return;
    const name = String(src.currencyName ?? src.CurrencyName ?? src.currency ?? src.Currency ?? '').trim();
    if (name) this.currencyName = name;
    const id = Number(src.currencyId ?? src.CurrencyId ?? 0);
    if (id > 0) this.currencyId = id;
    const fx = Number(src.fxRate ?? src.FxRate ?? 0);
    if (fx > 0) this.fxRate = fx;
  }

  /** Billed in a currency other than the company's base → also show the converted total. */
  get isForeignCurrency(): boolean {
    const cur = (this.currencyName || '').trim().toLowerCase();
    return !!cur && cur !== this.baseCurrencyName.trim().toLowerCase();
  }
  get baseGrandTotal(): number { return +(this.grandTotal * (this.fxRate || 1)).toFixed(2); }

  private mapSourceLine(r: any): SiLine {
    const line: SiLine = {
      sourceLineId: r.sourceLineId ?? null,
      itemId: r.itemId ?? null,
      itemName: r.itemName ?? '',
      description: r.description || r.itemName || '',
      ledgerId: r.budgetLineId ?? r.ledgerId ?? null,
      uom: r.uomName ?? r.uom ?? '',
      qty: Number(r.qtyOpen ?? r.qty ?? 0),
      unitPrice: Number(r.unitPrice ?? 0),
      discountPct: Number(r.discountPct ?? 0),
      gstPct: Number(r.gstPct ?? 0),
      tax: r.tax ?? '',
      taxCodeId: r.taxCodeId ?? null,
      lineAmount: 0,
      taxAmount: 0
    };
    this.recalcLine(line);
    return line;
  }

  // ── Lines / totals ────────────────────────────────────
  private emptyLine(): SiLine {
    return { sourceLineId: null, itemId: null, itemName: '', description: '', ledgerId: null,
             uom: '', qty: 1, unitPrice: 0, discountPct: 0, gstPct: 0, tax: '', taxCodeId: null,
             lineAmount: 0, taxAmount: 0 };
  }

  // ── Package grouping (derived from the source SO's SalesOrderItemSetMap) ──
  private loadPackageGrouping(done?: () => void): void {
    const finish = () => { if (done) done(); };
    if (!this.sourceId) { finish(); return; }

    // From SO → the source id IS the SO id.
    if (this.sourceType === 1) { this.fetchSoAndGroup(Number(this.sourceId), finish); return; }

    // From DO → get the SO id straight from the selected DO option (no extra round-trip).
    const opt = this.sourceDocOptions.find(o => String(o.value) === String(this.sourceId));
    const soId = Number(opt?.raw?.soId ?? opt?.raw?.SoId ?? 0);
    if (soId > 0) { this.fetchSoAndGroup(soId, finish); return; }

    // fallback: resolve the SO via the DO only when the option didn't carry it
    this.svc.getDeliveryOrderById(this.sourceId).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const h = d?.header ?? d;
        const sid = Number(h?.soId ?? h?.SoId ?? 0);
        if (sid > 0) { this.fetchSoAndGroup(sid, finish); } else { finish(); }
      },
      error: () => { finish(); }
    });
  }

  private fetchSoAndGroup(soId: number, done?: () => void): void {
    this.svc.getSalesOrderById(soId).subscribe({
      next: soRes => {
        const soDto = this.svc.unwrapOne(soRes);
        // The SO list option doesn't always carry currency/FX — the full DTO does.
        this.applyDocCurrency(soDto?.header ?? soDto);
        this.applyPackageGrouping(soDto, done);
      },
      error: () => { if (done) done(); }
    });
  }

  private applyPackageGrouping(soDto: any, done?: () => void): void {
    const finish = () => { if (done) done(); };
    const apiItemSets = soDto?.itemSets ?? soDto?.ItemSets ?? [];
    const sets = (apiItemSets || [])
      .map((x: any) => ({
        id: Number(x.itemSetId ?? x.ItemSetId ?? x.id ?? x.Id ?? 0),
        setName: String(x.setName ?? x.SetName ?? x.itemSetName ?? x.ItemSetName ?? '').trim(),
        qty: Number(x.qty ?? x.Qty ?? 0) || 0,
        unitPrice: Number(x.unitPrice ?? x.UnitPrice ?? 0) || 0,
        discountPct: Number(x.discountPct ?? x.DiscountPct ?? 0) || 0,
        taxMode: String(x.taxMode ?? x.TaxMode ?? 'Standard-Rated')
      }))
      .filter((s: any) => s.id > 0);
    if (!sets.length) { finish(); return; }

    forkJoin(sets.map((s: any) => this.svc.getItemSetById(s.id))).subscribe({
      next: (responses: any[]) => {
        const itemIdToSet = new Map<number, { itemSetId: number; setName: string }>();
        responses.forEach((res: any, idx: number) => {
          const setId = sets[idx].id;
          const sdto = this.svc.unwrapOne(res);
          const setName = sets[idx].setName || String(sdto?.setName ?? `Set #${setId}`);
          const rows: any[] = sdto?.items ?? sdto?.itemSetItems ?? sdto?.lines ?? [];
          for (const r of rows) {
            const itemId = Number(r.itemId ?? r.ItemId ?? 0);
            if (itemId && !itemIdToSet.has(itemId)) itemIdToSet.set(itemId, { itemSetId: setId, setName });
          }
        });

        for (const l of this.lines) {
          if (l.isSetHeader) continue;
          const m = itemIdToSet.get(Number(l.itemId));
          if (m) { l.itemSetId = m.itemSetId; l.setName = m.setName; }
        }

        const items = this.lines.filter(l => !l.isSetHeader);
        const rebuilt: SiLine[] = [];
        this.collapsedSets.clear();
        for (const s of sets) {
          const group = items.filter(l => Number(l.itemSetId) === s.id);
          if (!group.length) continue;
          const standard = /standard/i.test(s.taxMode);
          const gst = standard ? (group[0]?.gstPct || 9) : 0;
          const header: SiLine = {
            sourceLineId: null, itemId: null, itemName: s.setName || `Set #${s.id}`,
            description: '', ledgerId: null, uom: '',
            qty: s.qty, unitPrice: s.unitPrice, discountPct: s.discountPct,
            gstPct: gst, tax: s.taxMode, taxCodeId: null, lineAmount: 0, taxAmount: 0,
            isSetHeader: true, itemSetId: s.id, setName: s.setName
          };
          this.recalcLine(header);
          rebuilt.push(header);
          for (const g of group) rebuilt.push(g);
          this.collapsedSets.add(s.id); // start collapsed
        }
        for (const l of items.filter(l => !l.itemSetId)) rebuilt.push(l);
        this.lines = rebuilt;
        this.recalcLines();
        finish();
      },
      error: () => { finish(); }
    });
  }

  addLine(): void { this.lines.push(this.emptyLine()); }

  recalcLine(line: SiLine): void {
    const qty = Number(line.qty ?? 0);
    const price = Number(line.unitPrice ?? 0);
    const disc = Number(line.discountPct ?? 0);
    const gst = Number(line.gstPct ?? 0);
    const base = qty * price * (1 - disc / 100);
    line.lineAmount = +base.toFixed(2);
    line.taxAmount = +(base * (gst / 100)).toFixed(2);
  }

  recalcLines(): void { this.lines.forEach(l => this.recalcLine(l)); }

  onItemSelect(line: SiLine): void {
    const opt = this.itemOptions.find(o => String(o.value) === String(line.itemId));
    if (opt) {
      line.itemName = opt.label;
      line.uom = opt.raw?.uomName ?? opt.raw?.uom ?? line.uom;
      if (!line.description) line.description = opt.label;
    }
    this.recalcLine(line);
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  // Sub Total = gross of line discounts (qty × price)
  get subTotal(): number { return +this.lines.reduce((s, l) => s + Number(l.qty ?? 0) * Number(l.unitPrice ?? 0), 0).toFixed(2); }
  // Discount = total of per-line discounts (read-only)
  get discountAmount(): number {
    return +this.lines.reduce((s, l) => s + Number(l.qty ?? 0) * Number(l.unitPrice ?? 0) * (Number(l.discountPct ?? 0) / 100), 0).toFixed(2);
  }
  get netAfterDiscount(): number { return +(this.subTotal - this.discountAmount).toFixed(2); }
  get taxAmount(): number { return +this.lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0).toFixed(2); }
  get grandTotal(): number { return +(this.netAfterDiscount + this.taxAmount + Number(this.shippingCost ?? 0)).toFixed(2); }

  // ── OCR upload (scan an invoice → extract header + lines) ─────────────
  onOcrUpload(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.(pdf|png|jpe?g|tiff?|bmp|webp)$/i.test(file.name)) {
      void Swal.fire('Unsupported file', 'Upload a PDF or image (PDF, PNG, JPG, TIFF).', 'warning');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      void Swal.fire('File too large', 'Maximum file size is 20 MB.', 'warning');
      return;
    }
    this.ocrError = '';
    this.ocrResult = null;
    this.ocrLoading = true;
    this.showOcrPreview = true;
    this.svc.extractInvoiceOcr(file).subscribe({
      next: (res: any) => {
        this.ocrLoading = false;
        const pages: any[] = Array.isArray(res) ? res : (res?.data ?? []);
        const parsedList = (Array.isArray(pages) ? pages : []).map(p => p?.parsed ?? p).filter(Boolean);
        const head = parsedList.find(p => p?.invoiceNo || p?.total || (p?.lines?.length)) ?? parsedList[0] ?? {};
        const allLines: any[] = parsedList.flatMap(p => Array.isArray(p?.lines) ? p.lines : []);
        this.ocrResult = {
          invoiceNo: head?.invoiceNo ?? '',
          invoiceDate: head?.invoiceDate ? String(head.invoiceDate).substring(0, 10) : '',
          customerName: head?.supplierName ?? head?.customerName ?? '',
          subTotal: head?.subTotal ?? null,
          taxAmount: head?.taxAmount ?? null,
          total: head?.total ?? null,
          lines: allLines
        };
        if (!allLines.length) {
          this.ocrError = 'No line items could be read. You can still apply the header, or scan a clearer copy.';
        }
      },
      error: (err: any) => {
        this.ocrLoading = false;
        this.ocrError = err?.error?.message || 'OCR failed. Please try a clearer scan.';
      }
    });
  }

  /** Apply the scanned data into the invoice form (header + lines). */
  applyOcrToInvoice(): void {
    const r = this.ocrResult;
    if (!r) return;
    if (r.invoiceNo && !this.invoiceNo) this.invoiceNo = String(r.invoiceNo);
    if (r.invoiceDate) this.invoiceDate = String(r.invoiceDate).substring(0, 10);
    const mapped: SiLine[] = (r.lines ?? []).map((l: any) => this.makeOcrLine(l));
    if (mapped.length) {
      const hasRealLines = this.lines.some(l => l.itemId || l.itemName || l.unitPrice);
      this.lines = hasRealLines ? [...this.lines, ...mapped] : mapped;
    }
    this.showOcrPreview = false;
    void Swal.fire('Applied',
      `${mapped.length} line(s) added from the scan. Map each item to your catalogue, then Save.`, 'success');
  }

  private makeOcrLine(l: any): SiLine {
    const line = this.emptyLine();
    line.itemId = null;                         // user maps the scanned name to a real item
    line.itemName = String(l?.item ?? l?.itemName ?? '');
    line.description = String(l?.item ?? l?.itemName ?? '');
    line.qty = Number(l?.qty ?? 0) || 0;
    line.unitPrice = Number(l?.unitPrice ?? 0) || 0;
    line.discountPct = Number(l?.discountPct ?? 0) || 0;
    this.recalcLine(line);
    return line;
  }

  closeOcrPreview(): void { this.showOcrPreview = false; this.ocrResult = null; this.ocrError = ''; }

  // ── Edit ──────────────────────────────────────────────
  loadForEdit(): void {
    this.loading = true;
    this.svc.getSalesInvoiceById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const hdr = d.header ?? d;
        const rows = d.lines ?? hdr.lines ?? [];
        this.invoiceNo = hdr.invoiceNo ?? hdr.siNo ?? '';
        this.invoiceDate = hdr.invoiceDate ? String(hdr.invoiceDate).substring(0, 10) : this.invoiceDate;
        this.sourceType = Number(hdr.sourceType ?? 1);
        this.sourceId = this.sourceType === 1
          ? (hdr.soId ?? hdr.salesOrderId ?? null)
          : (hdr.doId ?? hdr.deliveryOrderId ?? null);
        this.shippingCost = Number(hdr.shippingCost ?? 0);
        this.remarks = hdr.remarks ?? '';
        this.customerName = hdr.customerName ?? hdr.CustomerName ?? hdr.customer ?? hdr.Customer ?? '';
        this.sourceRef = hdr.sourceRef ?? hdr.SourceRef ?? '';
        this.applyDocCurrency(hdr);
        this.status = hdr.glPosted ? 'Posted' : (hdr.status ?? 'Draft');
        this.lines = (rows ?? []).map((r: any) => ({
          sourceLineId: r.sourceLineId ?? null,
          itemId: r.itemId ?? null,
          itemName: r.itemName ?? '',
          description: r.description || r.itemName || '',
          ledgerId: r.budgetLineId ?? r.ledgerId ?? null,
          uom: r.uom ?? r.uomName ?? '',
          qty: Number(r.qty ?? 0),
          unitPrice: Number(r.unitPrice ?? 0),
          discountPct: Number(r.discountPct ?? 0),
          gstPct: Number(r.gstPct ?? 0),
          tax: r.tax ?? '',
          taxCodeId: r.taxCodeId ?? null,
          lineAmount: Number(r.lineAmount ?? 0),
          taxAmount: Number(r.taxAmount ?? 0)
        }));
        this.recalcLines();
        // Keep the loader visible while the package grouping resolves so the user sees a spinner
        // instead of the flat, zero-value child line flickering before it regroups.
        this.loadPackageGrouping(() => { this.loading = false; });
      },
      error: () => {
        this.loading = false;
        void Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load invoice. Please try again.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  // ── Save ──────────────────────────────────────────────
  submit(): void {
    if (!this.invoiceDate) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Invoice Date is required.', confirmButtonColor: '#16a34a' }); return; }

    this.saving = true;

    if (this.isEdit) {
      this.svc.updateSalesInvoiceHeader(this.id!, { invoiceDate: this.invoiceDate }).subscribe({
        next: () => { this.saving = false; void Swal.fire({ icon: 'success', title: 'Success', text: 'Invoice updated.', confirmButtonColor: '#16a34a' }).then(() => this.back()); },
        error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Update failed.', 'error'); }
      });
      return;
    }

    if (!this.sourceId || !this.lines.length) {
      this.saving = false;
      void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Select a source document and load at least one line.', confirmButtonColor: '#16a34a' });
      return;
    }

    const payload: any = {
      sourceType: this.sourceType,
      soId: this.sourceType === 1 ? this.sourceId : null,
      doId: this.sourceType === 2 ? this.sourceId : null,
      invoiceDate: this.invoiceDate,
      subtotal: this.netAfterDiscount,
      discount: this.discountAmount,
      shippingCost: Number(this.shippingCost ?? 0),
      total: this.grandTotal,
      remarks: (this.remarks || '').trim() || '-',
      taxAmount: this.taxAmount,
      // package header rows are display-only; the package values are persisted
      // to SalesInvoiceItemSetMap by the backend (derived from the SO's package map)
      lines: this.lines.filter(l => !l.isSetHeader).map(l => ({
        sourceLineId: l.sourceLineId ?? null,
        itemId: l.itemId,
        itemName: l.itemName ?? null,
        uom: l.uom ?? null,
        qty: Number(l.qty ?? 0),
        unitPrice: Number(l.unitPrice ?? 0),
        discountPct: Number(l.discountPct ?? 0),
        gstPct: Number(l.gstPct ?? 0),
        tax: l.tax ?? '',
        taxCodeId: l.taxCodeId ?? null,
        lineAmount: Number(l.lineAmount ?? 0),
        taxAmount: Number(l.taxAmount ?? 0),
        description: l.description || null,
        budgetLineId: l.ledgerId ?? null
      }))
    };

    this.svc.createSalesInvoice(payload).subscribe({
      next: () => {
        this.saving = false;
        void Swal.fire({ icon: 'success', title: 'Success', text: 'Sales Invoice created successfully.', confirmButtonColor: '#16a34a' }).then(() => this.back());
      },
      error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Save failed.', 'error'); }
    });
  }

  back(): void { this.router.navigate(['/app/sales/invoices']); }

  get title(): string { return this.isEdit ? 'Sales Invoice (SI)' : 'Sales Invoice (SI)'; }
  get today(): string { return new Date().toISOString().substring(0, 10); }

  getLabel(opts: any[], val: any): string {
    return opts.find(o => String(o.value) === String(val))?.label ?? '—';
  }
}
