import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { SalesService } from './sales.service';
import { DocumentPrintConfig, PrintColumn } from '../../core/services/document-print.service';

const SO_STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Not Confirmed', 2: 'Confirmed', 3: 'Confirmed', 4: 'Rejected' };
const DO_STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Submitted', 2: 'Approved', 3: 'Rejected', 4: 'Posted' };

/**
 * Builds the printable layout for a Sales Order / Delivery Order from its id alone.
 *
 * The list screens build the same layout from their own component state, which the Sales
 * Invoice email screen has no access to — that is why the emailed SO/DO used the plain
 * server-generated template instead of the one Print produces. This service fetches the
 * document and returns the same DocumentPrintConfig, so the attachment matches Print.
 */
@Injectable({ providedIn: 'root' })
export class SalesDocPrintBuilderService {
  private readonly soColumns: PrintColumn[] = [
    { header: 'Item', key: 'itemName' },
    { header: 'UOM', key: 'uomName', align: 'center' },
    { header: 'Qty', key: 'qty', align: 'right', type: 'qty' },
    { header: 'Unit Price', key: 'unitPrice', align: 'right', type: 'number' },
    { header: 'Disc %', key: 'discountPct', align: 'right', type: 'number' },
    { header: 'Net', key: 'lineNet', align: 'right', type: 'number' },
    { header: 'Total', key: 'lineTotal', align: 'right', type: 'number' },
  ];

  private readonly doColumns: PrintColumn[] = [
    { header: 'Item Code', key: 'itemCode' },
    { header: 'Item', key: 'itemName' },
    { header: 'UOM', key: 'uomName', align: 'center' },
    { header: 'Qty', key: 'qty', align: 'right', type: 'qty' },
    { header: 'Notes', key: 'notes' },
  ];

  private uomMap = new Map<number, string>();
  private itemCodeMap = new Map<number, string>();
  private itemNameMap = new Map<number, string>();
  private custAddrMap = new Map<number, string>();
  private warehouseMap = new Map<number, string>();
  private lookupsLoaded = false;

  constructor(private svc: SalesService) {}

  /** Item / UOM / customer lookups, loaded once and reused. */
  private ensureLookups(): Observable<void> {
    if (this.lookupsLoaded) return of(void 0);
    return forkJoin({
      uoms: this.svc.getUOMs().pipe(catchError(() => of([]))),
      items: this.svc.getItems().pipe(catchError(() => of([]))),
      customers: this.svc.getCustomers().pipe(catchError(() => of([]))),
    }).pipe(map(res => {
      this.svc.unwrap(res.uoms).forEach((u: any) => this.uomMap.set(Number(u.id), u.uomName ?? u.name ?? ''));
      this.svc.unwrap(res.items).forEach((i: any) => {
        this.itemNameMap.set(Number(i.id), i.itemName ?? i.name ?? '');
        if (i.itemCode) this.itemCodeMap.set(Number(i.id), i.itemCode);
      });
      this.svc.unwrap(res.customers).forEach((c: any) =>
        this.custAddrMap.set(Number(c.id ?? c.Id), String(c.address ?? c.Address ?? '').trim()));
      this.lookupsLoaded = true;
    }));
  }

  private fmtDate(v: any): string {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  }

  // ── Sales Order ───────────────────────────────────────
  buildSalesOrderConfig(soId: number): Observable<DocumentPrintConfig> {
    return this.ensureLookups().pipe(
      switchMap(() => this.svc.getSalesOrderById(soId)),
      switchMap(res => {
        const d = this.svc.unwrapOne(res);
        const rawLines = d.salesOrderLines ?? d.SalesOrderLines ?? d.lineItems ?? d.lines ?? [];
        const parsed: any[] = typeof rawLines === 'string'
          ? JSON.parse(rawLines || '[]')
          : (Array.isArray(rawLines) ? rawLines : []);

        const baseLines = parsed.map((l: any) => {
          const qty = +(l.qty ?? l.quantity ?? 0) || 0;
          const unitPrice = +(l.unitPrice ?? 0) || 0;
          const discountPct = +(l.discountPct ?? l.discount ?? 0) || 0;
          const base = qty * unitPrice;
          const lineNet = base - base * (discountPct / 100);
          return {
            itemId: Number(l.itemId ?? l.ItemId ?? 0) || 0,
            itemCode: l.itemCode ?? this.itemCodeMap.get(Number(l.itemId)) ?? '',
            itemName: l.itemName ?? l.item ?? this.itemNameMap.get(Number(l.itemId)) ?? '',
            uomName: l.uomName ?? l.uom ?? this.uomMap.get(Number(l.uomId)) ?? '',
            qty,
            unitPrice,
            discountPct,
            lineNet,
            lineTotal: +(l.total ?? l.lineTotal ?? lineNet) || 0,
          };
        });

        return this.svc.groupViewLinesByPackage(baseLines, d.itemSets ?? d.ItemSets ?? [], (s: any) => {
          const setNet = +(s.lineNet ?? s.LineNet ?? 0) || 0;
          const setTotal = +(s.lineTotal ?? s.LineTotal ?? 0) || 0;
          return {
            itemId: 0,
            itemCode: '',
            itemName: s.setName ?? s.SetName ?? 'Package',
            uomName: 'Set',
            qty: +(s.qty ?? s.Qty ?? 0) || 0,
            unitPrice: +(s.unitPrice ?? s.UnitPrice ?? 0) || 0,
            discountPct: +(s.discountPct ?? s.DiscountPct ?? 0) || 0,
            lineNet: setNet,
            lineTotal: setTotal || setNet,
          };
        }, true).pipe(map(grouped => ({ d, grouped })));
      }),
      map(({ d, grouped }: any) => {
        const lines = grouped.map((l: any) => l.isPackageChild
          ? { ...l, itemName: `— ${l.itemName}`, unitPrice: 0, discountPct: 0, lineNet: 0, lineTotal: 0 }
          : l);
        const net = lines.reduce((s: number, l: any) => s + (+l.lineNet || 0), 0);
        const total = lines.reduce((s: number, l: any) => s + (+l.lineTotal || 0), 0);
        const cur = d.currencyName ?? d.CurrencyName ?? 'SGD';
        const customerName = d.customerName ?? d.CustomerName ?? '—';
        const billAddress = this.custAddrMap.get(Number(d.customerId ?? d.CustomerId)) || '';
        const deliveryTo = String(d.deliveryTo ?? d.DeliveryTo ?? '').trim();

        return {
          docTitle: 'SALES ORDER',
          docNo: d.salesOrderNo ?? d.SalesOrderNo ?? '',
          fields: [
            { label: 'SO No', value: d.salesOrderNo ?? d.SalesOrderNo ?? '' },
            { label: 'Status', value: SO_STATUS_MAP[Number(d.status ?? d.Status ?? 0)] ?? 'Not Confirmed' },
            { label: 'Currency', value: cur },
            { label: 'Order Date', value: this.fmtDate(d.requestedDate ?? d.RequestedDate) },
            { label: 'Delivery Date', value: this.fmtDate(d.deliveryDate ?? d.DeliveryDate) },
          ],
          remarks: (d.remarks ?? d.Remarks ?? '') as string,
          columns: this.soColumns,
          lines,
          totals: [
            { label: 'Subtotal', value: net.toFixed(2) },
            { label: 'Tax', value: Math.max(total - net, 0).toFixed(2) },
            { label: `Grand Total (${cur})`, value: total.toFixed(2) },
          ],
          orderToLines: deliveryTo ? [deliveryTo] : [],
          billTo: { name: customerName, lines: billAddress ? [billAddress] : [] },
        } as DocumentPrintConfig;
      })
    );
  }

  // ── Delivery Order ────────────────────────────────────
  buildDeliveryOrderConfig(doId: number): Observable<DocumentPrintConfig> {
    return this.ensureLookups().pipe(
      switchMap(() => this.svc.getDeliveryOrderById(doId)),
      switchMap(res => {
        const d = this.svc.unwrapOne(res);
        const hdr = d.header ?? d;
        const embedded = d.lines ?? d.Lines ?? hdr.lines ?? hdr.Lines ?? null;
        const lines$ = (Array.isArray(embedded) && embedded.length)
          ? of(embedded)
          : this.svc.getDeliveryOrderLines(doId).pipe(
              map(r => this.svc.unwrap(r)), catchError(() => of([])));

        return lines$.pipe(
          switchMap(rawLines => {
            const baseLines = (Array.isArray(rawLines) ? rawLines : []).map((l: any) => {
              const itemId = l.itemId ?? l.ItemId;
              const uomRaw = l.uomId ?? l.UomId ?? l.uom ?? l.Uom;
              const uomName = l.uomName ?? l.UomName
                ?? (uomRaw != null && !isNaN(Number(uomRaw)) ? this.uomMap.get(Number(uomRaw)) : null)
                ?? (uomRaw != null && String(uomRaw).trim() ? String(uomRaw) : '');
              return {
                itemId: Number(itemId) || 0,
                itemCode: l.itemCode ?? l.ItemCode ?? this.itemCodeMap.get(Number(itemId)) ?? '',
                itemName: l.itemName ?? l.ItemName ?? this.itemNameMap.get(Number(itemId)) ?? '',
                uomName,
                qty: l.qty ?? l.Qty ?? 0,
                warehouseName: l.warehouseName ?? l.WarehouseName ?? this.warehouseMap.get(Number(l.warehouseId ?? l.WarehouseId)) ?? '',
                binName: l.binName ?? l.BinName ?? l.binCode ?? l.BinCode ?? '',
                notes: l.notes ?? l.Notes ?? '',
              };
            });

            return this.svc.getSourceSoItemSets({ soId: hdr.soId ?? hdr.SoId, doId }).pipe(
              switchMap(itemSets => this.svc.groupViewLinesByPackage(baseLines, itemSets, (s: any) => ({
                itemId: 0,
                itemCode: '',
                itemName: s.setName ?? s.SetName ?? 'Package',
                uomName: '',
                qty: +(s.qty ?? s.Qty ?? 0) || 0,
                warehouseName: '',
                binName: '',
                notes: '',
              }), true)),
              map(grouped => ({ hdr, grouped }))
            );
          })
        );
      }),
      map(({ hdr, grouped }: any) => {
        const lines = grouped.map((l: any) => l.isPackageChild ? { ...l, itemName: `— ${l.itemName}` } : l);
        const custName = hdr.customerName ?? hdr.CustomerName ?? '—';
        const custAddr = hdr.customerAddress ?? hdr.CustomerAddress ?? '';
        const billAddr = this.custAddrMap.get(Number(hdr.customerId ?? hdr.CustomerId)) || custAddr;
        const routeName = hdr.routeName ?? hdr.RouteName ?? '';
        const posted = !!(hdr.isPosted ?? hdr.IsPosted);

        return {
          docTitle: 'DELIVERY ORDER',
          docNo: hdr.doNumber ?? hdr.DoNumber ?? '',
          fields: [
            { label: 'DO No', value: hdr.doNumber ?? hdr.DoNumber ?? '' },
            { label: 'SO No', value: hdr.salesOrderNo ?? hdr.SalesOrderNo ?? hdr.soNo ?? '—' },
            { label: 'Route', value: routeName || '—' },
            { label: 'Delivery Date', value: this.fmtDate(hdr.deliveryDate ?? hdr.DeliveryDate) },
            { label: 'Status', value: DO_STATUS_MAP[Number(hdr.status ?? hdr.Status ?? 0)] ?? 'Draft' },
            { label: 'Posted', value: posted ? 'Yes' : 'No' },
          ],
          columns: this.doColumns,
          lines,
          totals: [],
          billTo: { name: custName, lines: [billAddr].filter(Boolean) },
          deliverTo: { name: custName, lines: [custAddr, routeName ? `Route: ${routeName}` : ''].filter(Boolean) },
          signature: {
            note: 'Received the above goods in good order and condition.',
            contactName: hdr.quotationContactPerson ?? '',
            contactNo: hdr.quotationContactNo ?? ''
          }
        } as DocumentPrintConfig;
      })
    );
  }
}
