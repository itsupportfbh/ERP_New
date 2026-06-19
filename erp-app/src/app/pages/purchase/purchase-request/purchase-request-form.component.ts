import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';

interface PRLine {
  itemId: number | null;
  itemCode: string;
  itemName: string;
  quantity: number | null;
  uomId: number | null;
  uomName: string;
  locationId: number | null;
  locationName: string;
  budgetLineId: number | null;
  budgetLineName: string;
  remarks: string;
}

@Component({
  selector: 'erp-purchase-request-form',
  standalone: false,
  templateUrl: './purchase-request-form.component.html',
  styleUrls: ['./purchase-request-form.component.scss']
})
export class PurchaseRequestFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  step = 1;
  loading = false;
  saving = false;
  error = '';

  // Header
  requester = localStorage.getItem('username') || '';
  departmentId: number | null = null;
  deliveryDate = '';
  description = '';

  // Lines
  lines: PRLine[] = [];

  // Status (view-only for existing)
  status = 'Pending';

  // Dropdowns
  departmentOptions: any[] = [];
  itemOptions: any[] = [];
  uomOptions: any[] = [];
  locationOptions: any[] = [];
  ledgerOptions: any[] = [];

  loginUserId = Number(localStorage.getItem('id')) || null;
  companyId = Number(localStorage.getItem('companyId')) || null;

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    this.loadLookups();
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
  }

  loadLookups(): void {
    const storedRaw = localStorage.getItem('departmentId');
    const storedDeptId = storedRaw && storedRaw !== 'null' && storedRaw !== 'undefined'
      ? parseInt(storedRaw, 10)
      : 0;
    const userId = Number(localStorage.getItem('id')) || 0;

    this.svc.getDepartments().subscribe({
      next: r => {
        this.departmentOptions = this.svc.unwrap(r).map((d: any) => ({
          label: d.departmentName ?? d.departmentCode ?? d.name,
          value: d.id
        }));

        if (this.isEdit) return;

        if (storedDeptId > 0) {
          // localStorage already has a valid department (post-fix login)
          this.departmentId = storedDeptId;
        } else if (userId > 0) {
          // Fallback: fetch from User profile API (works before re-login too)
          this.svc.getCurrentUserProfile(userId).subscribe({
            next: (profile: any) => {
              const deptId = profile?.departmentId ?? profile?.DepartmentId ?? 0;
              if (deptId > 0) this.departmentId = deptId;
            },
            error: () => {}
          });
        }
      },
      error: () => {}
    });
    this.svc.getItems().subscribe(r => {
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({
        label: `${i.itemCode ?? ''} - ${i.itemName ?? i.name}`,
        value: i.id,
        raw: i
      }));
    });
    this.svc.getUOMs().subscribe(r => {
      this.uomOptions = this.svc.unwrap(r).map((u: any) => ({
        label: u.name ?? u.uomName,
        value: u.id
      }));
    });
    this.svc.getLocations().subscribe(r => {
      this.locationOptions = this.svc.unwrap(r).map((l: any) => ({
        label: l.name ?? l.locationName,
        value: l.id
      }));
    });
    this.svc.getChartOfAccounts().subscribe(r => {
      this.ledgerOptions = this.svc.unwrap(r).map((c: any) => ({
        label: `${c.headCode ?? ''} ${c.headName ?? c.accountName ?? ''}`.trim(),
        value: c.id
      }));
    });
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getPurchaseRequestById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.requester = d.requester ?? d.Requester ?? '';
        this.departmentId = d.departmentID ?? d.departmentId ?? null;
        this.deliveryDate = d.deliveryDate ?? d.DeliveryDate
          ? (d.deliveryDate ?? d.DeliveryDate).substring(0, 10)
          : '';
        this.description = d.description ?? d.Description ?? '';
        this.status = d.status === 1 ? 'Pending' : d.status === 2 ? 'Approved' : 'Pending';

        // PRLines is stored as a JSON string in the DB
        const rawLines = d.pRLines ?? d.prLines ?? d.PRLines ?? '[]';
        const parsed: any[] = typeof rawLines === 'string'
          ? JSON.parse(rawLines || '[]')
          : (Array.isArray(rawLines) ? rawLines : []);

        this.lines = parsed.map((l: any) => ({
          itemId: l.itemId ?? null,
          itemCode: l.itemCode ?? '',
          itemName: l.itemSearch ?? l.itemName ?? '',
          quantity: l.qty ?? l.quantity ?? null,
          uomId: l.uomId ?? null,
          uomName: l.uom ?? l.uomSearch ?? '',
          locationId: l.locationId ?? null,
          locationName: l.location ?? l.locationSearch ?? '',
          budgetLineId: l.budgetLineId ?? null,
          budgetLineName: l.budget ?? '',
          remarks: l.remarks ?? ''
        }));

        if (!this.lines.length) this.addLine();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  addLine(): void {
    this.lines.push({
      itemId: null, itemCode: '', itemName: '',
      quantity: null,
      uomId: null, uomName: '',
      locationId: null, locationName: '',
      budgetLineId: null, budgetLineName: '',
      remarks: ''
    });
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  onItemSelect(line: PRLine): void {
    const found = this.itemOptions.find(o => o.value === line.itemId);
    if (found) {
      line.itemCode = found.raw?.itemCode ?? '';
      line.itemName = found.raw?.itemName ?? found.label;
      if (found.raw?.uomId) {
        line.uomId = found.raw.uomId;
        const uomOpt = this.uomOptions.find(u => u.value === found.raw.uomId);
        line.uomName = uomOpt?.label ?? found.raw?.uomName ?? '';
      }
      if (found.raw?.budgetLineId) {
        line.budgetLineId = found.raw.budgetLineId;
        const ledgerOpt = this.ledgerOptions.find(l => l.value === found.raw.budgetLineId);
        line.budgetLineName = ledgerOpt?.label ?? found.raw?.budgetLineName ?? '';
      }
    }
  }

  onUomSelect(line: PRLine): void {
    const found = this.uomOptions.find(o => o.value === line.uomId);
    if (found) line.uomName = found.label;
  }

  onLocationSelect(line: PRLine): void {
    const found = this.locationOptions.find(o => o.value === line.locationId);
    if (found) line.locationName = found.label;
  }

  onLedgerSelect(line: PRLine): void {
    const found = this.ledgerOptions.find(o => o.value === line.budgetLineId);
    if (found) line.budgetLineName = found.label;
  }

  next(): void {
    if (this.step === 1) {
      if (!this.departmentId) { this.error = 'Please select a Department.'; return; }
      if (!this.deliveryDate) { this.error = 'Please set a Delivery Date.'; return; }
      this.error = '';
      if (!this.lines.length) this.addLine();
      this.step = 2;
    } else if (this.step === 2) {
      const invalid = this.lines.some(l => !l.itemId || !l.quantity || (l.quantity ?? 0) <= 0);
      if (invalid) { this.error = 'Each line needs an Item and Quantity > 0.'; return; }
      this.error = '';
      this.step = 3;
    }
  }

  prev(): void { this.step = Math.max(1, this.step - 1); this.error = ''; }

  submit(): void {
    this.saving = true;
    this.error = '';

    // Build PRLines JSON string in the format the backend expects
    const prLinesData = this.lines.map(l => ({
      itemId: l.itemId,
      itemCode: l.itemCode,
      itemSearch: l.itemName,
      qty: l.quantity,
      uomId: l.uomId,
      uomSearch: l.uomName,
      uom: l.uomName,
      locationId: l.locationId,
      locationSearch: l.locationName,
      location: l.locationName,
      budgetLineId: l.budgetLineId,
      budget: l.budgetLineName,
      remarks: l.remarks
    }));

    const payload = {
      Requester: this.requester,
      DepartmentID: this.departmentId,
      DeliveryDate: this.deliveryDate,
      Description: this.description,
      PRLines: JSON.stringify(prLinesData),
      PurchaseRequestNo: 'PENDING',   // backend overwrites with auto-generated PR-XXXX
      IsActive: true,
      Status: 1,
      IsReorder: false,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0
    };

    const obs$ = this.isEdit
      ? this.svc.updatePurchaseRequest(this.id!, payload)
      : this.svc.createPurchaseRequest(payload);

    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message ?? 'Save failed. Please try again.';
      }
    });
  }

  back(): void { this.router.navigate(['/app/purchase/requests']); }

  getLabel(opts: any[], val: any): string {
    return opts.find(o => o.value === val)?.label ?? '—';
  }

  get title(): string { return this.isEdit ? `Edit PR` : 'New Purchase Request'; }
  get today(): string { return new Date().toISOString().substring(0, 10); }
}
