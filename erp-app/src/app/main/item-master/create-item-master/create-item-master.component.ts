import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Observable } from 'rxjs';
import Swal from 'sweetalert2';

import { ItemMasterService } from '../item-master.service';
import { UploadService } from 'app/shared/upload.service';
import { QuickAddType, QuickAddResult } from 'app/shared/components/quick-add-modal/quick-add-modal.component';
import { ChartofaccountService } from 'app/main/financial/chartofaccount/chartofaccount.service';
import { UomService } from 'app/main/master/uom/uom.service';
import { WarehouseService } from 'app/main/master/warehouse/warehouse.service';
import { TaxCodeService } from 'app/main/master/taxcode/taxcode.service';
import { CoastingMethodService } from 'app/main/master/coasting-method/coasting-method.service';
import { SupplierService } from 'app/main/businessPartners/supplier/supplier.service';
import { StrategyService } from 'app/main/master/strategies/strategy.service';
import { StockIssueService } from 'app/main/master/stock-issue/stock-issue.service';
import { CatagoryService } from 'app/main/master/catagory/catagory.service';
import { RecurringService } from 'app/main/master/recurring/recurring.service';

/* ----------------- Lightweight view models ----------------- */
type PriceRow = {
  price: number | null;
  qty: number | null;
  purchaseQty?: number | null;
  barcode: string | null;
  SupplierId: number | string | null;
  supplierName?: string | null;
  supplierSearch?: string | null;
  warehouseId?: number | string | null;
  isTransfered: boolean;
  countedQty?: any;
  badCountedQty?: any;
  reasonId?: any;
};

interface Warehouse {
  id: number | string;
  name: string;
}

interface Bin {
  id?: number | string;
  name?: string;
  binID?: number | string;
  binName?: string;
  warehouseId?: number | string;
}

interface SupplierLite {
  id: number | string;
  name: string;
  code?: string;
}

interface ItemMasterAudit {
  auditId: number;
  itemId: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | string;
  occurredAtUtc: string;
  userId?: number | null;
  userName?: string | null;
  oldValuesJson?: string | null;
  newValuesJson?: string | null;
  remarks?: string | null;
}

interface ItemStockRow {
  warehouseId: number | string | null;
  binId: number | string | null;
  strategyId: number | string | null;
  onHand: number | null;
  qty?: number | null; 
  reserved: number | null;
  available: number | null;
  min: number | null;
  max: number | null;
  reorderQty: number | null;
  leadTimeDays: number | null;
  batchFlag: boolean;
  serialFlag: boolean;
  isApproved: boolean;
  isTransfered: boolean;
  stockIssueID: number;
  isFullTransfer: boolean;
  isPartialTransfer: boolean;
  approvedBy: number;
}

/* ----------------- BOM contracts ----------------- */
export interface BomLatestRow {
  supplierId: number;
  supplierName: string;
  existingCost: number;
  unitCost: number;
  createdDate: string;
}
export interface BomHistoryPoint {
  supplierId: number;
  supplierName: string;
  existingCost: number;
  unitCost: number;
  createdDate: string;
  rn?: number;
}
export interface BomSnapshot {
  latest: BomLatestRow[];
  history: BomHistoryPoint[];
}
export interface ItemBomRow {
  id: number;
  itemId: number;
  supplierId: number;
  existingCost: number;
  unitCost: number;
  createdDate: string;
  createdBy?: number;
  updatedBy?: number;
  updatedDate?: string;
}
interface BomInlineRow {
  supplierId: number | string | null;
  supplierName: string | null;
  existingCost: number;
  unitCost: number | null;
  percentage: number | null;
  sellingPrice: number | null;
}
interface BomTotals {
  rollup: number;
  count: number;
}

type SnapEmpty = { kind: 'empty' };
type SnapArray = { kind: 'array'; columns: string[]; items: any[] };
type SnapObject = { kind: 'object'; rows: { key: string; value: any }[]; arrays: { key: string; columns: string[]; items: any[] }[] };

type Snap = SnapEmpty | SnapArray | SnapObject;



@Component({
  standalone: false,
  selector: 'app-create-item-master',
  templateUrl: './create-item-master.component.html',
  styleUrls: ['./create-item-master.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class CreateItemMasterComponent implements OnInit {
  /* Steps */
  private bomCalcLock = false;
  costingName = '';
  taxName = '';

  itemStocksArr: any[] = [];
  pricesArr: any[] = [];
  private readonly stepsCreate = ['Summary'] as const;
  private readonly stepsEdit = ['Summary', 'Warehouses', 'Suppliers', 'Audit', 'Review'] as const;
  itemsetList: any;
  ItemTypeList: any;

  // Fulfillment Mode: drives PP / Direct DO routing in Sales (1=Sellable, 2=Consumable, 3=Both)
  // Default comes from the item's Category; this is the per-item override.
  fulfillmentModeList = [
    { id: 1, name: 'Sales Item' },
    { id: 2, name: 'Purchase Item' },
    { id: 3, name: 'Both → Pending (procurement)' }
  ];
  get stepsView() { return this.isEdit ? this.stepsEdit : this.stepsCreate; }
  get lastStepIndex() { return this.stepsView.length - 1; }
  step = 0;
  expandedAudit: Record<number, boolean> = {};
  busy: Record<number, boolean> = {};
  copied: Record<number, boolean> = {};
  userOverrodeFulfillment = false;
  drawer: {
    open: boolean;
    auditId: number;
    title: string;
    tab: 'before' | 'after';
    mode: 'snapshot' | 'field';
    field: string;
    audit: any;
    data: Snap;
  } = {
      open: false,
      auditId: 0,
      title: '',
      tab: 'before',
      mode: 'snapshot',
      field: '',
      audit: null,
      data: { kind: 'empty' }
    };

  next() {
    if (this.step === 0) {
      // ✅ new required validations (based on your new HTML)
      if (!this.item.itemCode?.trim()) {
        Swal.fire({ icon: 'warning', title: 'Required', text: 'Item Code is required.' });
        return;
      }
      if (!this.item.itemName?.trim()) {
        Swal.fire({ icon: 'warning', title: 'Required', text: 'Item Name is required.' });
        return;
      }
      if (!this.item.itemType) {
        Swal.fire({ icon: 'warning', title: 'Required', text: 'Item Type is required.' });
        return;
      }
      if (!this.item.categoryId) {
        Swal.fire({ icon: 'warning', title: 'Required', text: 'Category is required.' });
        return;
      }
      if (!this.item.uomId) {
        Swal.fire({ icon: 'warning', title: 'Required', text: 'UOM is required.' });
        return;
      }
      if (!this.item.baseUomId) {
        Swal.fire({ icon: 'warning', title: 'Required', text: 'Base UOM is required.' });
        return;
      }
      if (!this.item.uomFactor || Number(this.item.uomFactor) <= 0) {
        Swal.fire({ icon: 'warning', title: 'Required', text: 'Conversion Factor must be greater than 0.' });
        return;
      }
      const dupWarning = this.getDuplicateWarning();
      if (dupWarning) {
        Swal.fire({ icon: 'warning', title: 'Duplicate', text: dupWarning });
        return;
      }
      // if (!this.item.budgetLineId) {
      //   Swal.fire({ icon: 'warning', title: 'Required', text: 'Ledger Name is required.' });
      //   return;
      // }
    }

    if (this.step < this.stepsView.length - 1) {
      this.step++;
      if (this.isEdit && this.step === this.lastStepIndex) {
        this.buildReviewView();
      }
      // if (this.isEdit && this.step === 3) this.loadBomSnapshotOrFallback(); // BOM
      if (this.isEdit && this.step === 3) this.loadAudits(); // Audit
      this.maybeScrollToReviewBottom();
    }
  }
  prev() {
    if (this.step > 0) { this.step--; return; }
    // On the first step, "Back" leaves the form and returns to the item list.
    this.onGoToItemList();
  }

  /* Edit vs Create */
  isEdit = false;
  editingId: number | null = null;

  /* Existing items (for duplicate code/name validation) */
  existingItems: Array<{ id: number; itemCode: string; itemName: string }> = [];

  /* Audit */
  audits: ItemMasterAudit[] = [];


  /* Header model */
  item: any = this.makeEmptyItem();

  /* Lists */
  CategoryList: {  id: number;  catagoryName: string;  itemCategoryType: number;  }[] = [];; // ✅ for Category dropdown
  uomList: Array<{ id?: number; name: string }> = [];
  parentHeadList: Array<{ value: number; label: string }> = []; // ✅ Budget Line dropdown

  strategyList: any;
  taxCodeList: Array<{ id: number; name: string }> = [];
  costingMethodList: Array<{ id: number; name: string }> = [];
  warehouseList: Warehouse[] = [];
  binList: Bin[] = [];

  /* Suppliers / prices */
  prices: PriceRow[] = [];
  supplierList: SupplierLite[] = [];
  supplierDropdownOpen = false;
  filteredSuppliers: SupplierLite[] = [];
  activePriceIndex: number | null = null;

  /* Per-warehouse stock */
  itemStocks: ItemStockRow[] = [];

  /* Warehouse modal state */
  showWhModal = false;
  whDraft: ItemStockRow = this.makeEmptyStockDraft();
  isEditMode: boolean = false;
  editingIndex: number = -1;

  /* BOM (INLINE) */
  bomRows: BomInlineRow[] = [];
  bomTotals: BomTotals = { rollup: 0, count: 0 };
  bomHistoryBySupplier = new Map<number, BomHistoryPoint[]>();

  brand = '#2E5F73';
  minDate = '';
  userId: any;
  showRaw: Record<string | number, boolean> = {};
  reasonList: any;
    allowedUsageTypes: any[] = [
  { id: 1, name: 'Sales Item' },
  { id: 2, name: 'Internal Use Item' },
  { id: 3, name: 'Sales & Internal Use' }
];

  /* Inline quick-add (create a missing master without leaving the form) */
  qaType: QuickAddType | null = null;
  qaVisible = false;
  qaName = '';
  private qaTarget = '';
  private qaRow: any = null;

  @ViewChild('supplierSearchBox', { static: false }) supplierSearchBox!: ElementRef<HTMLElement>;
  @ViewChild('topOfWizard') topOfWizard!: ElementRef<HTMLDivElement>;
  @ViewChild('bottomOfWizard') bottomOfWizard!: ElementRef<HTMLDivElement>;

  constructor(
    private itemsSvc: ItemMasterService,
    private chartOfAccountService: ChartofaccountService,
    private uomService: UomService,
    private warehouseService: WarehouseService,
    private taxCodeService: TaxCodeService,
    private coastingmethodService: CoastingMethodService,
    private supplierService: SupplierService,
    private strategyService: StrategyService,
    private router: Router,
    private route: ActivatedRoute,
    private StockissueService: StockIssueService,
    private CategoryService: CatagoryService,
    private recurringService: RecurringService,
    private uploadService: UploadService
  ) {
    this.userId = localStorage.getItem('id');
  }

  // ── Item image ───────────────────────────────────────────────────────────────
  // The item record already carried a pictureUrl end to end — DTO, repository and column — but no
  // screen ever set one, so all 618 items had none. The file is uploaded as soon as it is picked
  // and only the returned URL travels in the item payload, which stays JSON.
  uploadingImage = false;

  imageSrc(url: string | null | undefined): string {
    return this.uploadService.toSrc(url);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const problem = this.uploadService.validate(file);
    if (problem) {
      Swal.fire('Image not accepted', problem, 'warning');
      input.value = '';
      return;
    }

    this.uploadingImage = true;
    this.uploadService.upload(file, 'items').subscribe({
      next: url => {
        this.item.pictureUrl = url;
        this.uploadingImage = false;
        input.value = '';   // so re-picking the same file fires 'change' again
      },
      error: () => {
        this.uploadingImage = false;
        input.value = '';
        Swal.fire('Upload failed', 'The image could not be uploaded. Please try again.', 'error');
      }
    });
  }

  removeImage(): void {
    this.item.pictureUrl = '';
  }

  ngOnInit(): void {
    this.setMinDate();

    // ✅ load dropdowns for step-0
    this.loadUoms();
    this.loadBudgetLines();
    this.loadCategories(); // ⚠️ replace with your category API call

    // existing loads
    this.loadWarehouses();
    this.loadCostingMethods();
    this.getAllRecurrring();
    this.getAllSupplier();
    this.getAllStrategy();
    this.getItemType();
    this.loadExistingItems();
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.isEdit = true;
      this.editingId = Number(idParam);
      this.loadForEdit(this.editingId);
    }

    this.StockissueService.getAllStockissue().subscribe((res: any) => {
      this.reasonList = res?.data ?? [];
    });
  }

  private getErrorMessage(err: any, fallback: string): string {
    return err?.error?.message || err?.message || fallback;
  }

  /* Derived totals */
  get totals() {
    const t = { onHand: 0, reserved: 0, available: 0 };
    for (const r of this.itemStocks) {
      const onHand = Number(r.onHand || 0);
      const reserved = Number(r.reserved || 0);
      t.onHand += onHand;
      t.reserved += reserved;
      t.available += Math.max(0, onHand - reserved);
    }
    return t;
  }
  getItemType() {
    this.itemsSvc.getAllItemType().subscribe((res: any) => {
      this.ItemTypeList = res?.data ?? [];
    });
  }

  /* Load all items so we can warn on duplicate Item Code / Item Name */
  private loadExistingItems(): void {
    this.itemsSvc.getAllItemMaster().subscribe({
      next: (res: any) => {
        const raw = Array.isArray(res) ? res : (res?.data ?? []);
        this.existingItems = (raw || []).map((x: any) => ({
          id: Number(x.id ?? 0),
          itemCode: (x.itemCode ?? x.sku ?? '').toString(),
          itemName: (x.itemName ?? x.name ?? '').toString()
        }));
      },
      error: () => { this.existingItems = []; }
    });
  }

  /* Duplicate Item Code / Item Name warning has been removed. */
  private getDuplicateWarning(): string | null {
    return null;
  }
  /* -------------------- Edit loader -------------------- */
  private loadForEdit(id: number): void {
    forkJoin({
      header: this.itemsSvc.getItemMasterById(id),
      stocks: this.itemsSvc.getWarehouseStock(id),
      prices: this.itemsSvc.getSupplierPrices(id),
    } as { header: Observable<any>; stocks: Observable<any>; prices: Observable<any>; })
      .subscribe({
        next: ({ header, stocks, prices }) => {
          const h: any = Array.isArray(header)
            ? header[0]
            : (header && 'data' in header ? (header as any).data : header) || {};

          // ✅ map edit record -> new fields
          this.item = {
            id: h.id,

            itemCode: h.itemCode ?? h.sku ?? '',
            itemName: h.itemName ?? h.name ?? '',
            itemType: h.itemTypeId != null ? Number(h.itemTypeId) : null,
            categoryId: h.categoryId ?? h.categoryID ?? null,
            uomId: h.uomId ?? h.uomID ?? null,
            budgetLineId: h.budgetLineId ?? h.budgetLineID ?? 0,
            fulfillmentMode: h.fulfillmentMode,
            // keep old fields too (if your backend expects)
            sku: h.sku ?? h.itemCode ?? '',
            name: h.name ?? h.itemName ?? '',
            category: h.category ?? h.catagoryName ?? '',
            uom: h.uom ?? h.uomName ?? '',
            baseUomId: h.baseUomId ?? h.baseUomID ?? null,
            uomFactor: h.uomFactor ?? 1,
            costingMethodId: h.costingMethodId ?? null,
            taxCodeId: h.taxCodeId ?? null,
            specs: h.specs ?? '',
            pictureUrl: h.pictureUrl ?? '',
            lastCost: h.lastCost ?? null,
            price: h.price ?? null,
            isActive: h.isActive ?? true,
            createdBy: this.userId,
            updatedBy: this.userId,
            expiryDate: new Date(),
          };
           setTimeout(() => {
            this.onCategoryChange(false);
          }, 300);

          const stockArr: any[] = Array.isArray(stocks)
            ? stocks
            : (stocks && 'data' in stocks ? (stocks as any).data : []) || [];
          this.itemStocks = stockArr.map((r: any) => ({
            warehouseId: r.warehouseId,
            binId: r.binId,
            strategyId: r.strategyId ?? null,
            onHand: Number(r.onHand || 0),
             qty: Number(r.qty || 0),
            reserved: Number(r.reserved || 0),
            available: Math.max(0, Number(r.available ?? (Number(r.onHand || 0) - Number(r.reserved || 0)))),
            min: r.min ?? r.minQty ?? null,
            max: r.max ?? r.maxQty ?? null,
            reorderQty: r.reorderQty ?? null,
            leadTimeDays: r.leadTimeDays ?? null,
            batchFlag: !!r.batchFlag,
            serialFlag: !!r.serialFlag,
            isApproved: !!r.isApproved,
            isTransfered: !!r.isTransfered,
            stockIssueID: r.stockIssueID ?? 0,
            isFullTransfer: !!r.isFullTransfer,
            isPartialTransfer: !!r.isPartialTransfer,
            approvedBy: Number(r.approvedBy ?? 0),
            baseUomName:r.baseUomName,
            uomFactor:r.uomFactor
          }));

          const priceArr: any[] = Array.isArray(prices)
            ? prices
            : (prices && 'data' in prices ? (prices as any).data : []) || [];

          this.prices = priceArr.map((p: any) => ({
            price: p.price ?? null,
            qty: (p.qty != null ? Number(p.qty) : (p.quantity != null ? Number(p.quantity) : null)),
            purchaseQty: (p.purchaseQty != null ? Number(p.purchaseQty) : null),
            barcode: p.barcode ?? null,
            SupplierId: p.supplierId ?? p.SupplierId ?? null,
            supplierName: p.supplierName ?? p.name ?? null,
            supplierSearch: (p.supplierName ?? p.name ?? '') as string,
            warehouseId: p.warehouseId ?? p.WarehouseId ?? null,
            isTransfered: !!(p.isTransfered ?? p.IsTransfered ?? false),
            countedQty: p.countedQty,
            badCountedQty: p.badCountedQty,
            reasonId: p.reasonId ? p.reasonId : '-',
            baseUomName:p.baseUomName
          }));
          this.buildReviewView();
          this.loadBomSnapshotOrFallback();
        },
        error: () => Swal.fire({ icon: 'error', title: 'Failed', text: 'Could not load item for editing.' })
      });
  }

  getReason(id: number | string | null) {
    const x = this.reasonList?.find((i: any) => i.id === id);
    return x?.stockIssuesNames ?? String(id ?? '');
  }

  private toDateOnly(d: any): string | null {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  }

  /* -------------------- Save -------------------- */
  async onSave(): Promise<void> {
    if (!this.item.itemCode?.trim() || !this.item.itemName?.trim()) {
      await Swal.fire({ icon: 'warning', title: 'Required', text: 'Item Code and Item Name are required.' });
      return;
    }
    if (!this.item.itemType || !this.item.categoryId || !this.item.uomId || !this.item.baseUomId ) {
      await Swal.fire({ icon: 'warning', title: 'Required', text: 'Item Type, Category, UOM , Base UOM and Ledger Name are required.' });
      return;
    }
    if (!this.item.uomFactor || Number(this.item.uomFactor) <= 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'Required',
        text: 'Conversion Factor must be greater than 0.'
      });
      return;
    }

    // ✅ warn on duplicate Item Code / Item Name
    const dupWarning = this.getDuplicateWarning();
    if (dupWarning) {
      await Swal.fire({ icon: 'warning', title: 'Duplicate', text: dupWarning });
      return;
    }

    // ✅ map to old backend fields (so existing API continues)
    this.item.sku = this.item.itemCode?.trim();
    this.item.name = this.item.itemName?.trim();
    const stocksPayload = this.itemStocks.map(r => ({
      warehouseId: r.warehouseId,
      binId: r.binId,
      strategyId: r.strategyId,
      qty: Number(r.qty || 0), 
      onHand: Number(r.onHand || 0),
      available: Math.max(0, Number(r.onHand || 0) - Number(r.reserved || 0)),
      reserved: Number(r.reserved || 0),
      minQty: Number(r.min || 0),
      maxQty: Number(r.max || 0),
      reorderQty: Number(r.reorderQty || 0),
      leadTimeDays: Number(r.leadTimeDays || 0),
      batchFlag: !!r.batchFlag,
      serialFlag: !!r.serialFlag,
      isApproved: !!r.isApproved,
      isTransfered: !!r.isTransfered,
      stockIssueID: r.stockIssueID ?? 0,
      isFullTransfer: !!r.isFullTransfer,
      isPartialTransfer: !!r.isPartialTransfer,
      approvedBy: Number(r.approvedBy ?? 0),
      companyId: localStorage.getItem('companyId')
    }));

    const bomPayload = (this.bomRows || [])
      .filter(r => r.supplierId != null && Number(r.unitCost ?? r.existingCost ?? 0) > 0)
      .map(r => ({
        supplierId: Number(r.supplierId),
        supplierName: r.supplierName || '',
        existingCost: Number(r.existingCost || 0),
        unitCost: Number(r.unitCost ?? r.existingCost ?? 0),
        percentage: Number(r.percentage || 0),
        sellingPrice: Number(r.sellingPrice || 0)
      }));

    const pricesPayload = (this.prices ?? [])
      .filter(p => p.price != null && p.SupplierId != null)
      .map(p => ({
        supplierId: p.SupplierId,
        warehouseId: p.warehouseId,
        price: Number(p.price),
        qty: p.qty == null || p.qty === ('' as any) ? 0 : Number(p.qty),
         purchaseQty: Number(p.purchaseQty || 0),
        barcode: p.barcode ?? null,
        isTransfered: !!p.isTransfered
      }));
      const companyId = Number(localStorage.getItem('companyId') || 0);

    const payload: any = {
      ...this.item,

      // ✅ new fields
      companyId: companyId, 
      ItemTypeId: this.item.itemType,
      categoryId: Number(this.item.categoryId),
      uomId: Number(this.item.uomId),
       BaseUomId: Number(this.item.baseUomId),   // new
       UomFactor: Number(this.item.uomFactor),
      budgetLineId: Number(this.item.budgetLineId)||0,

      itemStocks: stocksPayload,
      prices: pricesPayload,
      ...(this.isEdit ? { bomLines: bomPayload } : {})
    };
    if (this.isEdit) payload.bomLines = bomPayload;

    const creating = !payload.id || payload.id <= 0;

    const onApiSuccess = (res: any) => {
      const ok = res?.isSuccess === true || res?.issucess === true;
      if (ok) {
        Swal.fire({
          icon: 'success',
          title: creating ? 'Created!' : 'Updated!',
          text: res?.message || (creating ? 'Item created successfully' : 'Item updated successfully'),
          confirmButtonColor: '#16a34a'
        });

        if (creating) { this.onGoToItemList(); return; }
        if (this.item?.id) 
          {
            this.onGoToItemList();
            this.loadBomSnapshotOrFallback();
          }
      } else {
        Swal.fire({ icon: 'error', title: 'Failed', text: res?.message || 'Save failed', confirmButtonColor: '#16a34a' });
      }
    };

    const onApiError = (err: any) =>
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: this.getErrorMessage(err, creating ? 'Create failed' : 'Update failed'),
        confirmButtonColor: '#16a34a'
      });

    if (creating) this.itemsSvc.createItemMaster(payload).subscribe({ next: onApiSuccess, error: onApiError });
    else this.itemsSvc.updateItemMaster(payload.id, payload).subscribe({ next: onApiSuccess, error: onApiError });
  }

  /* -------------------- Misc UI helpers -------------------- */
  setMinDate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    this.minDate = `${yyyy}-${mm}-${dd}`;
  }

  onExpiryChange(e: Event) {
    const value = (e.target as HTMLInputElement).value || null;
    this.item.expiryDate = value;
    this.item.createdBy = this.userId;
    this.item.updatedBy = this.userId;
  }

  onTaxSelectedId(id: number | null) { this.item.taxCodeId = id; }
  onCostingSelectedId(id: number | null) { this.item.costingMethodId = id; }

  /* -------------------- Inline quick-add -------------------- */
  openQa(type: QuickAddType, target: string, text: string, row: any = null): void {
    this.qaType = type;
    this.qaTarget = target;
    this.qaRow = row;
    this.qaName = (text || '').trim();
    this.qaVisible = true;
  }

  qaCreated(e: QuickAddResult): void {
    if (!e?.id) { this.qaVisible = false; return; }
    switch (this.qaTarget) {
      case 'itemType':
        this.ItemTypeList = [...(this.ItemTypeList || []), { itemTypeName: e.label, id: e.id }];
        this.item.itemType = e.id;
        break;
      case 'category':
        this.CategoryList = [...(this.CategoryList || []), { catagoryName: e.label, id: e.id }] as any;
        this.item.categoryId = e.id;
        break;
      case 'uomPurchase':
        this.uomList = [...(this.uomList || []), { name: e.label, id: e.id }];
        this.item.uomId = e.id;
        break;
      case 'uomBase':
        this.uomList = [...(this.uomList || []), { name: e.label, id: e.id }];
        this.item.baseUomId = e.id;
        break;
      case 'costingMethod':
        this.costingMethodList = [...(this.costingMethodList || []), { name: e.label, id: e.id }];
        this.item.costingMethodId = e.id;
        break;
      case 'taxCode':
        this.taxCodeList = [...(this.taxCodeList || []), { recurringName: e.label, id: e.id }] as any;
        this.item.taxCodeId = e.id;
        break;
      case 'warehouse':
        this.warehouseList = [...(this.warehouseList || []), { name: e.label, id: e.id }];
        this.whDraft.warehouseId = e.id;
        break;
      case 'bin':
        this.binList = [...(this.binList || []), { binName: e.label, binID: e.id }];
        this.whDraft.binId = e.id;
        break;
      case 'strategy':
        this.strategyList = [...(this.strategyList || []), { strategyName: e.label, id: e.id }];
        this.whDraft.strategyId = e.id;
        break;
    }
    this.qaVisible = false;
  }

  /* -------------------- Warehouse modal -------------------- */
  openWhModal(): void {
    this.whDraft = this.makeEmptyStockDraft();
    this.showWhModal = true;
    (document.body.style as any).overflow = 'hidden';
  }
  closeWhModal(): void {
    this.showWhModal = false;
    (document.body.style as any).overflow = '';
  }

  editLine(i: number): void {
    const r = this.itemStocks[i];
    if (!r) return;
    this.isEditMode = true;
    this.editingIndex = i;
    this.whDraft = {
      warehouseId: r.warehouseId ?? null,
      binId: r.binId ?? null,
      strategyId: r.strategyId ?? null,
      onHand: Number(r.onHand ?? 0),
      reserved: Number(r.reserved ?? 0),
      available: Math.max(0, Number(r.available ?? (Number(r.onHand ?? 0) - Number(r.reserved ?? 0)))),
      min: r.min ?? null,
      max: r.max ?? null,
      reorderQty: r.reorderQty ?? null,
      leadTimeDays: r.leadTimeDays ?? null,
      batchFlag: !!r.batchFlag,
      serialFlag: !!r.serialFlag,
      isApproved: !!r.isApproved,
      isTransfered: !!r.isTransfered,
      stockIssueID: r.stockIssueID ?? 0,
      isFullTransfer: !!r.isFullTransfer,
      isPartialTransfer: !!r.isPartialTransfer,
      approvedBy: Number(r.approvedBy ?? 0)
    };
    this.getBinsForWarehouse(this.whDraft.warehouseId);
    this.showWhModal = true;
  }

  submitWarehouse(closeAfter: boolean): void {
    this.recalcDraft();
    if (!this.whDraft.warehouseId) { Swal.fire({ icon: 'warning', title: 'Select warehouse' }); return; }
    if (!this.whDraft.binId) { Swal.fire({ icon: 'warning', title: 'Select bin' }); return; }
    if ((this.whDraft.min ?? 0) > (this.whDraft.max ?? 0)) {
      Swal.fire({ icon: 'warning', title: 'Invalid min/max', text: 'Min cannot exceed Max' });
      return;
    }
    if ((this.whDraft.reserved ?? 0) > (this.whDraft.onHand ?? 0)) {
      Swal.fire({ icon: 'warning', title: 'Invalid reserved', text: 'Reserved cannot exceed On Hand' });
      return;
    }

    const dupIdx = this.itemStocks.findIndex(x =>
      String(x.warehouseId) === String(this.whDraft.warehouseId) &&
      String(x.binId) === String(this.whDraft.binId)
    );
    if (dupIdx !== -1 && (!this.isEditMode || dupIdx !== this.editingIndex)) {
      Swal.fire({ icon: 'warning', title: 'Duplicate', text: 'This Warehouse + Bin already exists.' });
      return;
    }

    const normalized: ItemStockRow = {
      warehouseId: this.whDraft.warehouseId,
      binId: this.whDraft.binId,
      strategyId: this.whDraft.strategyId,
      onHand: Number(this.whDraft.onHand ?? 0),
      reserved: Number(this.whDraft.reserved ?? 0),
      available: Math.max(0, Number(this.whDraft.onHand ?? 0) - Number(this.whDraft.reserved ?? 0)),
      min: this.whDraft.min ?? null,
      max: this.whDraft.max ?? null,
      reorderQty: this.whDraft.reorderQty ?? null,
      leadTimeDays: this.whDraft.leadTimeDays ?? null,
      batchFlag: !!this.whDraft.batchFlag,
      serialFlag: !!this.whDraft.serialFlag,
      isApproved: !!this.whDraft.isApproved,
      isTransfered: !!this.whDraft.isTransfered,
      stockIssueID: this.whDraft.stockIssueID ?? 0,
      isFullTransfer: !!this.whDraft.isFullTransfer,
      isPartialTransfer: !!this.whDraft.isPartialTransfer,
      approvedBy: this.whDraft.approvedBy ?? 0
    };

    if (this.isEditMode && this.editingIndex > -1) {
      const next = [...this.itemStocks];
      next[this.editingIndex] = { ...next[this.editingIndex], ...normalized };
      this.itemStocks = next;

      if (closeAfter) {
        this.closeWhModal();
        this.isEditMode = false;
        this.editingIndex = -1;
      } else {
        const keepWarehouse = this.whDraft.warehouseId;
        this.isEditMode = false;
        this.editingIndex = -1;
        this.whDraft = this.makeEmptyStockDraft();
        this.whDraft.warehouseId = keepWarehouse;
        this.getBinsForWarehouse(this.whDraft.warehouseId);
      }
    } else {
      this.itemStocks.push({ ...normalized });
      if (closeAfter) this.closeWhModal();
      else this.whDraft = this.makeEmptyStockDraft();
    }
  }

  removeWarehouseRow(i: number): void {
    if (i >= 0 && i < this.itemStocks.length) this.itemStocks.splice(i, 1);
  }

  recalcDraft(): void {
    const onHand = Math.max(0, Number(this.whDraft.onHand || 0));
    const reserved = Math.max(0, Number(this.whDraft.reserved || 0));
    this.whDraft.onHand = onHand;
    this.whDraft.reserved = reserved;
    this.whDraft.available = Math.max(0, onHand - reserved);
  }

  /* -------------------- Lookups -------------------- */
  getBinsForWarehouse(id: number | string | null) {
    this.warehouseService.getBinNameByIdAsync(id).subscribe((response: any) => {
      this.binList = Array.isArray(response) ? response : (response?.data ?? []);
    });
  }

  getWarehouseName(id: any): string {
    const w = this.warehouseList.find(x => String(x.id) === String(id));
    return w?.name ?? '-';
  }
  getBinName(id: any): string {
    if (id == null) return '-';
    const byId = this.binList.find(b => String((b.binID ?? (b as any).id)) === String(id));
    return (byId?.binName ?? (byId as any)?.name) || '-';
  }
  getStrategyName(id: any): string {
    if (id == null) return '-';
    const s = (this.strategyList || []).find((x: any) => String(x.id) === String(id));
    return s?.strategyName || s?.name || '-';
  }

  /* -------------------- Suppliers -------------------- */
  getAllSupplier() {
    this.supplierService.GetAllSupplier().subscribe((response: any) => {
      this.supplierList = (response?.data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name ?? s.supplierName ?? `Supplier-${s.id}`,
        code: s.code ?? s.supplierCode ?? undefined
      }));
      if (!this.prices.length) this.filteredSuppliers = this.supplierList.slice(0, 20);
    });
  }

  /* -------------------- Dropdown loads (Step-0) -------------------- */
  private loadUoms(): void {
    this.uomService.getAllUom().subscribe((res: any) => {
      const raw = Array.isArray(res) ? res : (res?.data ?? []);
      this.uomList = raw.map((u: any) => ({ id: u.id, name: u.name }));
    });
  }

  private loadBudgetLines(): void {
    this.chartOfAccountService.getAllChartOfAccount().subscribe((res: any) => {
      const all = (res?.data ?? res ?? []).filter((x: any) => x?.isActive !== false);
      this.parentHeadList = all.map((head: any) => ({
        value: Number(head.id),
        label: this.buildFullHeadPath(head, all)
      }));
    });
  }

  private loadCategories(): void {
    this.CategoryService.getAllCatagory().subscribe((res: any) => {
      const raw = Array.isArray(res) ? res : (res?.data ?? []);
      this.CategoryList = raw.filter((item: any) => item.isActive === true);
    });
  }

  private buildFullHeadPath(item: any, all: any[]): string {
    let path = item.headName ?? '';
    let current = all.find((x: any) => x.headCode === item.parentHead);
    while (current) {
      path = `${path}`;
      current = all.find((x: any) => x.headCode === current.parentHead);
    }
    return path;
  }

  /* -------------------- Other catalogs -------------------- */
  loadWarehouses() {
    this.warehouseService.getWarehouse().subscribe({
      next: (res: any) => {
        const raw = Array.isArray(res) ? res : (res?.data ?? []);
        this.warehouseList = raw.map((w: any) => ({
          id: w.id,
          name: w.name || w.warehouseName || `WH-${w.id}`
        }));
      },
      error: (err: any) => {
        this.warehouseList = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load warehouses'), 'error');
      }
    });
  }

  loadCostingMethods() {
    this.coastingmethodService.getAllCoastingMethod().subscribe((res: any) => {
      const raw = Array.isArray(res) ? res : (res?.data ?? []);
      this.costingMethodList = raw
        .filter((x: any) => x.isActive === true)
        .map((x: any) => ({ id: x.id, name: x.costingName }));
    });
  }

  // getAllTaxCode() {
  // this.taxCodeService.getTaxCode().subscribe((response: any) => {
  //   const data = response?.data ?? [];
  //  this.taxCodeList = data.map((t: any) => ({ id: t.id, name: t.name }));
  //   });
  // }
  getAllRecurrring() {
    this.recurringService.getRecurring().subscribe((response: any) => {
      const raw = Array.isArray(response) ? response : (response?.data ?? []);
      this.taxCodeList = raw.map((t: any) => ({ id: t.id, recurringName: t.recurringName }));
    })
  }

  getAllStrategy() {
    this.strategyService.getStrategy().subscribe((response: any) => {
      this.strategyList = response?.data ?? response?.data ?? response;
    });
  }

  /* -------------------- Pricing -------------------- */
  addPriceLine(): void {
    this.prices = [
      ...this.prices,
      {
        price: null,
        qty: null,
        barcode: null,
        SupplierId: null,
        supplierName: null,
        supplierSearch: '',
        warehouseId: null,
        isTransfered: false
      }
    ];
    this.activePriceIndex = null;
    this.filteredSuppliers = [];
    this.supplierDropdownOpen = false;
  }

  removePriceLine(i: number): void {
    this.prices = this.prices.filter((_, idx) => idx !== i);
    if (this.isEdit) this.syncBomFromPrices();
  }

  /* Supplier dropdown */
  filterSuppliersForRow(i: number): void {
    const q = (this.prices[i]?.supplierSearch || '').toLowerCase().trim();
    this.filteredSuppliers = !q
      ? this.supplierList.slice(0, 20)
      : this.supplierList.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.code && s.code.toLowerCase().includes(q)) ||
        String(s.id).toLowerCase().includes(q)
      );
  }
  trackBySupplierId = (_: number, s: SupplierLite) => s.id;

  selectSupplierForRow(i: number, s: SupplierLite, ev?: MouseEvent): void {
    ev?.stopPropagation();
    const row = this.prices[i];
    if (!row) return;
    row.SupplierId = s.id;
    row.supplierName = s.name;
    row.supplierSearch = s.name;
    this.activePriceIndex = i;
    this.supplierDropdownOpen = false;
    if (this.isEdit) this.syncBomFromPrices();
  }

  /* Global focus & click */
  @HostListener('document:focusin', ['$event'])
  onFocusIn(ev: FocusEvent) {
    const target = ev.target as HTMLInputElement;
    if (!target) return;
    if (target.name?.startsWith('supplierSearch')) {
      this.supplierDropdownOpen = true;
      const tr = target.closest('tr');
      if (tr && tr.parentElement) {
        const rows = Array.from(tr.parentElement.querySelectorAll(':scope > tr'));
        const idx = rows.indexOf(tr);
        this.activePriceIndex = idx >= 0 ? idx : null;
      }
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent) {
    const t = ev.target as Node;
    const supplierBox = this.supplierSearchBox?.nativeElement;
    if (supplierBox && !supplierBox.contains(t)) this.supplierDropdownOpen = false;
  }

  loadAudits(): void {
    const id = Number(this.item?.id || 0);
    if (!id) { this.audits = []; return; }

    this.itemsSvc.getItemAudit(id).subscribe({
      next: (r: any) => {
        const arr = r?.data ?? r ?? [];
        this.audits = (Array.isArray(arr) ? arr : []).map((a: any) => ({
          auditId: a.auditId ?? a.AuditId ?? a.id ?? a.Id ?? 0,
          itemId: a.itemId ?? a.ItemId ?? id,
          action: (a.action ?? a.Action ?? '').toString(),
          occurredAtUtc: a.occurredAtUtc ?? a.OccurredAtUtc ?? a.occurredAt ?? a.OccurredAt ?? a.createdDate ?? a.CreatedDate ?? '',
          userId: a.userId ?? a.UserId ?? null,
          userName: a.userName ?? a.UserName ?? null,

          // ✅ THIS is why your drawer is empty (case mismatch)
          oldValuesJson: a.oldValuesJson ?? a.OldValuesJson ?? a.oldValues ?? a.OldValues ?? a.beforeJson ?? a.BeforeJson ?? null,
          newValuesJson: a.newValuesJson ?? a.NewValuesJson ?? a.newValues ?? a.NewValues ?? a.afterJson ?? a.AfterJson ?? null,

          remarks: a.remarks ?? a.Remarks ?? null
        }));
      },
      error: _ => this.audits = []
    });
  }


  /* ----------------- BOM logic ----------------- */
  private loadBomSnapshotOrFallback(): void {
    const id = Number(this.item?.id || 0);
    if (!this.isEdit || !id) { this.syncBomFromPrices(); return; }
    this.loadBomSnapshot(id, true);
  }

  private normalizeSnapshot(payload: any): BomSnapshot {
    const root = payload?.data ?? payload ?? {};
    const latest = Array.isArray(root.latest) ? root.latest : [];
    const history = Array.isArray(root.history) ? root.history : [];
    return { latest, history } as BomSnapshot;
  }

  private normalizeFlat(payload: any): ItemBomRow[] | BomSnapshot {
    const root = payload?.data ?? payload ?? [];
    return root;
  }

  private loadBomSnapshot(itemId: number, fallbackToPrices = false): void {
    const apiSnap$ = (this.itemsSvc as any).getBomSnapshot?.(itemId) as Observable<any> | undefined;
    const apiFlat$ = this.itemsSvc.getBom(itemId) as Observable<any>;

    const useFlat = () => apiFlat$.subscribe({
      next: (raw: any) => {
        const normalized = this.normalizeFlat(raw);
        if (Array.isArray(normalized)) {
          this.populateHistoryFromFlatRows(normalized);
          this.deriveLatestFromFlatRows(normalized);
        } else {
          this.populateFromSnapshot(this.normalizeSnapshot(normalized));
        }
      },
      error: () => { if (fallbackToPrices) this.syncBomFromPrices(); }
    });

    if (apiSnap$) {
      apiSnap$.subscribe({
        next: (snap: any) => this.populateFromSnapshot(this.normalizeSnapshot(snap)),
        error: () => useFlat()
      });
    } else {
      useFlat();
    }
  }

private populateFromSnapshot(snap: BomSnapshot) {
  const latest = Array.isArray(snap?.latest) ? snap.latest : [];
  const history = Array.isArray(snap?.history) ? snap.history : [];

  // ---------------------------
  // 1) Build history map
  // ---------------------------
  this.bomHistoryBySupplier.clear();

  for (const h of history) {
    const sid = Number((h as any).supplierId ?? 0);
    if (!sid) continue;

    const point: BomHistoryPoint = {
      supplierId: sid,
      supplierName: (h as any).supplierName ?? '',
      existingCost: Number((h as any).existingCost ?? 0),
      unitCost: Number((h as any).unitCost ?? (h as any).existingCost ?? 0),
      createdDate: (h as any).createdDate,
      rn: (h as any).rn
    };

    const arr = this.bomHistoryBySupplier.get(sid) ?? [];
    arr.push(point);
    this.bomHistoryBySupplier.set(sid, arr);
  }

  // ---------------------------
  // 2) Build latest rows
  // ---------------------------
  if (latest.length) {
    this.bomRows = latest.map((r: any) => {
      const existingCost = Number(r.existingCost ?? 0);
      const unitCost = Number(r.unitCost ?? r.existingCost ?? 0);

      const pct = (r.percentage != null) ? Number(r.percentage) : 0;

      // sellingPrice: if API has -> use, else compute from base
      const sell = (r.sellingPrice != null)
        ? Number(r.sellingPrice)
        : this.round2(existingCost * (1 + pct / 100));

      return {
        supplierId: Number(r.supplierId ?? 0) || null,
        supplierName: r.supplierName || '—',
        existingCost,
        unitCost,
        percentage: pct,
        sellingPrice: sell
      } as BomInlineRow;
    });

    // ✅ IMPORTANT: ensure existingCost is not 0 (fallback to latest history chip or unitCost)
    this.bomRows = (this.bomRows || []).map(r => {
      const base = this.getBomBaseCost(r);   // uses existingCost -> unitCost -> history chip
      return { ...r, existingCost: base };
    });

    // ✅ recompute totals
    this.recomputeBomTotalsInline();
  } else {
    // fallback
    this.syncBomFromPrices();
  }
}
  private populateHistoryFromFlatRows(rows: ItemBomRow[]) {
    this.bomHistoryBySupplier.clear();
    const toPoint = (r: ItemBomRow): BomHistoryPoint => ({
      supplierId: r.supplierId,
      supplierName: this.supplierList.find(s => String(s.id) === String(r.supplierId))?.name ?? '',
      existingCost: Number(r.existingCost ?? 0),
      unitCost: Number(r.unitCost ?? r.existingCost ?? 0),
      createdDate: r.createdDate
    });

    for (const r of rows) {
      const sid = Number(r.supplierId || 0);
      if (!sid) continue;
      const arr = this.bomHistoryBySupplier.get(sid) ?? [];
      arr.push(toPoint(r));
      this.bomHistoryBySupplier.set(sid, arr);
    }
  }

private deriveLatestFromFlatRows(rows: ItemBomRow[]) {
  const bySup = new Map<number, ItemBomRow>();
  for (const r of rows) {
    const sid = Number(r.supplierId || 0);
    const prev = bySup.get(sid);
    if (!prev || new Date(r.createdDate) > new Date(prev.createdDate)) bySup.set(sid, r);
  }

  this.bomRows = Array.from(bySup.values()).map(r => {
    const existingCost = Number(r.existingCost ?? 0);
    const unitCost = Number(r.unitCost ?? r.existingCost ?? 0);

    // flat row maybe not having pct/selling => derive
    const pct = (r as any).percentage != null ? Number((r as any).percentage) : 0;
    const sell = (r as any).sellingPrice != null
      ? Number((r as any).sellingPrice)
      : this.round2(existingCost * (1 + pct / 100));

    return {
      supplierId: r.supplierId,
      supplierName: this.supplierList.find(s => String(s.id) === String(r.supplierId))?.name ?? '—',
      existingCost,
      unitCost,
      percentage: pct,
      sellingPrice: sell
    } as BomInlineRow;
  });

  this.recomputeBomTotalsInline();
}

syncBomFromPrices(opts: { preserveUnitCost?: boolean } = { preserveUnitCost: true }): void {
  const preserve = opts.preserveUnitCost !== false;
  const norm = (s: any) => String(s ?? '').trim().toLowerCase();

  const prevByKey = new Map<string, BomInlineRow>();
  for (const r of this.bomRows || []) {
    const key = `${String(r.supplierId ?? '')}::${norm(r.supplierName)}`;
    prevByKey.set(key, r);
  }

  const next: BomInlineRow[] = (this.prices || [])
    .filter(p => p.price != null)
    .map(p => {
      const supplierId = p.SupplierId ?? null;
      const supplierName = p.supplierName ?? null;
      const existingCost = Number(p.price || 0);

      const key = `${String(supplierId ?? '')}::${norm(supplierName)}`;
      const prev = prevByKey.get(key);

      const unitCost = preserve && prev && prev.unitCost != null ? Number(prev.unitCost) : existingCost;

      // ✅ NEW: keep old values if exist else auto
      const percentage = prev?.percentage ?? 0;
      const sellingPrice = prev?.sellingPrice ?? this.round2(existingCost * (1 + Number(percentage || 0) / 100));

      return {
        supplierId,
        supplierName,
        existingCost,
        unitCost,
        percentage,
        sellingPrice
      } as BomInlineRow;
    });

  this.bomRows = next;
  this.recomputeBomTotalsInline();
}

  recomputeBomTotalsInline(): void {
    const roll = (this.bomRows || []).reduce((sum, r) => sum + Number(r.unitCost || 0), 0);
    this.bomTotals = { rollup: this.toNum(roll, 6), count: this.bomRows.length };
  }

  private toNum(v: any, dp = 6): number {
    const n = Number(v ?? 0);
    if (!isFinite(n)) return 0;
    const p = Math.pow(10, dp);
    return Math.round(n * p) / p;
  }

  /* Navigation */
  onGoToItemList(): void {
    this.router.navigate(['/app/inventory/List-itemmaster']);
  }

  private isOnReviewStep(): boolean {
    return (this.isEdit && this.step === this.lastStepIndex);
  }

  private maybeScrollToReviewBottom() {
    if (!this.isOnReviewStep()) return;
    setTimeout(() => {
      this.bottomOfWizard?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }, 0);
  }

  /* Small utilities */
  private makeEmptyItem() {
    return {
      id: 0,

      // ✅ NEW fields used in your HTML
      itemCode: '',
      itemName: '',
      itemType: null,
      categoryId: null as number | null,
      uomId: null as number | null,

       baseUomId: null as number | null,
       uomFactor: 1,

      budgetLineId: null as number | null,
      fulfillmentMode: null,
      // keep old fields too (for existing API)
      sku: '',
      name: '',
      category: '',
      uom: '',

      costingMethodId: null as number | null,
      taxCodeId: null as number | null,
      specs: '',
      pictureUrl: '',
      lastCost: null,
      price: null as number | null,
      isActive: true,
      createdBy: this.userId,
      updatedBy: this.userId,
      expiryDate:new Date()
    };
  }

  private makeEmptyStockDraft(): ItemStockRow {
    return {
      warehouseId: null,
      binId: null,
      strategyId: null,
      onHand: null,
      reserved: null,
      available: null,
      min: null,
      max: null,
      reorderQty: null,
      leadTimeDays: null,
      batchFlag: false,
      serialFlag: false,
      isApproved: false,
      isTransfered: false,
      stockIssueID: 0,
      isFullTransfer: false,
      isPartialTransfer: false,
      approvedBy: 0
    };
  }
  loadCatagory() {
    this.CategoryService.getAllCatagory().subscribe((res: any) => {
      // Filter only active ones
      this.CategoryList = res.data.filter((item: any) => item.isActive === true);

    });
  }
  chipStyle(action: string) {
    const a = (action || '').toUpperCase();
    const map: any = {
      CREATE: { bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' },
      UPDATE: { bg: '#E0F2FE', color: '#075985', border: '#BAE6FD' },
      DELETE: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' }
    };
    const s = map[a] || { bg: '#F1F5F9', color: '#334155', border: '#E2E8F0' };
    return {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '9999px',
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.color,
      fontSize: '11px',
      fontWeight: 600
    };
  }
  avatarStyle(_name?: string) {
    return {
      display: 'inline-grid',
      placeItems: 'center',
      width: '20px',
      height: '20px',
      borderRadius: '9999px',
      fontSize: '10px',
      fontWeight: 700,
      color: '#fff',
      background: this.brand,
      border: '1px solid #dbe7ee',
      boxShadow: '0 1px 0 rgba(0,0,0,.03)',
      marginRight: '6px'
    } as any;
  }
  get userPillStyle() {
    return {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '9999px',
      background: '#F1F5F9',
      border: '1px solid #E2E8F0',
      fontSize: '11px',
      color: '#334155'
    } as any;
  }
  initials(full: string) {
    if (!full) return '?';
    const parts = full.trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts[1]?.[0] || '';
    return (first + last).toUpperCase();
  }

  prettyJson(payload: any): string {
    if (!payload) return '—';
    try {
      const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
      return JSON.stringify(obj, null, 2);
    } catch { return String(payload); }
  }
  private valueToText(v: any): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  safeParse(x: any) {
    if (!x) return null;
    try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return x; }
  }

  async copyJson(a: any) {
    const k = String(a.auditId ?? a.occurredAtUtc ?? '');
    this.busy[k] = true;
    const payload = {
      action: a.action,
      occurredAtUtc: a.occurredAtUtc,
      user: a.userName || a.userId,
      before: this.safeParse(a.oldValuesJson),
      after: this.safeParse(a.newValuesJson)
    };
    const text = JSON.stringify(payload, null, 2);

    try {
      if ((navigator as any).clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.copied[k] = true;
      setTimeout(() => this.copied[k] = false, 1500);
    } catch {
      Swal.fire({ toast: true, position: 'top', icon: 'error', title: 'Copy failed', showConfirmButton: false, timer: 1500 });
    } finally { this.busy[k] = false; }
  }

  keyOf(a: any, index: number): string {
    return String(a?.auditId ?? `${(a?.action || '').toUpperCase()}_${a?.occurredAtUtc ?? ''}_${index}`);
  }
  isExpanded(a: any, index: number): boolean {
    return !!this.expandedAudit[this.keyOf(a, index)];
  }
  isUpdate(a: any): boolean {
    return (a?.action || '').toString().toUpperCase() === 'UPDATE';
  }
  diffs(a: any): Array<{ field: string; before: any; after: any }> {
    const oldObj = this.safeParse(a?.oldValuesJson) || {};
    const newObj = this.safeParse(a?.newValuesJson) || {};
    if (typeof oldObj !== 'object' || typeof newObj !== 'object') return [];
    const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
    return keys
      .filter(k => (oldObj as any)[k] !== (newObj as any)[k])
      .map(k => ({
        field: k,
        before: this.valueToText((oldObj as any)[k]),
        after: this.valueToText((newObj as any)[k]),
      }));
  }
  applyBomToPrices(): void {
    if (!this.bomRows?.length || !this.prices?.length) return;
    const norm = (s: any) => String(s ?? '').trim().toLowerCase();
    const mapById = new Map<string, number>();
    const mapByName = new Map<string, number>();

    for (const r of this.bomRows) {
      const cost = Number((r.unitCost ?? r.existingCost ?? 0));
      if (r.supplierId != null) mapById.set(String(r.supplierId), cost);
      if (r.supplierName) mapByName.set(norm(r.supplierName), cost);
    }

    this.prices = this.prices.map(p => {
      const idKey = p.SupplierId != null ? String(p.SupplierId) : '';
      const nameKey = norm(p.supplierName);
      let nextPrice: number | null = null;
      if (idKey && mapById.has(idKey)) nextPrice = mapById.get(idKey)!;
      else if (nameKey && mapByName.has(nameKey)) nextPrice = mapByName.get(nameKey)!;
      if (nextPrice == null) return p;
      return { ...p, price: nextPrice };
    });
  }

  addBomRow(): void {
    this.bomRows = [...this.bomRows, { supplierId: null, supplierName: null, existingCost: 0, unitCost: null,percentage:0,sellingPrice:0}];
    this.recomputeBomTotalsInline();
  }
  removeBomRow(i: number): void {
    this.bomRows = this.bomRows.filter((_, idx) => idx !== i);
    this.recomputeBomTotalsInline();
  }
  getLast3CostsForSupplier(supplierId: number | string | null): Array<{ value: number; when: Date }> {
    const sid = Number(supplierId ?? 0);
    if (!sid) return [];
    const hist = this.bomHistoryBySupplier.get(sid) ?? [];
    if (!hist.length) return [];
    const sorted = [...hist].sort(
      (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()
    );
    const seen = new Set<string>();
    const out: Array<{ value: number; when: Date }> = [];
    for (const h of sorted) {
      const val = Number((h.unitCost ?? h.existingCost) ?? 0);
      const key = val.toFixed(4);
      if (!seen.has(key)) {
        out.push({ value: val, when: new Date(h.createdDate) });
        seen.add(key);
      }
      if (out.length >= 3) break;
    }
    return out;
  }
  isCurrentCost(curr: number | null | undefined, val: number | null | undefined): boolean {
    const a = Number(curr ?? 0);
    const b = Number(val ?? 0);
    return a.toFixed(4) === b.toFixed(4);
  }

  deltaVsPrev(supplierId: number | string | null, current: number | null | undefined) {
    const arr = this.getLast3CostsForSupplier(supplierId) || [];
    const prev = arr.length > 1 ? Number(arr[1].value ?? 0) : Number(arr[0]?.value ?? 0);
    const curr = Number(current ?? 0);
    const abs = curr - prev;
    const pct = prev !== 0 ? (abs / prev) * 100 : 0;
    const dir = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
    return {
      abs: Math.abs(abs),
      pct: Math.abs(pct),
      dir,
      tooltip: dir === 'flat' ? 'No change vs previous' :
        dir === 'up' ? 'Increased vs previous' :
          'Decreased vs previous'
    };
  }

  deltaColorStyle(delta: { dir: 'up' | 'down' | 'flat' }): any {
    if (delta.dir === 'up') return { 'border-color': '#fecaca', 'background': '#fff1f2', 'color': '#991b1b' };
    if (delta.dir === 'down') return { 'border-color': '#bbf7d0', 'background': '#f0fdf4', 'color': '#166534' };
    return { 'border-color': '#e5e7eb', 'background': '#f8fafc', 'color': '#64748b' };
  }
  toggleDetails(id: number) {
    this.expandedAudit[id] = !this.expandedAudit[id];
  }

  /** SUMMARY for changed fields row */
  fieldSummary(v: any): string {
    const obj = this.tryParseJson(v);
    if (Array.isArray(obj)) return `${obj.length} row${obj.length === 1 ? '' : 's'}`;
    if (obj && typeof obj === 'object') return 'Object';
    const s = (v ?? '').toString().trim();
    if (!s) return '-';
    return s.length > 28 ? s.slice(0, 28) + '…' : s;
  }

  /** hint like +1 row */
  fieldDeltaHint(before: any, after: any): string {
    const b = this.tryParseJson(before);
    const n = this.tryParseJson(after);
    if (Array.isArray(b) || Array.isArray(n)) {
      const bl = Array.isArray(b) ? b.length : 0;
      const nl = Array.isArray(n) ? n.length : 0;
      if (bl === nl) return 'updated';
      const d = nl - bl;
      return d > 0 ? `+${d} row${d === 1 ? '' : 's'}` : `${d} row${d === -1 ? '' : 's'}`;
    }
    return '';
  }

  isComplex(v: any) {
    const s = (v ?? '').toString().trim();
    return s.startsWith('{') || s.startsWith('[');
  }
  private auditRaw(a: any, tab: 'before' | 'after') {
    if (!a) return null;

    if (tab === 'before') {
      return a.oldValuesJson ?? a.OldValuesJson ?? a.oldValues ?? a.OldValues ?? a.beforeJson ?? a.BeforeJson ?? null;
    } else {
      return a.newValuesJson ?? a.NewValuesJson ?? a.newValues ?? a.NewValues ?? a.afterJson ?? a.AfterJson ?? null;
    }
  }

  /** open full snapshots */
  openSnapshot(a: any) {
    this.drawer.open = true;
    this.drawer.auditId = a.auditId;
    this.drawer.audit = a;
    this.drawer.mode = 'snapshot';
    this.drawer.field = '';
    this.drawer.title = 'Full snapshots';
    this.drawer.tab = 'before';
    this.drawer.data = this.getSnapFromAudit(a, 'before');
  }

  openField(a: any, field: string) {
    this.drawer.open = true;
    this.drawer.auditId = a.auditId;
    this.drawer.audit = a;
    this.drawer.mode = 'field';
    this.drawer.field = field;
    this.drawer.title = field;

    this.setDrawerTab('before'); // ✅ loads drawer.data using strict+loose logic
  }


  private getFieldSnapLoose(a: any, tab: 'before' | 'after', field: string): Snap {
    const raw = tab === 'after' ? a.newValuesJson : a.oldValuesJson;
    const obj = this.tryParseJson(raw);
    if (!obj || typeof obj !== 'object') return { kind: 'empty' };

    const keys = Object.keys(obj);
    const target = field?.toLowerCase()?.trim();

    // try exact
    let key = keys.find(k => k === field);

    // try case-insensitive
    if (!key) key = keys.find(k => k.toLowerCase().trim() === target);

    // try remove spaces/underscores
    if (!key) {
      const norm = (s: string) => s.toLowerCase().replace(/[\s_]/g, '');
      key = keys.find(k => norm(k) === norm(field));
    }

    if (!key) return { kind: 'empty' };

    const v = (obj as any)[key];
    if (v == null) return { kind: 'empty' };

    if (Array.isArray(v)) return this.toArraySnap(v);
    if (typeof v === 'object') return this.toObjectSnap(v);
    return this.toObjectSnap({ [key]: v });
  }
  setDrawerTab(tab: 'before' | 'after') {
    this.drawer.tab = tab;
    if (!this.drawer.audit) return;

    this.drawer.data = this.drawer.mode === 'snapshot'
      ? this.getSnapFromAudit(this.drawer.audit, tab)
      : (this.getFieldSnap(this.drawer.audit, tab, this.drawer.field).kind !== 'empty'
        ? this.getFieldSnap(this.drawer.audit, tab, this.drawer.field)
        : this.getFieldSnapLoose(this.drawer.audit, tab, this.drawer.field));
  }



  closeDrawer() {
    this.drawer.open = false;
  }



  private getSnapFromAudit(a: any, tab: 'before' | 'after'): Snap {
    const raw = tab === 'after' ? a.newValuesJson : a.oldValuesJson;
    const obj = this.tryParseJson(raw);
    if (obj == null) return { kind: 'empty' };
    if (Array.isArray(obj)) return this.toArraySnap(obj);
    if (typeof obj === 'object') return this.toObjectSnap(obj);
    return { kind: 'empty' };
  }

  private getFieldSnap(a: any, tab: 'before' | 'after', field: string): Snap {
    const raw = tab === 'after' ? a.newValuesJson : a.oldValuesJson;
    const obj = this.tryParseJson(raw);
    if (!obj || typeof obj !== 'object') return { kind: 'empty' };

    const v = (obj as any)[field];
    if (v == null) return { kind: 'empty' };

    if (Array.isArray(v)) return this.toArraySnap(v);
    if (typeof v === 'object') return this.toObjectSnap(v);
    return this.toObjectSnap({ [field]: v });
  }

  private tryParseJson(raw: any) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
  }

  private toObjectSnap(obj: any): Snap {
    const rows: { key: string; value: any }[] = [];
    const arrays: { key: string; columns: string[]; items: any[] }[] = [];

    Object.keys(obj).forEach(k => {
      const v = obj[k];
      if (Array.isArray(v)) {
        arrays.push(this.buildArrayBlock(k, v));
        rows.push({ key: k, value: `${v.length} row${v.length === 1 ? '' : 's'}` });
        return;
      }
      if (v && typeof v === 'object') {
        rows.push({ key: k, value: 'Object' });
        return;
      }
      rows.push({ key: k, value: v ?? '-' });
    });

    return { kind: 'object', rows, arrays };
  }

  private toArraySnap(arr: any[]): Snap {
    const block = this.buildArrayBlock('Rows', arr);
    return { kind: 'array', columns: block.columns, items: block.items };
  }

  private buildArrayBlock(key: string, arr: any[]) {
    const items = (arr || []).slice(0, 80).map(x => (x && typeof x === 'object') ? x : ({ Value: x }));
    const colSet = new Set<string>();
    items.slice(0, 10).forEach(r => Object.keys(r || {}).forEach(c => colSet.add(c)));
    const columns = Array.from(colSet);
    if (columns.length === 0) columns.push('Value');
    return { key, columns, items };
  }
  onFulfillmentUserOverride() {
    this.userOverrodeFulfillment = true;
  }

  onItemTypeChange() {
    if (this.userOverrodeFulfillment) return;

    const t = this.ItemTypeList.find((x: any) => Number(x.id) === Number(this.item.itemType));
    const name = (t?.itemTypeName || '').toLowerCase();

    // FulfillmentMode: 1 = Sellable (Direct DO), 2 = Consumable (PP), 3 = Both
    // default
    this.item.fulfillmentMode = 1; // Sellable → Direct DO

    if (name === 'finished good' || name === 'semi finished') {
      this.item.fulfillmentMode = 2; // produced via recipe → Consumable (PP)
    } else if (
      name === 'trading item' ||
      name === 'beverage / drink'
    ) {
      this.item.fulfillmentMode = 3; // sold and/or produced → Both (manual select allowed)
    }
    // Raw Material / Consumable → keep Sellable default unless category overrides
  }
  // -------- COPY/DOWNLOAD (DATA) --------

  copyAuditData(a: any) {
    const before = this.getSnapFromAudit(a, 'before');
    const after = this.getSnapFromAudit(a, 'after');
    const text = `--- BEFORE ---\n${this.exportSnap(before)}\n\n--- AFTER ---\n${this.exportSnap(after)}`;
    this.copyText(text, a.auditId);
  }

  downloadAuditData(a: any) {
    const before = this.getSnapFromAudit(a, 'before');
    const after = this.getSnapFromAudit(a, 'after');
    const text = `--- BEFORE ---\n${this.exportSnap(before)}\n\n--- AFTER ---\n${this.exportSnap(after)}`;
    this.downloadText(text, `audit-${a.auditId}-data.txt`);
  }

  private exportSnap(s: any): string {
    if (!s || s.kind === 'empty') return 'No data';
    if (s.kind === 'array') return `Rows(${s.items.length})`;
    // object
    return (s.rows || []).map((r: any) => `${r.key}: ${r.value}`).join('\n');
  }

  private copyText(text: string, auditId: number) {
    this.busy[auditId] = true;
    navigator.clipboard.writeText(text).then(() => {
      this.copied[auditId] = true;
      setTimeout(() => (this.copied[auditId] = false), 1000);
    }).finally(() => (this.busy[auditId] = false));
  }

  private downloadText(text: string, fileName: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
  compareById = (a: any, b: any) => {
    if (a == null || b == null) return a === b;
    return Number(a) === Number(b);
  };

  getById(list: any[], id: any) {
    if (!Array.isArray(list) || id === null || id === undefined) return null;
    return list.find(x => (x?.id ?? x?.value) == id) ?? null;
  }

  private findNameById(list: any[], id: any): string {
    const row = this.getById(list, id);
    return row?.name ?? row?.label ?? '';
  }

  // Call this whenever step goes to Review OR after data load
  buildReviewView() {
    this.itemStocksArr = Array.isArray(this.itemStocks) ? this.itemStocks : [];
    this.pricesArr = Array.isArray(this.prices) ? this.prices : [];

    this.costingName = this.findNameById(this.costingMethodList, this.item?.costingMethodId);
    this.taxName = this.findNameById(this.taxCodeList, this.item?.taxCodeId);
  }
  // Safe fallbacks (if your getWarehouseName/getBinName missing)
  getWarehouseNameSafe(id: any): string {
    try { return this.getWarehouseName?.(id) || '-'; } catch { return '-'; }
  }
  getBinNameSafe(id: any): string {
    try { return this.getBinName?.(id) || '-'; } catch { return '-'; }
  }

  trackByIdx = (i: number) => i;

 private round2(n: any) {
  const x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}
private round4(n: any) {
  const x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.round(x * 10000) / 10000;
}

onBomPctChange(i: number) {
  if (this.bomCalcLock) return;
  const r = this.bomRows?.[i];
  if (!r) return;

  const base = this.getBomBaseCost(r);
  const pct = Number(r.percentage ?? 0);

  this.bomCalcLock = true;
  try {
    r.sellingPrice = this.round2(base * (1 + pct / 100));
    this.recomputeBomTotalsInline();
  } finally {
    this.bomCalcLock = false;
  }
}
onBomSellingChange(i: number) {
  if (this.bomCalcLock) return;
  const r = this.bomRows?.[i];
  if (!r) return;

  const base = this.getBomBaseCost(r);
  const sell = Number(r.sellingPrice ?? 0);

  this.bomCalcLock = true;
  try {
    r.percentage = base > 0 ? this.round4(((sell - base) / base) * 100) : 0;
    this.recomputeBomTotalsInline();
  } finally {
    this.bomCalcLock = false;
  }
}
private getBomBaseCost(r: BomInlineRow): number {
  const ex = Number(r.existingCost ?? 0);
  if (ex > 0) return ex;

  const uc = Number(r.unitCost ?? 0);
  if (uc > 0) return uc;

  const hist = this.getLast3CostsForSupplier(r.supplierId);
  const last = Number(hist?.[0]?.value ?? 0);
  return last > 0 ? last : 0;
}
onBaseOrPurchaseUomChange(): void {
  if (this.item.uomId && this.item.baseUomId && Number(this.item.uomId) === Number(this.item.baseUomId)) {
    this.item.uomFactor = 1;
  }
}
getUomName(id: any): string {
  const u = this.uomList.find(x => String(x.id) === String(id));
  return u?.name ?? '-';
}
onCategoryChange(resetUsage: boolean = true) {
  const category = this.CategoryList.find(
    x => Number(x.id) === Number(this.item.categoryId)
  );

  if (!category) return;

  const categoryType = Number(category.itemCategoryType);

  // Don't overwrite a fulfillment the user picked manually.
  const keep = this.userOverrodeFulfillment;

  switch (categoryType) {
    case 1:
      this.allowedUsageTypes = [{ id: 1, name: 'Sales Item' }];
      if (!keep) this.item.fulfillmentMode = 1;
      break;

    case 2:
      this.allowedUsageTypes = [{ id: 2, name: 'Internal Use Item' }];
      if (!keep) this.item.fulfillmentMode = 2;
      break;

    case 3:
      this.allowedUsageTypes = [
        { id: 1, name: 'Sales Item' },
        { id: 2, name: 'Internal Use Item' },
        { id: 3, name: 'Sales & Internal Use' }
      ];

      if (resetUsage && !keep) {
        this.item.fulfillmentMode = 3;
      }
      break;
  }
}
}

