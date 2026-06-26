import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import Swal from 'sweetalert2';

interface RfqSupplier {
  supplierId: number | null;
  name: string;
  email: string;
  phone: string;
}

interface RfqItem {
  itemId: number | null;
  itemCode: string;
  itemName: string;
  uomId: number | null;
  uomName: string;
  quantity: number | null;
  remarks: string;
}

@Component({
  selector: 'erp-rfq-form',
  standalone: false,
  templateUrl: './rfq-form.component.html',
  styleUrls: ['./rfq-form.component.scss']
})
export class RfqFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  error = '';

  // Header fields
  rfqNumber = '';
  validUntil = '';
  sendVia = 'Email';
  remarks = '';
  status = 'Draft';

  // Suppliers list
  suppliers: RfqSupplier[] = [];

  // Items list
  items: RfqItem[] = [];

  // Dropdown options
  supplierOptions: any[] = [];
  itemOptions: any[] = [];
  uomOptions: any[] = [];

  sendViaOptions = [
    { label: 'Email',     value: 'Email' },
    { label: 'WhatsApp',  value: 'WhatsApp' },
    { label: 'Both',      value: 'Both' }
  ];

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    else { this.addItem(); }
    this.loadLookups();
  }

  loadLookups(): void {
    this.svc.getSuppliers().subscribe(r =>
      this.supplierOptions = this.svc.unwrap(r).map((s: any) => ({
        label: s.supplierName ?? s.name,
        value: s.id,
        raw: s
      })));
    this.svc.getItems().subscribe(r =>
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({
        label: `${i.itemCode ?? ''} - ${i.itemName ?? i.name}`,
        value: i.id,
        raw: i
      })));
    this.svc.getUOMs().subscribe(r =>
      this.uomOptions = this.svc.unwrap(r).map((u: any) => ({
        label: u.uomName ?? u.name,
        value: u.id,
        raw: u
      })));
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getRfqById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.rfqNumber = d.rfqNo ?? '';
        this.validUntil = d.validUntil ? (d.validUntil as string).substring(0, 10) : '';
        this.sendVia = d.sendVia ?? 'Email';
        this.status = d.status ?? 'Draft';

        try {
          const sups: any[] = JSON.parse(d.suppliersJson || '[]');
          this.suppliers = sups.map(s => ({
            supplierId: null,
            name: s.name ?? '',
            email: s.email ?? '',
            phone: s.phone ?? ''
          }));
        } catch { this.suppliers = []; }

        try {
          const its: any[] = JSON.parse(d.itemsJson || '[]');
          this.items = its.map(i => ({
            itemId: null,
            itemCode: i.itemCode ?? '',
            itemName: i.item ?? i.itemName ?? '',
            uomId: null,
            uomName: i.uom ?? '',
            quantity: i.qty ?? i.quantity ?? null,
            remarks: i.remarks ?? ''
          }));
        } catch { this.items = []; }

        if (!this.items.length) this.addItem();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  addSupplier(): void {
    this.suppliers.push({ supplierId: null, name: '', email: '', phone: '' });
  }

  removeSupplier(i: number): void { this.suppliers.splice(i, 1); }

  onSupplierSelect(sup: RfqSupplier): void {
    const found = this.supplierOptions.find(o => o.value === sup.supplierId);
    if (found?.raw) {
      sup.name  = found.raw.supplierName ?? found.raw.name ?? sup.name;
      sup.email = found.raw.email ?? found.raw.supplierEmail ?? '';
      sup.phone = found.raw.phone ?? found.raw.contactNo ?? found.raw.mobile ?? '';
    }
  }

  addItem(): void {
    this.items.push({ itemId: null, itemCode: '', itemName: '', uomId: null, uomName: '', quantity: null, remarks: '' });
  }

  removeItem(i: number): void { this.items.splice(i, 1); }

  onItemSelect(item: RfqItem): void {
    const found = this.itemOptions.find(o => o.value === item.itemId);
    if (found?.raw) {
      item.itemCode = found.raw.itemCode ?? '';
      item.itemName = found.raw.itemName ?? found.raw.name ?? '';
      if (found.raw.uomId) {
        item.uomId = found.raw.uomId;
        const uom = this.uomOptions.find(u => u.value === found.raw.uomId);
        item.uomName = uom?.label ?? '';
      }
    }
  }

  onUomSelect(item: RfqItem): void {
    const found = this.uomOptions.find(u => u.value === item.uomId);
    item.uomName = found?.raw?.uomName ?? found?.label ?? '';
  }

  save(): void {
    if (!this.suppliers.length || this.suppliers.every(s => !s.name.trim())) {
      this.error = 'Add at least one supplier.'; return;
    }
    if (!this.validUntil) { this.error = 'Set a Valid Until date.'; return; }
    if (!this.items.length || this.items.some(i => !i.itemName.trim() || !i.quantity)) {
      this.error = 'Each item needs a name and quantity.'; return;
    }

    this.saving = true;
    this.error = '';

    const payload = {
      RfqNo: this.rfqNumber || '',
      ValidUntil: this.validUntil,
      SendVia: this.sendVia,
      Status: this.status,
      SuppliersJson: JSON.stringify(
        this.suppliers
          .filter(s => s.name.trim())
          .map(s => ({ name: s.name.trim(), email: s.email.trim(), phone: s.phone.trim() }))
      ),
      ItemsJson: JSON.stringify(
        this.items.map(i => ({
          item: i.itemName.trim(),
          itemCode: i.itemCode.trim(),
          qty: i.quantity ?? 0,
          uom: i.uomName,
          remarks: i.remarks.trim()
        }))
      ),
      QuotePricesJson: '{}',
      WinnerLinesJson: '[]',
      Total: 0
    };

    const obs$ = this.isEdit
      ? this.svc.updateRfq(this.id!, payload)
      : this.svc.createRfq(payload);

    obs$.subscribe({
      next: res => {
        this.saving = false;
        const d = this.svc.unwrapOne(res);
        if (!this.isEdit && d?.id) {
          this.id = d.id;
          this.isEdit = true;
          this.rfqNumber = d.rfqNo ?? this.rfqNumber;
        }
        Swal.fire({ icon: 'success', title: 'Saved!', text: 'RFQ saved successfully.', confirmButtonColor: '#16a34a' });
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message ?? 'Save failed.';
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? 'Save failed.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  submit(): void { this.status = 'Submitted'; this.save(); }

  back(): void { this.router.navigate(['/app/purchase/rfq']); }
  get today(): string { return new Date().toISOString().substring(0, 10); }
  get title(): string { return this.isEdit ? `Edit RFQ${this.rfqNumber ? ' – ' + this.rfqNumber : ''}` : 'New Request for Quotation'; }
}
