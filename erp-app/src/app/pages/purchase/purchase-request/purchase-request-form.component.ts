import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import Swal from 'sweetalert2';

interface PRLine {
  itemId: number | null;
  itemCode: string;
  itemSearch: string;
  qty: number | null;
  uomId: number | null;
  uom: string;
  uomSearch: string;
  locationId: number | null;
  location: string;
  locationSearch: string;
  budgetLineId: number | null;
  budget: string;
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
  // draftId: number | null = null; // DRAFT DISABLED
  prStep = 0;
  prSteps = ['Header', 'Lines', 'Review'];
  loading = false;
  saving = false;
  approving = false;
  error = '';

  // Header
  requester = localStorage.getItem('username') || '';
  departmentId: number | null = null;
  departmentName = '';
  deliveryDate = '';
  description = '';
  status = 'Pending';
  numericStatus = 1;

  // Lines (committed)
  prLines: PRLine[] = [];

  // Modal state
  showModal = false;
  editingIndex: number | null = null;
  modalLine: PRLine = this.emptyLine();

  // Dropdown options
  departmentOptions: any[] = [];
  itemOptions: any[] = [];
  uomOptions: any[] = [];
  locationOptions: any[] = [];

  loginUserId = Number(localStorage.getItem('id')) || 0;

  // ── Source tracking (auto-PR from SO / Recipe) ────────────
  sourceId: number | null = null;
  sourceReferenceId: number | null = null;
  sourceType: 'SO' | 'RECIPE' | 'MANUAL' = 'MANUAL';
  sourceName = '';

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId  = this.route.snapshot.paramMap.get('id');
    // const draftParam = this.route.snapshot.queryParamMap.get('draftId'); // DRAFT DISABLED
    const fromSo   = this.route.snapshot.queryParamMap.get('fromSo');
    const fromRecipe = this.route.snapshot.queryParamMap.get('fromRecipe');
    const refId    = this.route.snapshot.queryParamMap.get('refId');

    this.isEdit = !!paramId && paramId !== 'new';

    // Populate source fields from query params
    if (fromSo) {
      this.sourceId = Number(fromSo);
      this.sourceType = 'SO';
      this.sourceName = `Sales Order #${fromSo}`;
      this.description = `Auto PR from Sales Order #${fromSo}`;
    } else if (fromRecipe) {
      this.sourceId = Number(fromRecipe);
      this.sourceReferenceId = refId ? Number(refId) : null;
      this.sourceType = 'RECIPE';
      this.sourceName = `Production Plan #${fromRecipe}${refId ? ' / SO #' + refId : ''}`;
      this.description = `Auto PR from Production Plan #${fromRecipe}`;
    }

    this.loadLookups();
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    // else if (draftParam) { this.draftId = Number(draftParam); this.loadFromDraft(); } // DRAFT DISABLED
  }

  private emptyLine(): PRLine {
    return {
      itemId: null, itemCode: '', itemSearch: '',
      qty: null,
      uomId: null, uom: '', uomSearch: '',
      locationId: null, location: '', locationSearch: '',
      budgetLineId: null, budget: '',
      remarks: ''
    };
  }

  loadLookups(): void {
    this.svc.getDepartments().subscribe({
      next: r => {
        const depts = this.svc.unwrap(r);
        this.departmentOptions = depts.map((d: any) => ({
          label: d.departmentName ?? d.name ?? '',
          value: d.id,
          raw: d
        }));
        if (!this.isEdit) {
          this.autoBindDepartment(depts);
        }
      },
      error: () => {}
    });

    this.svc.getItems().subscribe((r: any) => {
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({
        label: `${i.itemCode ?? ''} - ${i.itemName ?? i.name ?? ''}`,
        value: i.id,
        raw: i
      }));
    });

    this.svc.getUOMs().subscribe(r => {
      this.uomOptions = this.svc.unwrap(r).map((u: any) => ({
        label: u.name ?? u.uomName ?? '',
        value: u.id,
        raw: u
      }));
    });

    this.svc.getLocations().subscribe(r => {
      this.locationOptions = this.svc.unwrap(r).map((l: any) => ({
        label: l.name ?? l.locationName ?? '',
        value: l.id,
        raw: l
      }));
    });
  }

  private autoBindDepartment(depts: any[]): void {
    const storedId = Number(localStorage.getItem('departmentId') || 0);
    if (storedId > 0) {
      const opt = this.departmentOptions.find(o => Number(o.value) === storedId);
      if (opt) { this.departmentId = storedId; this.departmentName = opt.label; return; }
    }
    if (depts.length > 0) {
      const first = depts[0];
      this.departmentId = Number(first.id);
      this.departmentName = first.departmentName ?? first.name ?? '';
      const opt = this.departmentOptions.find(o => Number(o.value) === this.departmentId);
      if (opt) this.departmentId = opt.value;
    }
  }

  private parseLines(raw: any): PRLine[] {
    const parsed: any[] = typeof raw === 'string'
      ? JSON.parse(raw || '[]')
      : (Array.isArray(raw) ? raw : []);
    return parsed.map((l: any) => ({
      itemId: l.itemId ?? null,
      itemCode: l.itemCode ?? '',
      itemSearch: l.itemSearch ?? l.itemName ?? '',
      qty: l.qty ?? l.quantity ?? null,
      uomId: l.uomId ?? null,
      uom: l.uom ?? l.uomSearch ?? '',
      uomSearch: l.uomSearch ?? l.uom ?? '',
      locationId: l.locationId ?? null,
      location: l.location ?? l.locationSearch ?? '',
      locationSearch: l.locationSearch ?? l.location ?? '',
      budgetLineId: l.budgetLineId ?? null,
      budget: l.budget ?? '',
      remarks: l.remarks ?? ''
    }));
  }

  private resolveDeptName(): void {
    if (!this.departmentId) return;
    const opt = this.departmentOptions.find(o => Number(o.value) === Number(this.departmentId));
    if (opt) { this.departmentName = opt.label; return; }
    this.svc.getDepartments().subscribe(r => {
      const all = this.svc.unwrap(r);
      const found = all.find((d: any) => Number(d.id) === Number(this.departmentId));
      this.departmentName = found?.departmentName ?? found?.name ?? '';
    });
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getPurchaseRequestById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.requester = d.requester ?? d.Requester ?? '';
        this.departmentId = d.departmentID ?? d.departmentId ?? null;
        this.deliveryDate = (d.deliveryDate ?? d.DeliveryDate ?? '').substring(0, 10);
        this.description = d.description ?? d.Description ?? '';
        this.numericStatus = d.status ?? d.approvalStatus ?? 1;
        this.status = this.numericStatus === 2 ? 'Approved' : this.numericStatus === 3 ? 'Rejected' : this.numericStatus === 0 ? 'Draft' : 'Pending';
        this.prLines = this.parseLines(d.pRLines ?? d.prLines ?? d.PRLines ?? '[]');
        // restore source tracking from saved record
        this.sourceId = d.sourceId ?? d.SourceId ?? null;
        this.sourceReferenceId = d.sourceReferenceId ?? d.SourceReferenceId ?? null;
        const st = (d.sourceType ?? d.SourceType ?? '') as string;
        this.sourceType = st === 'SO' ? 'SO' : st === 'RECIPE' ? 'RECIPE' : 'MANUAL';
        if (this.sourceType === 'SO' && this.sourceId) this.sourceName = `Sales Order #${this.sourceId}`;
        else if (this.sourceType === 'RECIPE' && this.sourceId) this.sourceName = `Production Plan #${this.sourceId}${this.sourceReferenceId ? ' / SO #' + this.sourceReferenceId : ''}`;
        this.resolveDeptName();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  approveReject(newStatus: 2 | 3): void {
    const action = newStatus === 2 ? 'Approve' : 'Reject';
    Swal.fire({ title: `${action} PR?`, text: `${action} this purchase request?`, icon: 'question', showCancelButton: true, confirmButtonText: action, confirmButtonColor: newStatus === 2 ? '#22c55e' : '#ef4444' })
      .then(r => { if (!r.isConfirmed) return;
        this.approving = true;
        const amount = 0;
        const req$ = newStatus === 2 ? this.svc.approvePurchaseRequest(this.id!, amount) : this.svc.rejectPurchaseRequest(this.id!, amount);
        req$.subscribe({
          next: () => {
            this.approving = false;
            this.numericStatus = newStatus;
            this.status = newStatus === 2 ? 'Approved' : 'Rejected';
            Swal.fire('Success', `Purchase request ${action.toLowerCase()}d.`, 'success');
          },
          error: err => { this.approving = false; Swal.fire('Error', err?.error?.message || `Unable to ${action.toLowerCase()}.`, 'error'); }
        });
      });
  }

  convertToPO(): void {
    this.router.navigate(['/app/purchase/orders/new'], { queryParams: { fromPR: this.id } });
  }

  /* DRAFT DISABLED
  loadFromDraft(): void {
    this.loading = true;
    this.svc.getPurchaseRequestDraftById(this.draftId!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.requester = d.requester ?? d.Requester ?? this.requester;
        this.departmentId = d.departmentID ?? d.departmentId ?? null;
        this.deliveryDate = (d.deliveryDate ?? d.DeliveryDate ?? '').substring(0, 10);
        this.description = d.description ?? d.Description ?? '';
        this.prLines = this.parseLines(d.pRLines ?? d.prLines ?? d.PRLines ?? '[]');
        this.resolveDeptName();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }
  */

  // Modal
  openAddLine(): void {
    this.editingIndex = null;
    this.modalLine = this.emptyLine();
    this.showModal = true;
  }

  editLine(i: number): void {
    this.editingIndex = i;
    this.modalLine = { ...this.prLines[i] };
    this.showModal = true;
  }

  closeModal(): void { this.showModal = false; this.editingIndex = null; }

  onModalItemChange(): void {
    const opt = this.itemOptions.find(o => o.value === this.modalLine.itemId);
    if (opt) {
      this.modalLine.itemSearch = opt.label;
      this.modalLine.itemCode = opt.raw?.itemCode ?? '';
      if (opt.raw?.uomId) {
        this.modalLine.uomId = opt.raw.uomId;
        const uomOpt = this.uomOptions.find(u => u.value === opt.raw.uomId);
        this.modalLine.uom = uomOpt?.label ?? '';
        this.modalLine.uomSearch = this.modalLine.uom;
      }
    }
  }

  onModalUomChange(): void {
    const opt = this.uomOptions.find(o => o.value === this.modalLine.uomId);
    if (opt) { this.modalLine.uom = opt.label; this.modalLine.uomSearch = opt.label; }
  }

  onModalLocationChange(): void {
    const opt = this.locationOptions.find(o => o.value === this.modalLine.locationId);
    if (opt) { this.modalLine.location = opt.label; this.modalLine.locationSearch = opt.label; }
  }

  saveModal(): void {
    this.error = '';
    if (!this.modalLine.itemId) { this.error = 'Select an Item.'; return; }
    if (!this.modalLine.qty || (this.modalLine.qty ?? 0) <= 0) { this.error = 'Enter a valid Qty.'; return; }
    if (!this.modalLine.locationId) { this.error = 'Select an Outlet.'; return; }

    if (this.editingIndex !== null) {
      this.prLines[this.editingIndex] = { ...this.modalLine };
    } else {
      this.prLines.push({ ...this.modalLine });
    }
    this.closeModal();
  }

  addAndContinue(): void {
    this.error = '';
    if (!this.modalLine.itemId) { this.error = 'Select an Item.'; return; }
    if (!this.modalLine.qty || (this.modalLine.qty ?? 0) <= 0) { this.error = 'Enter a valid Qty.'; return; }
    if (!this.modalLine.locationId) { this.error = 'Select an Outlet.'; return; }
    this.prLines.push({ ...this.modalLine });
    this.modalLine = this.emptyLine();
  }

  removeLine(i: number): void { this.prLines.splice(i, 1); }

  onDeptChange(): void {
    const opt = this.departmentOptions.find(o => o.value === this.departmentId);
    this.departmentName = opt?.label ?? '';
  }

  prGo(step: number): void {
    this.error = '';
    const next = this.prStep + step;
    if (step > 0) {
      if (this.prStep === 0) {
        if (!this.departmentId) { this.error = 'Select a Department.'; return; }
        if (!this.deliveryDate) { this.error = 'Set a Delivery Date.'; return; }
      } else if (this.prStep === 1) {
        if (!this.prLines.length) { this.error = 'Add at least one line.'; return; }
      }
    }
    this.prStep = Math.max(0, Math.min(next, this.prSteps.length - 1));
  }

  private buildPayload(): any {
    const strippedLines = this.prLines.map(l => ({
      itemId: l.itemId,
      itemCode: l.itemCode,
      itemSearch: l.itemSearch,
      qty: l.qty,
      uomId: l.uomId,
      uomSearch: l.uomSearch,
      uom: l.uom,
      locationId: l.locationId,
      locationSearch: l.locationSearch,
      location: l.location,
      budgetLineId: l.budgetLineId,
      budget: l.budget,
      remarks: l.remarks
    }));
    return {
      Requester: this.requester,
      DepartmentID: this.departmentId,
      DepartmentName: this.departmentName,
      DeliveryDate: this.deliveryDate,
      Description: this.description,
      PRLines: JSON.stringify(strippedLines),
      PurchaseRequestNo: 'PENDING',
      IsActive: true,
      Status: 1,
      IsReorder: false,
      CreatedBy: this.loginUserId,
      UpdatedBy: this.loginUserId,
      // source tracking — links PR back to its originating SO or Production Plan
      SourceId: this.sourceId ?? null,
      SourceReferenceId: this.sourceReferenceId ?? null,
      SourceType: this.sourceType !== 'MANUAL' ? this.sourceType : null
    };
  }

  /* DRAFT DISABLED
  saveDraft(): void {
    this.saving = true;
    this.error = '';
    const payload = this.buildPayload();

    const obs$ = this.draftId
      ? this.svc.updatePurchaseRequestDraft(this.draftId, payload)
      : this.svc.createPurchaseRequestDraft(payload);

    obs$.subscribe({
      next: () => {
        this.saving = false;
        Swal.fire({ icon: 'success', title: 'Draft Saved', text: 'Purchase request draft saved successfully.', confirmButtonColor: '#16a34a' }).then(() => this.back());
      },
      error: (err: any) => { this.saving = false; this.error = err?.error?.message ?? 'Draft save failed.'; }
    });
  }
  */

  submit(): void {
    this.saving = true;
    this.error = '';
    const dateToCheck = this.deliveryDate || new Date().toISOString().substring(0, 10);
    this.svc.checkPeriodLock(dateToCheck).subscribe({
      next: (res: any) => {
        const d = res?.data ?? res ?? {};
        if (d.isClosed || d.IsClosed || d.status === 'Closed' || d.Status === 'Closed') {
          this.saving = false;
          this.error = `The accounting period for ${dateToCheck} is closed. Please contact Finance to reopen it.`;
          return;
        }
        this.doSubmit();
      },
      error: () => this.doSubmit()
    });
  }

  private doSubmit(): void {
    const payload = this.buildPayload();

    const obs$ = this.isEdit
      ? this.svc.updatePurchaseRequest(this.id!, payload)
      : this.svc.createPurchaseRequest(payload);

    obs$.subscribe({
      next: (res: any) => {
        if (!this.isEdit) {
          // After creating a new PR, push it through the approval workflow.
          // This generates a "New PR" alert visible in the PO list.
          const newId = res?.data?.id ?? res?.data?.[0]?.id ?? res?.id ?? res?.result?.[0]?.id;
          if (newId) {
            this.svc.submitDocument({ documentType: 'PR', documentId: Number(newId) })
              .subscribe({ error: () => {} });
          }
        }
        this.saving = false;
        // DRAFT DISABLED: if (this.draftId) { this.svc.deletePurchaseRequestDraft(this.draftId, this.loginUserId).subscribe({ error: () => {} }); }
        Swal.fire('Submitted', this.isEdit ? 'Purchase request updated successfully.' : 'Purchase request submitted successfully.', 'success').then(() => this.back());
      },
      error: (err: any) => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  viewLineDetail(line: PRLine): void {
    this.showDetailSwal(line.itemSearch || line.itemCode || 'Line Detail', [
      ['Item Code', line.itemCode],
      ['Item', line.itemSearch],
      ['Qty', line.qty],
      ['UOM', line.uomSearch || line.uom],
      ['Location', line.locationSearch || line.location],
      ['Budget Line', line.budget],
      ['Remarks', line.remarks],
    ]);
  }

  private showDetailSwal(title: string, rows: [string, any][]): void {
    const html = rows.filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;font-weight:600;white-space:nowrap;text-align:left;border-bottom:1px solid #f1f5f9">${k}</td><td style="padding:5px 12px;font-size:12px;text-align:left;border-bottom:1px solid #f1f5f9">${v}</td></tr>`).join('');
    Swal.fire({ title, html: `<table style="width:100%;border-collapse:collapse">${html}</table>`, confirmButtonColor: '#16a34a', width: 500, showCloseButton: true });
  }

  back(): void { this.router.navigate(['/app/purchase/requests']); }

  getLabel(opts: any[], val: any): string { return opts.find(o => o.value === val)?.label ?? '—'; }

  get totalQty(): number { return this.prLines.reduce((s, l) => s + Number(l.qty || 0), 0); }
  get today(): string { return new Date().toISOString().substring(0, 10); }
  get isAutoSource(): boolean { return this.sourceType !== 'MANUAL' && !!this.sourceId; }
  get sourceTypeLabel(): string { return this.sourceType === 'SO' ? 'Sales Order' : this.sourceType === 'RECIPE' ? 'Production Plan' : ''; }
  get title(): string {
    if (this.isEdit) return 'Edit Purchase Request';
    // if (this.draftId) return 'Edit PR Draft'; // DRAFT DISABLED
    return 'New Purchase Request';
  }
}
