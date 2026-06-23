import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';

import { ItemMasterService } from '../../item-master/item-master.service';
import { WarehouseService } from 'app/main/master/warehouse/warehouse.service';
import { MaterialRequisitionService } from '../material-requisition.service';

type UomOption = {
  uomId: number;
  uomName: string;
  factor: number;
};

type ItemMaster = {
  id: number;
  name: string;
  sku: string;
  displayName: string;

  uomId: number | null;
  uomName: string;

  baseUomId: number | null;
  baseUom: string;

  uomFactor: number;
};

type MrqHeader = {
  OutletId: number | null;
  BinId: number | null;
  requesterName: string;
  date: string;
};

type MrqLine = {
  id: number;
  itemId: number | null;
  sku: string;

  baseUomId: number | null;
  baseUom: string;

  enterUomId: number | null;
  enterUomName: string;

  qty: number | null;
  conversionFactor: number;
  baseQty: number;

  uomOptions: UomOption[];
};

type BinDto = {
  id: number;
  binName: string;
};

@Component({
  standalone: false,
  selector: 'app-material-requisition-create',
  templateUrl: './material-requisition-create.component.html',
  styleUrls: ['./material-requisition-create.component.scss']
})
export class MaterialRequisitionCreateComponent implements OnInit {
  OutletList: any[] = [];
  items: ItemMaster[] = [];
  binList: BinDto[] = [];

  header: MrqHeader = {
    OutletId: null,
    BinId: null,
    requesterName: '',
    date: this.todayISO()
  };

  lines: MrqLine[] = [this.emptyRow()];

  isSaving = false;
  isEdit = false;
  editId: number | null = null;
  userId: any;

  constructor(
    private itemMasterService: ItemMasterService,
    private outletService: WarehouseService,
    private mrqService: MaterialRequisitionService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.userId = localStorage.getItem('id');
  }

ngOnInit(): void {
  this.header.requesterName = String(localStorage.getItem('username') ?? '');

  const idParam = this.route.snapshot.paramMap.get('id');
  this.editId = idParam ? Number(idParam) : null;
  this.isEdit = !!this.editId;

  this.loadItem(() => {
    if (this.isEdit && this.editId) {
      this.loadById(this.editId);
    }
  });

  this.loadOutlets();
}

private getErrorMessage(err: any, fallback: string): string {
  return err?.error?.message || err?.message || fallback;
}

loadItem(done?: () => void): void {
  this.itemMasterService.getAllItemMaster().subscribe({
    next: (res: any) => {
      const data = res?.data ?? [];

      this.items = (data || []).map((x: any) => {
        const name = String(x.itemName ?? '');
        const sku  = String(x.itemCode ?? '');
        return {
          id: Number(x.id),
          name,
          sku,
          displayName: sku ? `${name} - ${sku}` : name,

          uomId: x.uomId != null ? Number(x.uomId) : null,
          uomName: String(x.uomName ?? ''),

          baseUomId: x.baseUomId != null ? Number(x.baseUomId) : null,
          baseUom: String(x.baseUomName ?? ''),

          uomFactor: Number(x.uomFactor ?? 1)
        };
      });

      this.items.sort((a, b) => a.name.localeCompare(b.name));
      done?.();
    },
    error: (err) => {
      this.items = [];
      Swal.fire('Error', this.getErrorMessage(err, 'Failed to load items'), 'error');
      done?.();
    }
  });
}

loadOutlets(): void {
  this.outletService.getWarehouse().subscribe({
    next: (res: any) => {
      this.OutletList = Array.isArray(res) ? res : (res?.data ?? []);

      // Edit mode skip
      if (this.isEdit) {
        return;
      }

      const locationId = this.getLocalLocationId();

      if (!locationId) {
        return;
      }

      // Find warehouse mapped to location
      const warehouse = this.OutletList.find(
        (x: any) =>
          Number(x.locationId ?? x.LocationId ?? x.locationID ?? 0) === locationId
      );

      if (warehouse) {
        this.header.OutletId = Number(warehouse.id);

        // Auto load bins
        this.loadBinsByOutlet(this.header.OutletId);
      }
    },
    error: (err) => {
      this.OutletList = [];
      this.header.OutletId = null;
      this.header.BinId = null;
      this.binList = [];
      Swal.fire('Error', this.getErrorMessage(err, 'Failed to load warehouses'), 'error');
    }
  });
}

  onOutletChanged(): void {
    const outletId = this.header.OutletId != null ? Number(this.header.OutletId) : null;

    this.header.BinId = null;
    this.binList = [];

    if (!outletId) return;

    this.loadBinsByOutlet(outletId);
  }

loadBinsByOutlet(
  outletId: number,
  keepSelectedBinId: number | null = null
): void {
  this.outletService.getBinNameByIdAsync(outletId).subscribe({
    next: (res: any) => {
      const data = Array.isArray(res) ? res : (res?.data ?? []);

      this.binList = (data || [])
        .map((b: any) => ({
          id: Number(b.binID ?? b.binId ?? b.id ?? 0),
          binName: String(b.binName ?? b.name ?? '')
        }))
        .filter((x: BinDto) => x.id > 0 && !!x.binName)
        .sort((a: BinDto, b: BinDto) =>
          a.binName.localeCompare(b.binName)
        );

      // Edit mode existing bin
      if (
        keepSelectedBinId &&
        this.binList.some(x => x.id === keepSelectedBinId)
      ) {
        this.header.BinId = keepSelectedBinId;
        return;
      }

      // Create mode auto select first bin
if (!this.isEdit) {
  this.header.BinId = null;
}
    },
    error: (err) => {
      this.binList = [];
      this.header.BinId = null;
      Swal.fire('Error', this.getErrorMessage(err, 'Failed to load bins'), 'error');
    }
  });
}

  loadById(id: number): void {
    Swal.fire({
      title: 'Loading...',
      text: 'Please wait',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.mrqService.GetMaterialRequestById(id).subscribe({
      next: (res: any) => {
        Swal.close();

        const x = res?.data ?? res;
        if (!x) {
          Swal.fire({ icon: 'warning', title: 'Not Found', text: 'Record not found', confirmButtonColor: '#16a34a' });
          this.router.navigate(['/app/inventory/list-material-requisition']);
          return;
        }

        this.header.OutletId = x.outletId != null ? Number(x.outletId) : null;

        const binId = x.binId ?? x.binID ?? null;
        this.header.BinId = binId != null ? Number(binId) : null;

        this.header.requesterName = String(x.requesterName ?? this.header.requesterName ?? '');
        this.header.date = this.toISODate(x.reqDate) || this.todayISO();

        if (this.header.OutletId) {
          this.loadBinsByOutlet(Number(this.header.OutletId), this.header.BinId);
        }

        const apiLines = (x.lines ?? x.lineItems ?? []) as any[];

        if (!apiLines.length) {
          this.lines = [this.emptyRow()];
          return;
        }

        this.lines = apiLines.map((l: any) => {
          const itemId = l.itemId != null ? Number(l.itemId) : null;
          const item = this.items.find(it => it.id === itemId);

          const row: MrqLine = {
            id: Number(l.id ?? 0),
            itemId,
            sku: String(l.itemCode ?? item?.sku ?? ''),

            baseUomId: l.baseUomId != null
              ? Number(l.baseUomId)
              : item?.baseUomId ?? null,

            baseUom: String(l.baseUomName ?? item?.baseUom ?? ''),

            enterUomId: l.uomId != null
              ? Number(l.uomId)
              : item?.baseUomId ?? null,

            enterUomName: String(l.uomName ?? item?.baseUom ?? ''),

            qty: l.qty != null ? Number(l.qty) : null,
            conversionFactor: l.conversionFactor != null ? Number(l.conversionFactor) : 1,
            baseQty: l.baseQty != null ? Number(l.baseQty) : 0,

            uomOptions: item ? this.buildUomOptions(item) : []
          };

          if (!row.baseQty) {
            row.baseQty = Number(((row.qty ?? 0) * row.conversionFactor).toFixed(4));
          }

          return row;
        });

        if (this.lines.length === 0) {
          this.lines = [this.emptyRow()];
        }
      },
      error: (err) => {
        Swal.close();
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load MRQ'), 'error');
        this.router.navigate(['/app/inventory/list-material-requisition']);
      }
    });
  }

  addRow(): void {
    this.lines.push(this.emptyRow());
  }

  removeRow(index: number): void {
    if (this.lines.length === 1) return;
    this.lines.splice(index, 1);
  }

  onItemChanged(rowIndex: number): void {
    const row = this.lines[rowIndex];
    const selectedId = row.itemId != null ? Number(row.itemId) : null;
    const item = this.items.find(x => x.id === selectedId);

    if (!item) {
      this.lines[rowIndex] = this.emptyRow();
      return;
    }

    row.sku = item.sku;

    row.baseUomId = item.baseUomId;
    row.baseUom = item.baseUom;

    row.uomOptions = this.buildUomOptions(item);

    const defaultUom =
      row.uomOptions.find(x => x.uomId === item.baseUomId) ||
      row.uomOptions[0];

    row.enterUomId = defaultUom?.uomId ?? null;
    row.enterUomName = defaultUom?.uomName ?? '';
    row.conversionFactor = defaultUom?.factor ?? 1;

    this.calculateLine(rowIndex);
  }

  onUomChanged(rowIndex: number): void {
    const row = this.lines[rowIndex];
    const selected = row.uomOptions.find(x => x.uomId === Number(row.enterUomId));

    row.enterUomName = selected?.uomName ?? '';
    row.conversionFactor = Number(selected?.factor ?? 1);

    this.calculateLine(rowIndex);
  }

  calculateLine(rowIndex: number): void {
    const row = this.lines[rowIndex];

    const qty = Number(row.qty ?? 0);
    const factor = Number(row.conversionFactor ?? 1);

    row.baseQty = Number((qty * factor).toFixed(4));
  }

private buildUomOptions(item: ItemMaster): UomOption[] {
  const list: UomOption[] = [];

  // Enter UOM
  if (item.uomId && item.uomName) {
    list.push({
      uomId: item.uomId,
      uomName: item.uomName,
      factor: item.uomFactor || 1
    });
  }

  // Base UOM
  if (item.baseUomId && item.baseUom) {
    list.push({
      uomId: item.baseUomId,
      uomName: item.baseUom,
      factor: 1
    });
  }

  return list.filter(
    (x, index, arr) => arr.findIndex(y => y.uomId === x.uomId) === index
  );
}

searchFn = (term: string, item: ItemMaster) => {
  term = (term || '').toLowerCase().trim();

  if (!term) return true;

  return (
    (item.name || '').toLowerCase().includes(term) ||
    (item.sku || '').toLowerCase().includes(term) ||
    (item.uomName || '').toLowerCase().includes(term) ||
    (item.baseUom || '').toLowerCase().includes(term)
  );
};

  save(): void {
    if (this.isSaving) return;

    if (!this.header.OutletId) {
      Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please select Warehouse', confirmButtonColor: '#16a34a' });
      return;
    }

    if (!this.header.BinId) {
      Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please select Bin', confirmButtonColor: '#16a34a' });
      return;
    }

    const requester = (this.header.requesterName ?? '').trim();

    if (!requester) {
      Swal.fire({ icon: 'warning', title: 'Validation', text: 'Requester name missing', confirmButtonColor: '#16a34a' });
      return;
    }

    const validLines = this.lines
      .filter(l => l.itemId && (l.qty ?? 0) > 0)
      .map(l => {
        const item = this.items.find(x => x.id === Number(l.itemId));

        return {
          id: Number(l.id ?? 0),
          itemId: Number(l.itemId),
          itemCode: item?.sku ?? l.sku ?? '',
          itemName: item?.name ?? '',

          uomId: l.enterUomId,
          uomName: l.enterUomName,

          baseUomId: l.baseUomId,
          baseUomName: l.baseUom,

      qty: Number(l.qty),
conversionFactor: Number(l.conversionFactor || 1),
baseQty: Number((Number(l.qty || 0) * Number(l.conversionFactor || 1)).toFixed(4)),
receivedQty: 0
        };
      });

    if (validLines.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please add at least 1 item with Qty', confirmButtonColor: '#16a34a' });
      return;
    }

    const invalidUom = validLines.some(x => !x.uomId || !x.baseUomId);

    if (invalidUom) {
      Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please check UOM for all selected items', confirmButtonColor: '#16a34a' });
      return;
    }

    const payload: any = {
      id: this.isEdit ? Number(this.editId) : 0,
      outletId: Number(this.header.OutletId),
      binId: Number(this.header.BinId),
      requesterName: requester,
      reqDate: this.header.date,
      status: 1,
      remarks: null,
      updatedBy: this.userId,
      createdBy: this.userId,
      isActive: true,
      lines: validLines
    };

    this.isSaving = true;

    Swal.fire({
      title: this.isEdit ? 'Updating...' : 'Saving...',
      text: 'Please wait',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const api$ = this.isEdit && this.editId
      ? this.mrqService.UpdateMaterialRequestById(this.editId, payload)
      : this.mrqService.CreateMaterialRequest(payload);

    api$.subscribe({
      next: (res: any) => {
        this.isSaving = false;

        if (res?.isSuccess === false) {
          Swal.fire('Material Requisition', res?.message ?? 'Save failed', 'error');
          return;
        }

        const reqNo = res?.data?.reqNo || res?.data?.ReqNo || res?.reqNo;

        Swal.fire(
          'Material Requisition',
          reqNo
            ? `${this.isEdit ? 'Updated' : 'Saved'} Successfully<br><b>${reqNo}</b>`
            : res?.message ?? (this.isEdit ? 'Updated successfully' : 'Saved successfully'),
          'success'
        );

        this.router.navigate(['/app/inventory/list-material-requisition']);
      },
      error: (err) => {
        this.isSaving = false;

        Swal.fire(
          'Server Error',
          this.getErrorMessage(err, 'Server error while saving'),
          'error'
        );
      }
    });
  }

  close(): void {
    this.router.navigate(['/app/inventory/list-material-requisition']);
  }


  private getLocalLocationId(): number | null {
  const val =
    localStorage.getItem('locationId') ||
    localStorage.getItem('LocationId') ||
    localStorage.getItem('locationID');

  const id = Number(val ?? 0);

  return id > 0 ? id : null;
}

  private emptyRow(): MrqLine {
    return {
      id: 0,
      itemId: null,
      sku: '',

      baseUomId: null,
      baseUom: '',

      enterUomId: null,
      enterUomName: '',

      qty: null,
      conversionFactor: 1,
      baseQty: 0,

      uomOptions: []
    };
  }

  private todayISO(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private toISODate(dt: any): string {
    if (!dt) return '';

    if (typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dt)) {
      return dt.slice(0, 10);
    }

    const d = new Date(dt);

    if (isNaN(d.getTime())) return '';

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  }
}

