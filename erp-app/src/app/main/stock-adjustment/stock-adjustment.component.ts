import { Component, EventEmitter, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { ItemMasterService } from '../item-master/item-master.service';
import { NgSelectComponent } from '@ng-select/ng-select';
import { StockIssueService } from 'app/main/master/stock-issue/stock-issue.service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { StackOverviewService } from '../stack-overview/stack-overview.service';

type AdjType = 'Increase' | 'Decrease';
type ReasonCode = 'Damage' | 'Shrinkage' | 'Correction';

interface AdjustmentHeader {
  type: AdjType;
  reason: ReasonCode | number | null;       // header reason (if you use it later)
  threshold: number | null;
}

interface AdjustmentLine {
  itemId: number | null;
  item: string;
  sku?: string;

  available?: number | null;
  warehouseId?: number | null;
  warehouseName?: string | null;
  binId?: number | null;
  binName?: string | null;
  supplierId?: number | null;
  supplierName?: string | null;
  price?: number | null;

  qty: number | null;            // current on-hand shown in the row (e.g., 1600)

  // used only in modal
  reason?: ReasonCode | number | null; // bind to lookup id
  remarks?: string;
  type?: AdjType | null;
  faultyQty?: number | null;
}

type ItemOption = {
  id: number;
  sku: string;
  name: string;
  onHand?: number | null;
  reserved?: number | null;
  availableQty?: number | null;
  display: string;
};

@Component({
  standalone: false,
  selector: 'app-stock-adjustment',
  templateUrl: './stock-adjustment.component.html',
  styleUrls: ['./stock-adjustment.component.scss']
})
export class StockAdjustmentComponent implements OnInit {
  @ViewChild('itemSelect', { static: false }) itemSelect?: NgSelectComponent;

  adjTypes = [
    { label: 'Increase', value: 'Increase' as AdjType },
    { label: 'Decrease', value: 'Decrease' as AdjType }
  ];

  itemsLoading = false;
  itemOptions: ItemOption[] = [];
  itemSearch$ = new EventEmitter<string>();
  selectedItemId: number | null = null;

  adjHdr: AdjustmentHeader = {
    type: 'Decrease',
    reason: null,
    threshold: 0
  };

  adjLines: AdjustmentLine[] = [];
  gridLoading = false;
  savingAdjustment = false;
  stockIssueOptions: { id: number; name: string }[] = [];

  // Modal state
  selectedRow: AdjustmentLine | null = null;
  adjustError: string | null = null;
  newQtyPreview: number | null = null;
  faultyTouched: boolean;
  previewVisible: boolean;

  constructor(
    private itemMasterService: ItemMasterService,
    private stockIssueService: StockIssueService,
    private stackOverviewService: StackOverviewService,
    private modalService: NgbModal
  ) {}

  ngOnInit(): void {
    this.loadItems();
    this.loadStockissue();
  }

  // ---------- Helpers ----------
  private toNum(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private getErrorMessage(err: any, fallback: string): string {
    return err?.error?.message || err?.message || fallback;
  }

  // ---------- Item dropdown ----------
  private loadItems(): void {
    this.itemsLoading = true;
    this.itemMasterService.getAllItemMaster().subscribe({
      next: (res: any) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);
        this.itemOptions = (data || []).map((r: any) => {
          // Stock (ItemWarehouseStock/ItemPrice) and GetItemDetailsByItemId (WHERE im.Id=@Id)
          // are keyed by ItemMaster.Id, NOT Item.Id. The list returns both; use ItemMaster.Id
          // so the adjustment loads/writes the correct item's stock.
          const id = Number(r.itemMasterId ?? r.itemMasterID ?? r.id ?? r.itemId ?? 0);
          const sku = String(r.sku ?? r.itemCode ?? '');
          const name = String(r.itemName ?? r.name ?? '');
          const onHand = Number(r.onHand ?? 0);
          const reserved = Number(r.reserved ?? 0);
          return {
            id,
            sku,
            name,
            onHand,
            reserved,
            availableQty: onHand - reserved,
            display: `${sku} — ${name}`
          } as ItemOption;
        });
      },
      error: (err) => {
        this.itemOptions = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load items'), 'error');
      },
      complete: () => (this.itemsLoading = false)
    });
  }

  onItemPicked(val: any): void {
    const itemId = (val && typeof val === 'object') ? Number(val.id) : Number(val);
    if (!itemId) return;
    this.selectedItemId = itemId;
    this.loadGridData(itemId);
    this.itemSelect?.filter('');
  }

  // ---------- Grid data ----------
  loadGridData(itemId: number): void {
    this.gridLoading = true;

    this.itemMasterService.GetItemDetailsByItemId(itemId).subscribe({
      next: (res: any) => {
        const raw = Array.isArray(res) ? res
                 : Array.isArray(res?.data) ? res.data
                 : (res?.data ? [res.data] : []);
        const picked = this.itemOptions.find(x => x.id === itemId);

        this.adjLines = (raw || []).map((r: any) => ({
          itemId: Number(r.itemId ?? itemId),
          item: String(r.itemName ?? r.name ?? picked?.name ?? ''),
          sku: String(r.sku ?? picked?.sku ?? ''),
          available: Number(r.available ?? r.availableQty ?? 0),
          warehouseId: r.warehouseId != null ? Number(r.warehouseId) : null,
          warehouseName: String(r.warehouseName ?? r.warehoueName ?? ''),
          binId: r.binId != null ? Number(r.binId) : null,
          binName: String(r.binName ?? ''),
          supplierId: r.supplierId != null ? Number(r.supplierId) : null,
          supplierName: String(r.supplierName ?? ''),
          price: r.price != null ? Number(r.price) : null,
          // Treat qty as current on-hand for that row (what your screenshot shows)
          qty: r.qty != null ? Number(r.qty) : Number(r.available ?? r.availableQty ?? 0),

          reason: null,
          remarks: '',
          type: null,
          faultyQty: null
        }));

        if (this.adjLines.length === 0 && picked) {
          this.adjLines = [{
            itemId,
            item: picked.name,
            sku: picked.sku,
            available: picked.availableQty ?? 0,
            warehouseId: null,
            warehouseName: null,
            binId: null,
            binName: null,
            supplierId: null,
            supplierName: null,
            price: null,
            qty: picked.availableQty ?? 0,
            reason: null,
            remarks: '',
            type: null,
            faultyQty: null
          }];
        }
      },
      error: (err) => {
        this.adjLines = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load item stock details'), 'error');
      },
      complete: () => (this.gridLoading = false)
    });
  }

  trackByIdx = (i: number) => i;

  onQtyChange(i: number): void {
    const l = this.adjLines[i];
    if (!l) return;
    if (l.qty !== null && !Number.isFinite(Number(l.qty))) l.qty = 0;
  }

  // ---------- Modal open/validate/submit ----------
openAdjustModal(modalTpl: TemplateRef<any>, row: AdjustmentLine) {
  this.selectedRow = { ...row, type: row.type ?? 'Decrease' };
  this.adjustError = null;
  this.newQtyPreview = null;
  this.faultyTouched = false;     // reset
  this.previewVisible = false;    // reset
  this.modalService.open(modalTpl, { centered: true, size: 'md', backdrop: 'static' });
}

  cancelModal() {
    this.modalService.dismissAll();
  }

 validateAdjustment(): void {
  const row = this.selectedRow;
  if (!row) { this.adjustError = 'No row selected.'; return; }

  const qty = this.toNum(row.qty);
  const faulty = this.toNum(row.faultyQty);
  const type = (row.type ?? '').toString();

  this.adjustError = null;
  this.newQtyPreview = null;

  if (!type) { this.adjustError = 'Select a type (Increase or Decrease).'; return; }
  if (faulty <= 0) { this.adjustError = 'Enter a positive faulty quantity.'; return; }

  if (type === 'Decrease') {
    if (faulty > qty) { this.adjustError = 'Cannot decrease more than current quantity.'; return; }
    this.newQtyPreview = qty - faulty;
  } else if (type === 'Increase') {
    this.newQtyPreview = qty + faulty;
  } else {
    this.adjustError = 'Invalid type.'; return;
  }
}
onFaultyQtyChange(v: any) {
  this.faultyTouched = true;
  if (this.selectedRow) this.selectedRow.faultyQty = this.toNum(v);
  this.validateAdjustment();
  this.previewVisible = this.faultyTouched && !this.adjustError && this.newQtyPreview !== null;
}

// NEW: when type changes, only show if user already touched faulty qty
onTypeChange() {
  this.validateAdjustment();
  this.previewVisible = this.faultyTouched && !this.adjustError && this.newQtyPreview !== null;
}

  submitAdjustment() {
    this.validateAdjustment();
    if (this.adjustError || !this.selectedRow) return;
    if (!this.selectedRow.itemId || !this.selectedRow.warehouseId) {
      this.adjustError = 'Item and warehouse are required.';
      return;
    }

    const currentQty = this.toNum(this.selectedRow.qty);
    const faultQty = this.toNum(this.selectedRow.faultyQty);
    const finalOnHand = this.toNum(this.newQtyPreview);
    const signedFaultQty = this.selectedRow.type === 'Increase' ? -faultQty : faultQty;
    const userId = Number(localStorage.getItem('id') || 0);

    const payload = {
      itemId: Number(this.selectedRow.itemId),
      warehouseId: Number(this.selectedRow.warehouseId),
      binId: this.selectedRow.binId ?? null,
      supplierId: this.selectedRow.supplierId ?? null,
      faultQty: signedFaultQty,
      finalOnHand,
      stockIssueId: this.selectedRow.reason ?? null,
      approvedBy: userId || null,
      updatedBy: userId || 0
    };

    this.savingAdjustment = true;
    this.stackOverviewService.AdjustOnHand(payload).subscribe({
      next: () => {
        const keyMatch = (l: AdjustmentLine) =>
          l.itemId === this.selectedRow!.itemId &&
          (l.warehouseId ?? null) === (this.selectedRow!.warehouseId ?? null) &&
          (l.binId ?? null) === (this.selectedRow!.binId ?? null) &&
          (l.supplierId ?? null) === (this.selectedRow!.supplierId ?? null);

        const idx = this.adjLines.findIndex(keyMatch);
        if (idx > -1) {
          this.adjLines[idx] = {
            ...this.adjLines[idx],
            qty: finalOnHand,
            available: finalOnHand,
            type: this.selectedRow!.type,
            faultyQty: faultQty,
            reason: this.selectedRow!.reason,
            remarks: this.selectedRow!.remarks
          };
        }

        this.modalService.dismissAll();
        Swal.fire({ icon: 'success', title: 'Adjusted', text: 'Stock adjustment posted successfully.', confirmButtonColor: '#16a34a' });
        if (this.selectedItemId) this.loadGridData(this.selectedItemId);
      },
      error: (err) => {
        this.adjustError = err?.error?.message || err?.message || 'Stock adjustment failed.';
      },
      complete: () => {
        this.savingAdjustment = false;
      }
    });
  }

  // ---------- Lookups ----------
  loadStockissue() {
    this.stockIssueService.getAllStockissue().subscribe({
      next: (res) => {
        const payload: any = res;
        const raw = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        this.stockIssueOptions = raw
          .filter((item: any) => item.isActive)
          .map((item: any) => ({
            id: Number(item.id),
            name: String(item.stockIssuesNames ?? item.name ?? '')
          }));
      },
      error: (err) => {
        this.stockIssueOptions = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load stock issue reasons'), 'error');
      }
    });
  }

  // ---------- UI helpers ----------
  badgeToneClasses(tone: 'blue' | 'green' | 'amber' | 'red' = 'blue') {
    const map: Record<string, { bg: string; text: string; border: string }> = {
      blue:  { bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-100'  },
      green:{ bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-100' },
      amber:{ bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
      red:  { bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-100'   },
    };
    const t = map[tone] ?? map.blue;
    return `${t.bg} ${t.text} ${t.border}`;
  }

  compareById(o1: any, o2: any): boolean {
    return o1 && o2 ? o1.id === o2.id : o1 === o2;
  }
}

