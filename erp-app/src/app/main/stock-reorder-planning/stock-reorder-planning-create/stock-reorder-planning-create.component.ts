import { Component, OnInit } from '@angular/core';
import Swal from 'sweetalert2';
import { forkJoin, of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import { WarehouseService } from 'app/main/master/warehouse/warehouse.service';
import { ReorderPlanningService } from '../stock-reorder-planning.service';
import { SupplierService } from 'app/main/businessPartners/supplier/supplier.service';
import { ItemsService } from 'app/main/master/items/items.service';
import { LocationService } from 'app/main/master/location/location.service';
import { QuickAddType, QuickAddResult } from 'app/shared/components/quick-add-modal/quick-add-modal.component';

const METHOD = { MinMax: 1, ROP: 2, MRP: 3 } as const;
type MethodId = typeof METHOD[keyof typeof METHOD];

interface SupplierBreakdown {
  id?: number;
  supplierId: number;
  name: string;
  price: number;
  qty: number;
  selected?: boolean;
}

interface ReorderRow {
  id: number;
  itemId: number;
  itemName: string;
  sku?: string;
  warehouseTypeId: number;
  warehouseName?: string;

  onHand: number;
  reserved: number;
  min: number | null;
  reorderQty?: number | null;
  max?: number | null;
  leadDays: number;
  usageHorizon: number;
  safetyStock?: number | null;

  // plain-text fields
  location?: string | null;
  deliveryDate?: string | null; // YYYY-MM-DD

  suggested?: number;
  selected: boolean;

  supplierBreakdown?: SupplierBreakdown[];
  _loadedChildren?: boolean;
}

type SuggestLine = {
  supplierId: number;
  warehouseId: number;
  itemId: number;
  itemName: string;
  qty: number;
  price: number;
  location?: string | null;
  deliveryDate?: string | null;
};

type Group = {
  supplierId: number;
  warehouseId: number;
  lines: Array<{
    itemId: number;
    itemName: string;
    qty: number;
    price: number;
    location?: string | null;
    deliveryDate?: string | null;
  }>;
};

@Component({
  standalone: false,
  selector: 'app-stock-reorder-planning-create',
  templateUrl: './stock-reorder-planning-create.component.html',
  styleUrls: ['./stock-reorder-planning-create.component.scss']
})
export class StockReorderPlanningCreateComponent implements OnInit {
  warehouses: Array<{ id: number; name: string }> = [];
  warehouseTypeId: number | null = null;

  // items for selected warehouse
  warehouseItems: any[] = [];
  availableItems: Array<{ id: number; itemName: string; sku?: string; onHand?: number; warehouseId: number }> = [];
  loadingItems = false;

  // locations (names only)
  locationList: Array<{ name: string }> = [];

  methodId: MethodId | null = METHOD.MinMax;
  horizonDays = 30;
  includeLeadTime = true;
  status: number | null = 0;

  private allRows: ReorderRow[] = [];
  rows: ReorderRow[] = [];
  loading = false;
  isBusy = false;

  selectedItemId: number | null = null;
  minDate = '';

  suppliers: any[] = [];
  itemlist: any[] = [];
  methodOptions = [
    { id: METHOD.MinMax, label: 'Min/Max' },
    { id: METHOD.ROP, label: 'Reorder Point' },
    { id: METHOD.MRP, label: 'MRP (usage & lead)' }
  ];

  stockReorderId = 0;
  selectedIds = new Set<number>();
  expandedIds = new Set<number>();

  userId: number | null = null;
  userName: string | null = null;

  // Inline quick-add ("+ Add new")
  qaType: QuickAddType | null = null;
  qaVisible = false;
  qaName = '';
  private qaTarget = '';
  private qaRow: any = null;

  constructor(
    private reorderPlanningService: ReorderPlanningService,
    private warehouseService: WarehouseService,
    private route: ActivatedRoute,
    private router: Router,
    private supplierService: SupplierService,
    private itemsService: ItemsService,
    private locationService: LocationService
  ) {
    const uid = localStorage.getItem('id');
    this.userId = uid ? Number(uid) : null;
    this.userName = localStorage.getItem('username');
  }

  ngOnInit(): void {
    this.setMinDate();

    forkJoin({
      warehouse: this.warehouseService.getWarehouse(),
      supplier: this.supplierService.GetAllSupplier(),
      items: this.itemsService.getAllItem()
    }).subscribe({
      next: (res: any) => {
        this.warehouses = res?.warehouse || [];   // already mapped to array
        this.suppliers = res?.supplier || [];     // already mapped to array
        this.itemlist = res?.items || [];         // already mapped to array
      },
      error: (err) => {
        this.warehouses = [];
        this.suppliers = [];
        this.itemlist = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load reorder master data'), 'error');
      }
    });

    this.route.paramMap.subscribe(pm => {
      const id = Number(pm.get('id') || 0);
      this.stockReorderId = id;
      if (!id) { this.resetRows(); return; }

      this.reorderPlanningService.getStockReorderById(id).subscribe({
        next: (r: any) => {
        const h = r?.data || {};
        this.warehouseTypeId = h.warehouseTypeId ?? null;
        this.methodId = h.methodId ?? METHOD.MinMax;
        this.horizonDays = h.horizonDays ?? 30;
        this.includeLeadTime = !!h.includeLeadTime;
        this.status = h.status ?? 0;

        this.allRows = (h.lineItems || []).map((l: any): ReorderRow => ({
          id: n(l.id),
          itemId: n(l.itemId),
          itemName: this.getItemName(l.itemId),
          sku: l.sku ?? '',
          warehouseTypeId: n(l.warehouseTypeId ?? h.warehouseTypeId ?? 0),
          warehouseName: l.warehouseName ?? '',

          onHand: n(l.onHand),
          reserved: n(l.reserved),
          min: l.min == null ? null : n(l.min),
          max: l.max == null ? null : n(l.max),
          reorderQty: l.reorderQty == null ? null : n(l.reorderQty),
          leadDays: n(l.leadDays),
          usageHorizon: n(l.usageHorizon ?? h.horizonDays ?? 0),
          safetyStock: l.safetyStock == null ? (l.min == null ? null : n(l.min)) : n(l.safetyStock),

          location: l.location ?? null,
          deliveryDate: l.deliveryDate ?? null,

          suggested: n(l.suggested),
          selected: !!l.selected,

          supplierBreakdown: (l.supplierBreakdown || []).map((s: any) => ({
            id: s.id || 0,
            supplierId: n(s.supplierId),
            name: this.getSupplierName(s.supplierId),
            price: n(s.price),
            qty: n(s.qty),
            selected: !!s.selected
          }))
        }));

        this.selectedIds = new Set(this.allRows.filter(x => x.selected).map(x => x.itemId));
        this.rows = [...this.allRows];
      },
      error: (err) => {
        this.resetRows();
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load reorder planning'), 'error')
          .then(() => this.router.navigateByUrl('/app/inventory/list-stockreorderplanning'));
      }
      });
    });

    this.locationService.getLocation().subscribe({
      next: (res: any) => {
        this.locationList = res?.data ?? [];
      },
      error: (err) => {
        this.locationList = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load locations'), 'error');
      }
    });
  }

  private getErrorMessage(err: any, fallback: string): string {
    return err?.error?.message || err?.message || fallback;
  }

  // Lookups
  getSupplierName(id: number | string | null) {
    const x = this.suppliers?.find((i: any) => n(i.id) === n(id));
    return x?.name ?? String(id ?? '');
  }
  getItemName(id: number | string | null) {
    const x = this.itemlist?.find((i: any) => n(i.id) === n(id));
    return x?.itemName ?? String(id ?? '');
  }

  onCancel(): void {
    this.router.navigateByUrl('/app/inventory/list-stockreorderplanning');
  }

  private pick<T = any>(o: any, keys: string[], d?: T): T {
    for (const k of keys) if (o && o[k] != null) return o[k];
    return d as T;
  }

  onWarehouseChange(): void {
    this.selectedItemId = null;
    this.availableItems = [];
    this.rows = [];
    this.allRows = [];
    this.selectedIds.clear();
    this.expandedIds.clear();

    if (!this.warehouseTypeId) return;
    this.loadingItems = true;

    this.reorderPlanningService.getWarehouseItems(this.warehouseTypeId).subscribe({
      next: (res: any) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        if (list.length) {
          this.warehouseItems = list;
          this.availableItems = list.map((x: any) => ({
            id: n(this.pick(x, ['itemId', 'id'])),
            itemName: this.pick<string>(x, ['itemName', 'name'], `#${this.pick(x, ['itemId','id'])}`),
            sku: this.pick<string>(x, ['sku', 'SKU']),
            onHand: n(this.pick(x, ['onHand', 'qtyOnHand', 'quantityOnHand']), 0),
            warehouseId: n(this.pick(x, ['warehouseId', 'WarehouseId', 'warehouseTypeId']))
          }));
        } else {
          this.fallbackLoadFromItemMaster();
        }
      },
      error: () => this.fallbackLoadFromItemMaster(),
      complete: () => { this.loadingItems = false; }
    });
  }

  private fallbackLoadFromItemMaster(): void {
    const ensureItems$: any = (this.itemlist?.length)
      ? of({ data: this.itemlist })
      : this.itemsService.getAllItem();

    ensureItems$.subscribe({
      next: (r: any) => {
        const all = Array.isArray(r?.data) ? r.data : [];
        const wh = n(this.warehouseTypeId);

        const filtered = all.filter((it: any) => {
          const wId = n(this.pick(it, ['warehouseId', 'WarehouseId', 'warehouseTypeId']), NaN);
          return Number.isFinite(wId) ? wId === wh : true;
        });

        this.warehouseItems = filtered;
        this.availableItems = filtered.map((x: any) => ({
          id: n(this.pick(x, ['itemId', 'id'])),
          itemName: this.pick<string>(x, ['itemName', 'name'], `#${this.pick(x, ['itemId','id'])}`),
          sku: this.pick<string>(x, ['sku', 'SKU']),
          onHand: n(this.pick(x, ['onHand', 'qtyOnHand', 'quantityOnHand']), 0),
          warehouseId: n(this.pick(x, ['warehouseId', 'WarehouseId', 'warehouseTypeId']), wh)
        }));
      },
      error: (err) => {
        this.warehouseItems = [];
        this.availableItems = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load item master fallback'), 'error');
      }
    });
  }

  addItemToWarehouse(): void {
    if (!this.warehouseTypeId || !this.selectedItemId) return;

    const id = n(this.selectedItemId);
    const src = this.warehouseItems.find(x => n(this.pick(x, ['itemId','id'])) === id);
    if (!src) return;

    if (this.allRows.some(r => r.itemId === id)) {
      Swal.fire({ icon: 'info', title: 'Item already in the list', confirmButtonColor: '#16a34a' });
      return;
    }

    const newRow: ReorderRow = {
      id: 0,
      itemId: id,
      itemName: this.pick<string>(src, ['itemName','name'], `#${id}`),
      sku: this.pick<string>(src, ['sku','SKU'], ''),
      warehouseTypeId: n(this.pick(src, ['warehouseId','WarehouseId','warehouseTypeId'], this.warehouseTypeId)),
      warehouseName: this.warehouses.find(w => n(w.id) === n(this.warehouseTypeId))?.name || '',

      onHand: n(this.pick(src, ['onHand','qtyOnHand','quantityOnHand']), 0),
      reserved: n(this.pick(src, ['reserved','qtyReserved']), 0),
      min: this.pick(src, ['min','minQty']) != null ? n(this.pick(src, ['min','minQty'])) : null,
      max: this.pick(src, ['max','maxQty']) != null ? n(this.pick(src, ['max','maxQty'])) : null,
      reorderQty: this.pick(src, ['reorderQty']) != null ? n(this.pick(src, ['reorderQty'])) : null,
      leadDays: n(this.pick(src, ['leadDays','leadTimeDays']), 0),
      usageHorizon: n(this.pick(src, ['usageHorizon','usage30d','usage_30d']), 0),
      safetyStock: this.pick(src, ['safetyStock']) != null
        ? n(this.pick(src, ['safetyStock']))
        : (this.pick(src, ['min','minQty']) != null ? n(this.pick(src, ['min','minQty'])) : null),

      location: this.pick<string | null>(src, ['location','binName'], null),
      deliveryDate: null,

      suggested: 0,
      selected: false,

      supplierBreakdown: (this.pick<any[]>(src, ['suppliers'], []) || []).map((s: any) => ({
        supplierId: n(this.pick(s, ['supplierId','id'])),
        name: this.pick<string>(s, ['supplierName','name'], `#${this.pick(s,['supplierId','id'])}`),
        price: n(this.pick(s, ['price','unitPrice']), 0),
        qty: n(this.pick(s, ['qty','quantity']), 0),
        selected: false
      }))
    };

    this.allRows = [...this.allRows, newRow];
    this.rows = [...this.allRows];
  }

  // Inline quick-add ("+ Add new") handlers
  openQa(type: QuickAddType, target: string, text: string, row: any = null): void {
    this.qaType = type; this.qaTarget = target; this.qaRow = row;
    this.qaName = (text || '').trim(); this.qaVisible = true;
  }
  qaCreated(e: QuickAddResult): void {
    if (!e?.id) { this.qaVisible = false; return; }
    switch (this.qaTarget) {
      case 'warehouse':
        this.warehouses = [...this.warehouses, { id: e.id, name: e.label }];
        this.warehouseTypeId = e.id;
        break;
      case 'location':
        this.locationList = [...this.locationList, { name: e.label }];
        if (this.qaRow) this.qaRow.location = e.label;
        break;
    }
    this.qaVisible = false;
  }

  onLocationChange(_r: ReorderRow) {}
  onDeliveryDateChange(r: ReorderRow, dateStr: string) { r.deliveryDate = dateStr || null; }

  runSuggestion(): void {
    if (!this.methodId) {
      Swal.fire({ icon: 'warning', title: 'Select a Method', confirmButtonColor: '#16a34a' });
      return;
    }

    const selectedMethod = this.methodId ?? METHOD.MinMax;
    const horizon = Math.max(1, n(this.horizonDays, 30));

    this.allRows = this.allRows.map(r => {
      const onHand = n(r.onHand);
      const min = n(r.min);
      const maxLvl = n(r.max);
      const reorderT = n(r.reorderQty);
      const daily = n(r.usageHorizon) / horizon;
      const lead = this.includeLeadTime ? Math.max(0, n(r.leadDays)) : 0;
      const safety = n(r.safetyStock ?? min);
      const target = reorderT > 0 ? reorderT : (maxLvl > 0 ? maxLvl : onHand);

      let suggested = 0;
      if (selectedMethod === METHOD.MinMax) {
        const projected = onHand - daily * lead;
        if (projected <= min) suggested = Math.ceil(Math.max(0, maxLvl - projected));
      } else if (selectedMethod === METHOD.ROP) {
        const rop = daily * lead + safety;
        if (onHand <= rop) {
          const projectedAtArrival = onHand - daily * lead;
          suggested = Math.ceil(Math.max(0, target - projectedAtArrival));
        }
      } else if (selectedMethod === METHOD.MRP) {
        const projectedFuture = onHand - daily * (lead + horizon);
        if (projectedFuture < min) {
          suggested = Math.ceil(Math.max(0, target - projectedFuture));
        }
      }
      if (!Number.isFinite(suggested) || suggested < 0) suggested = 0;
      return { ...r, suggested };
    });

    this.rows = [...this.allRows];
  }

  reloadCalculationsOnly(): void {
    if (!this.allRows.length) return;
    this.runSuggestion();
  }

  recalcRow(row: ReorderRow): void {
    const selectedMethod = this.methodId ?? METHOD.MinMax;
    const horizon = Math.max(1, n(this.horizonDays, 30));

    const onHand = n(row.onHand);
    const min = n(row.min);
    const maxLvl = n(row.max);
    const reorderT = n(row.reorderQty);
    const usage = n(row.usageHorizon);
    const daily = usage / horizon;
    const lead = this.includeLeadTime ? Math.max(0, n(row.leadDays)) : 0;
    const safety = n(row.safetyStock ?? min);
    const target = reorderT > 0 ? reorderT : (maxLvl > 0 ? maxLvl : onHand);

    let suggested = 0;
    if (selectedMethod === METHOD.MinMax) {
      const projectedAtArrival = onHand - daily * lead;
      if (projectedAtArrival <= min) suggested = Math.ceil(Math.max(0, maxLvl - projectedAtArrival));
    } else if (selectedMethod === METHOD.ROP) {
      const rop = daily * lead + safety;
      if (onHand <= rop) {
        const projectedAtArrival = onHand - daily * lead;
        suggested = Math.ceil(Math.max(0, target - projectedAtArrival));
      }
    } else if (selectedMethod === METHOD.MRP) {
      const projectedFuture = onHand - daily * (lead + horizon);
      if (projectedFuture < min) {
        suggested = Math.ceil(Math.max(0, target - projectedFuture));
      }
    }
    row.suggested = Math.max(0, Math.ceil(suggested || 0));
  }

  // Selection
  isSelected(id: number) { return this.selectedIds.has(id); }
  isAllSelected() { return this.rows.length > 0 && this.rows.every(r => this.selectedIds.has(r.itemId)); }
  toggleRowSelection(id: number, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    checked ? this.selectedIds.add(id) : this.selectedIds.delete(id);
    const src = this.allRows.find(x => x.itemId === id);
    if (src) src.selected = checked;
  }
  toggleSelectAll(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.rows.forEach(r => {
      r.selected = checked;
      if (checked) this.selectedIds.add(r.itemId); else this.selectedIds.delete(r.itemId);
      const src = this.allRows.find(x => x.itemId === r.itemId);
      if (src) src.selected = checked;
    });
  }

  // Expand / Suppliers
  isExpanded(r: ReorderRow) { return this.expandedIds.has(r.itemId); }
  toggleExpand(r: ReorderRow): void {
    if (this.isExpanded(r)) { this.expandedIds.delete(r.itemId); return; }
    this.expandedIds.add(r.itemId);
    if (!r._loadedChildren) r._loadedChildren = true;
  }
  selectSupplier(row: { supplierBreakdown?: any[] }, clicked: any) {
    if (!row?.supplierBreakdown) return;
    row.supplierBreakdown.forEach(s => s.selected = (s === clicked));
  }

  // Create PR suggestions (includes itemName, location, per-line and header deliveryDate)
  async onSuggestPO(): Promise<void> {
    const selectedRows = this.allRows.filter(r => this.selectedIds.has(r.itemId));
    if (!selectedRows.length) {
      await Swal.fire({ icon: 'warning', title: 'Select items', confirmButtonColor: '#16a34a' });
      return;
    }
    for (const r of selectedRows) {
      const anySup = (r.supplierBreakdown || []).some(s => s.selected);
      if (!anySup) {
        await Swal.fire({ icon: 'warning', title: 'Select supplier', html: `Choose a supplier for item <b>${r.itemName}</b>.`, confirmButtonColor: '#16a34a' });
        return;
      }
    }

    // ensure we have a StockReorderId (draft) before creating PR
    if (!this.stockReorderId || this.stockReorderId <= 0) {
      try {
        const id = await this.saveDraft(1);
        this.stockReorderId = id;
      } catch {
        return; // saveDraft already showed the error
      }
    }

    const lines: SuggestLine[] = selectedRows.reduce<SuggestLine[]>((acc, r) => {
      (r.supplierBreakdown || [])
        .filter(s => s.selected)
        .forEach(s => {
          const qty = n(r.reorderQty) > 0 ? n(r.reorderQty) : n(r.suggested);
          if (qty > 0) {
            acc.push({
              supplierId: s.supplierId,
              warehouseId: r.warehouseTypeId,
              itemId: r.itemId,
              itemName: r.itemName,
              qty,
              price: n(s.price),
              location: r.location ?? null,
              deliveryDate: r.deliveryDate ?? null
            });
          }
        });
      return acc;
    }, []);

    if (!lines.length) {
      await Swal.fire({ icon: 'warning', title: 'Nothing to suggest', text: 'Quantities are zero.', confirmButtonColor: '#16a34a' });
      return;
    }

    // Header delivery date = earliest non-null line date
    const selectedDates = selectedRows
      .map(r => r.deliveryDate)
      .filter((d: string | null | undefined): d is string => !!d);
    const headerDeliveryDate = selectedDates.length ? [...selectedDates].sort()[0] : null;

    // Group by (supplierId|warehouseId)
    const map = new Map<string, Group>();
    for (const ln of lines) {
      const key = `${ln.supplierId}|${ln.warehouseId}`;
      if (!map.has(key)) map.set(key, { supplierId: ln.supplierId, warehouseId: ln.warehouseId, lines: [] });
      map.get(key)!.lines.push({
        itemId: ln.itemId,
        itemName: ln.itemName,
        qty: ln.qty,
        price: ln.price,
        location: ln.location ?? null,
        deliveryDate: ln.deliveryDate ?? null
      });
    }
    const groups = Array.from(map.values());

    const body: any = {
      groups,
      note: 'Suggest Reorder',
      userId: this.userId ?? 0,
      userName: this.userName ?? null,
      departmentId: Number(localStorage.getItem('departmentId') || localStorage.getItem('DepartmentId') || 0),
      deliveryDate: headerDeliveryDate ?? null
    };
    if (this.stockReorderId && this.stockReorderId > 0) {
      body.stockReorderId = this.stockReorderId;
    }

    this.isBusy = true;
    this.reorderPlanningService.createPoSuggestions(body).subscribe({
      next: (res: { created: { id: number; purchaseRequestNo: string }[] }) => {
        const count = res?.created?.length ?? 0;
        Swal.fire({
          icon: 'success',
          title: `Created ${count} PR${count === 1 ? '' : 's'}`,
          text: 'PR(s) created from Reorder.',
          confirmButtonColor: '#16a34a'
        }).then(() => {
          this.router.navigate(['/purchase/list-purchaseorder'], { queryParams: { recent: 'reorder' } });
        });
      },
      error: (err) => {
        const msg = err?.error?.message || err?.message || 'Failed to create PR suggestions.';
        Swal.fire({ icon: 'error', title: 'Error', text: msg, confirmButtonColor: '#16a34a' });
      },
      complete: () => this.isBusy = false
    });
  }

  goToStockReorderPlanningList(){
  this.router.navigate(['/app/inventory/list-stockreorderplanning']); 
}
  // Save draft (also store location and deliveryDate per line)
  // returns Promise<number> with the id (new or existing)
  saveDraft(status: number): Promise<number> {
    this.status = status;

    const payload = {
      id: this.stockReorderId ?? 0,
      warehouseTypeId: this.warehouseTypeId,
      methodId: this.methodId,
      horizonDays: this.horizonDays,
      includeLeadTime: this.includeLeadTime ?? false,
      status: this.status,
      lineItems: (this.allRows || []).map(r => ({
        id: r.id ?? 0,
        itemId: r.itemId,
        location: r.location ?? null,
        deliveryDate: r.deliveryDate ?? null,
        WarehouseTypeId: this.warehouseTypeId,
        status: this.status,
        onHand: n(r.onHand),
        min: n(r.min),
        max: n(r.max),
        reorderQty: n(r.reorderQty),
        leadDays: n(r.leadDays),
        usageHorizon: n(r.usageHorizon),
        suggested: n(r.suggested),
        selected: !!r.selected,
        supplierBreakdown: (r.supplierBreakdown || []).map(s => ({
          supplierId: s.supplierId,
          price: n(s.price),
          qty: n(s.qty),
          selected: !!s.selected
        }))
      }))
    };

    return new Promise<number>((resolve, reject) => {
      this.reorderPlanningService.insertStockReorder(payload).subscribe({
        next: (res: any) => {
          const id = res?.data;
          this.stockReorderId = id;
          resolve(id);
        },
        error: (err) => {
          const msg = err?.error?.message || err?.message || 'Failed to save.';
          Swal.fire({ icon: 'error', title: 'Error', text: msg, confirmButtonColor: '#16a34a' });
          reject(err);
        }
      });
    });
  }

  async runSuggestAndDraft(): Promise<void> {
    try {
      const id = await this.saveDraft(1);
      this.stockReorderId = id;
      await this.onSuggestPO();
    } catch {
      // errors already shown inside saveDraft/onSuggestPO
    }
  }

  setMinDate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    this.minDate = `${yyyy}-${mm}-${dd}`;
  }

  private resetRows(): void {
    this.allRows = [];
    this.rows = [];
    this.selectedIds.clear();
    this.expandedIds.clear();
  }
}

// number helper
function n(v: any, d = 0) {
  const num = Number(v);
  return Number.isFinite(num) ? num : d;
}



