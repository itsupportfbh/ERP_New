import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { BusinessPartnersService, UserPayload } from '../business-partners/business-partners.service';
import { DropdownOption } from '../../shared/components/dropdown/dropdown.component';

export type PermFlag = 'V' | 'C' | 'E' | 'D' | 'S' | 'A' | 'R' | 'N' | 'X' | 'P' | 'M';

export const PERM_FLAGS: { key: PermFlag; label: string }[] = [
  { key: 'V', label: 'View'    },
  { key: 'C', label: 'Create'  },
  { key: 'E', label: 'Edit'    },
  { key: 'D', label: 'Delete'  },
  { key: 'S', label: 'Submit'  },
  { key: 'A', label: 'Approve' },
  { key: 'R', label: 'Reject'  },
  { key: 'N', label: 'Cancel'  },
  { key: 'X', label: 'Export'  },
  { key: 'P', label: 'Print'   },
  { key: 'M', label: 'Post'    },
];

export interface PermRow {
  moduleId:      string;
  moduleTitle:   string;
  functionId:    string;
  functionTitle: string;
  flags: Record<PermFlag, boolean>;
}

interface ModuleDef {
  id: string;
  title: string;
  fns: Array<{ id: string; title: string }>;
}

interface MenuNode {
  id: string;
  title: string;
  type: 'item' | 'collapsible';
  hidden?: boolean;
  children?: MenuNode[];
}

const APP_MENU_TREE: MenuNode[] = [
  { id: 'home', title: 'Dashboard', type: 'item' },
  {
    id: 'master',
    title: 'Master',
    type: 'collapsible',
    children: [
      { id: 'approval-level', title: 'Approval Level', type: 'item' },
      { id: 'bank', title: 'Bank', type: 'item' },
      { id: 'bin', title: 'Bin', type: 'item' },
      { id: 'catagory', title: 'Category', type: 'item' },
      { id: 'cities', title: 'Cities', type: 'item' },
      { id: 'company', title: 'Company', type: 'item' },
      { id: 'costingmethod', title: 'Costing Method', type: 'item' },
      { id: 'countries', title: 'Countries', type: 'item' },
      { id: 'currency', title: 'Currency', type: 'item' },
      { id: 'customergroups', title: 'Customer Groups', type: 'item' },
      { id: 'department', title: 'Department', type: 'item' },
      { id: 'department-menu-access', title: 'Department Menu Access', type: 'item' },
      { id: 'driver', title: 'Driver', type: 'item' },
      { id: 'exchangerate', title: 'Exchange Rate', type: 'item' },
      { id: 'flagissue', title: 'Flag Issue', type: 'item' },
      { id: 'incoterms', title: 'Incoterms', type: 'item' },
      { id: 'itemType', title: 'Item Type', type: 'item' },
      { id: 'location', title: 'Outlet', type: 'item' },
      { id: 'itemSet', title: 'Package', type: 'item' },
      { id: 'paymentTerms', title: 'Payment Terms', type: 'item' },
      { id: 'recurring', title: 'Recurring', type: 'item' },
      { id: 'service', title: 'Service', type: 'item' },
      { id: 'states', title: 'States', type: 'item' },
      { id: 'stockissue', title: 'Stock Issue', type: 'item' },
      { id: 'strategy', title: 'Frequency', type: 'item' },
      { id: 'suppliergroups', title: 'Supplier Groups', type: 'item' },
      { id: 'taxcode', title: 'Tax Code', type: 'item' },
      { id: 'uom', title: 'UOM', type: 'item' },
      { id: 'uomconversion', title: 'UOM Conversion', type: 'item' },
      { id: 'vehicle', title: 'Vehicle', type: 'item' },
      { id: 'warehouse', title: 'Warehouse', type: 'item' }
    ]
  },
  {
    id: 'businesspartners',
    title: 'Business Partners',
    type: 'collapsible',
    children: [
      { id: 'bp-customer', title: 'Customer', type: 'item' },
      { id: 'bp-supplier', title: 'Supplier', type: 'item' },
      { id: 'users', title: 'Users', type: 'item' }
    ]
  },
  {
    id: 'sales',
    title: 'Sales',
    type: 'collapsible',
    children: [
      { id: 'qt-list', title: 'Quotation', type: 'item' },
      { id: 'so-list', title: 'Sales Order', type: 'item' },
      { id: 'sales-pp-list', title: 'Picking & Packing', type: 'item' },
      { id: 'do-list2', title: 'Delivery Order', type: 'item' },
      { id: 'si-list', title: 'Sales Invoice', type: 'item' },
      { id: 'cn-list', title: 'Credit Note', type: 'item' },
      { id: 'sales-report', title: 'Report', type: 'item' }
    ]
  },
  {
    id: 'purchase',
    title: 'Purchase',
    type: 'collapsible',
    children: [
      { id: 'pr-list', title: 'Purchase Request', type: 'item' },
      { id: 'po-list', title: 'Purchase Order', type: 'item' },
      { id: 'rfq', title: 'RFQ', type: 'item' },
      { id: 'grn-list', title: 'Goods Receipt Note', type: 'item' },
      { id: 'pin-list', title: 'Supplier Invoice', type: 'item' },
      { id: 'dn-list', title: 'Debit Note', type: 'item' },
      { id: 'supplier-scorecard', title: 'Supplier Scorecard', type: 'item' },
      { id: 'mobilereceiving', title: 'Mobile Receiving', type: 'item' }
    ]
  },
  {
    id: 'inventory',
    title: 'Inventory',
    type: 'collapsible',
    children: [
      { id: 'im-list', title: 'Item Master', type: 'item' },
      { id: 'stock-overview', title: 'Stock Overview', type: 'item' },
      { id: 'stock-transfer', title: 'Stock Transfer', type: 'item' },
      { id: 'stock-adjustment', title: 'Stock Adjustment', type: 'item' },
      {
        id: 'inv-internal',
        title: 'Internal',
        type: 'collapsible',
        children: [
          { id: 'mr-list', title: 'Material Request', type: 'item' },
          { id: 'list-stock-transfer-receipt', title: 'Stock Transfer Request', type: 'item' }
        ]
      },
      { id: 'stocktake-list', title: 'Stock Take', type: 'item' },
      { id: 'reorder-list', title: 'Stock Reorder Planning', type: 'item' },
      { id: 'stockcogs', title: 'Stock COGS', type: 'item' },
      { id: 'list-stock-history', title: 'Stock History', type: 'item' }
    ]
  },
  {
    id: 'financial',
    title: 'Financial',
    type: 'collapsible',
    children: [
      { id: 'finance-dashboard', title: 'Dashboard', type: 'item' },
      { id: 'ledger', title: 'General Ledger', type: 'item' },
      { id: 'coa', title: 'Chart of Account', type: 'item' },
      { id: 'journal', title: 'Journal', type: 'item' },
      { id: 'ar', title: 'Accounts Receivable', type: 'item' },
      { id: 'ap', title: 'Accounts Payable', type: 'item' },
      { id: 'tax', title: 'Tax & GST', type: 'item' },
      { id: 'period', title: 'Period Close', type: 'item' },
      { id: 'year-end', title: 'Year End Close', type: 'item' },
      { id: 'tb', title: 'Trial Balance', type: 'item' },
      { id: 'reports', title: 'Reports', type: 'item' }
    ]
  },
  {
    id: 'recipe',
    title: 'Recipe',
    type: 'collapsible',
    children: [
      { id: 'recipe-list', title: 'Recipe Master', type: 'item' },
      { id: 'pp-list', title: 'Production Planning', type: 'item' },
      { id: 'bp-list', title: 'Batch Production', type: 'item' }
    ]
  }
];

const FALLBACK_MODULES: ModuleDef[] = [
  { id: 'general', title: 'General', fns: [{ id: 'home', title: 'Dashboard' }] },
  { id: 'master', title: 'Master', fns: APP_MENU_TREE.find(x => x.id === 'master')?.children?.map(x => ({ id: x.id, title: x.title })) ?? [] },
  { id: 'businesspartners', title: 'Business Partners', fns: APP_MENU_TREE.find(x => x.id === 'businesspartners')?.children?.map(x => ({ id: x.id, title: x.title })) ?? [] },
  { id: 'sales', title: 'Sales', fns: APP_MENU_TREE.find(x => x.id === 'sales')?.children?.map(x => ({ id: x.id, title: x.title })) ?? [] },
  { id: 'purchase', title: 'Purchase', fns: APP_MENU_TREE.find(x => x.id === 'purchase')?.children?.map(x => ({ id: x.id, title: x.title })) ?? [] },
  { id: 'inventory', title: 'Inventory', fns: [
    { id: 'im-list', title: 'Item Master' },
    { id: 'stock-overview', title: 'Stock Overview' },
    { id: 'stock-transfer', title: 'Stock Transfer' },
    { id: 'stock-adjustment', title: 'Stock Adjustment' },
    { id: 'mr-list', title: 'Material Request' },
    { id: 'list-stock-transfer-receipt', title: 'Stock Transfer Request' },
    { id: 'stocktake-list', title: 'Stock Take' },
    { id: 'reorder-list', title: 'Stock Reorder Planning' },
    { id: 'stockcogs', title: 'Stock COGS' },
    { id: 'list-stock-history', title: 'Stock History' }
  ]},
  { id: 'financial', title: 'Financial', fns: APP_MENU_TREE.find(x => x.id === 'financial')?.children?.map(x => ({ id: x.id, title: x.title })) ?? [] },
  { id: 'recipe', title: 'Recipe', fns: APP_MENU_TREE.find(x => x.id === 'recipe')?.children?.map(x => ({ id: x.id, title: x.title })) ?? [] }
];

@Component({
  selector:    'erp-user-access',
  standalone:  false,
  templateUrl: './user-access.component.html',
  styleUrls:   ['./user-access.component.scss']
})
export class UserAccessComponent implements OnInit {
  step = 1;
  userId: number | null = null;
  loading  = false;
  saving   = false;
  error    = '';
  private permissionsLoaded = false;
  private loadedDepartmentId: number | null = null;

  // ── Step 1 ──────────────────────────────────────
  account: UserPayload = this.emptyAccount();
  editPassword = false;

  departmentOptions:    DropdownOption[] = [];
  locationOptions:      DropdownOption[] = [];
  approvalLevelOptions: DropdownOption[] = [];

  // ── Step 2 ──────────────────────────────────────
  modules: ModuleDef[] = FALLBACK_MODULES;
  readonly permFlags = PERM_FLAGS;
  activeModuleId     = FALLBACK_MODULES[0].id;
  permRows: PermRow[] = this.buildPermRows();
  loadingPermissions = false;

  constructor(
    private route:   ActivatedRoute,
    private router:  Router,
    private svc:     BusinessPartnersService
  ) {}

  // ── Computed ────────────────────────────────────
  get isEdit(): boolean { return !!this.userId; }

  get title(): string {
    return this.isEdit ? 'Edit User Access' : 'New User Access';
  }

  get activeModuleRows(): PermRow[] {
    return this.permRows.filter(r => r.moduleId === this.activeModuleId);
  }

  // ── Lifecycle ────────────────────────────────────
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.userId = id && id !== 'new' ? Number(id) : null;
    this.loadMasters();
    if (this.userId) this.loadUser();
  }

  private loadMasters(): void {
    this.svc.getApprovalLevels().subscribe({
      next: res => {
        this.approvalLevelOptions = this.toOptions(this.svc.unwrapRows(res), 'name', 'id');
      },
      error: () => { this.approvalLevelOptions = []; }
    });

    this.svc.getDepartments().subscribe({
      next: res => {
        this.departmentOptions = this.toOptions(this.svc.unwrapRows(res), 'departmentName', 'id', 'name');
      },
      error: () => { this.departmentOptions = []; }
    });

    this.svc.getLocations().subscribe({
      next: res => {
        this.locationOptions = this.toOptions(this.svc.unwrapRows(res), 'locationName', 'id', 'name');
      },
      error: () => { this.locationOptions = []; }
    });
  }

  private loadUser(): void {
    this.loading = true;
    this.svc.getUserById(this.userId!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.account = {
          id:               d.id    ?? d.userId    ?? null,
          username:         d.username  ?? d.Username  ?? '',
          email:            d.email     ?? d.Email     ?? '',
          password:         '',
          departmentId:     d.departmentId  ?? d.DepartmentId  ?? null,
          locationId:       d.locationId    ?? d.LocationId    ?? null,
          approvalLevelIds: this.toNumberArray(
            d.approvalLevelIds ?? d.ApprovalLevelIds ?? d.approvalLevelId ?? []
          ),
          teams:    d.teams    ?? d.Teams    ?? [],
          isActive: d.isActive ?? d.IsActive ?? true,
        };
        if (this.account.departmentId) this.loadDepartmentPermissions(this.account.departmentId);

        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = 'Unable to load user details.';
        void this.showError('Load Failed', this.error);
      }
    });
  }

  // ── Step navigation ──────────────────────────────
  async goStep(n: number): Promise<void> {
    if (n < this.step) { this.step = n; this.error = ''; return; }
    if (n >= 2 && !this.validateStep1()) {
      if (this.error) await this.showWarning('Validation', this.error);
      return;
    }
    if (n === 2 && (!this.permissionsLoaded || this.loadedDepartmentId !== (this.account.departmentId ?? null))) {
      this.loadDepartmentPermissions(this.account.departmentId);
    }
    this.step  = n;
    this.error = '';
  }

  next(): void { void this.goStep(this.step + 1); }
  prev(): void { this.step--; this.error = ''; }

  onDepartmentChanged(_departmentId: number | null): void {
    this.permissionsLoaded = false;
    this.loadedDepartmentId = null;
    this.modules = [];
    this.activeModuleId = '';
    this.permRows = [];
  }

  private validateStep1(): boolean {
    if (!this.account.username?.trim())     { this.error = 'Username is required.';   return false; }
    if (!this.account.email?.trim())        { this.error = 'Email is required.';      return false; }
    if (!this.isEdit && !this.account.password) { this.error = 'Password is required.'; return false; }
    if (!this.account.departmentId)         { this.error = 'Department is required.'; return false; }
    if (!this.account.locationId)           { this.error = 'Location is required.';   return false; }
    return true;
  }

  // ── Step 2: permission helpers ───────────────────
  setModule(id: string): void { this.activeModuleId = id; }

  togglePerm(row: PermRow, flag: PermFlag): void {
    row.flags[flag] = !row.flags[flag];
    if (row.flags[flag] && flag !== 'V') {
      row.flags['V'] = true;
    }
  }

  toggleModuleAll(flag: PermFlag, checked: boolean): void {
    this.activeModuleRows.forEach(row => {
      row.flags[flag] = checked;
      if (checked && flag !== 'V') {
        row.flags['V'] = true;
      }
    });
  }

  allChecked(flag: PermFlag): boolean {
    const rows = this.activeModuleRows;
    return rows.length > 0 && rows.every(r => r.flags[flag]);
  }

  someChecked(flag: PermFlag): boolean {
    return this.activeModuleRows.some(r => r.flags[flag]) && !this.allChecked(flag);
  }

  hasAnyPerm(moduleId: string): boolean {
    return this.permRows
      .filter(r => r.moduleId === moduleId)
      .some(r => (Object.values(r.flags) as boolean[]).some(v => v));
  }

  resetPermissions(): void {
    this.permRows = this.buildPermRows();
  }

  // ── Step 3: review helpers ───────────────────────
  getDepartmentName(): string {
    const o = this.departmentOptions.find(o => Number(o.value) === Number(this.account.departmentId));
    return o?.label ?? String(this.account.departmentId ?? '—');
  }

  getLocationName(): string {
    const o = this.locationOptions.find(o => Number(o.value) === Number(this.account.locationId));
    return o?.label ?? String(this.account.locationId ?? '—');
  }

  getRoleNames(): string {
    const ids = (this.account.approvalLevelIds ?? []).map(Number);
    const names = this.approvalLevelOptions
      .filter(o => ids.includes(Number(o.value)))
      .map(o => o.label);
    return names.length ? names.join(', ') : '—';
  }

  getModulePermSummary(moduleId: string): string {
    const rows    = this.permRows.filter(r => r.moduleId === moduleId);
    const enabled = rows.filter(r => (Object.values(r.flags) as boolean[]).some(v => v));
    return `${enabled.length} / ${rows.length} functions`;
  }

  // ── Submit ───────────────────────────────────────
  async submit(): Promise<void> {
    if (!this.validateStep1()) {
      this.step = 1;
      if (this.error) await this.showWarning('Validation', this.error);
      return;
    }
    this.saving = true;
    this.error  = '';

    const loginUserId = Number(localStorage.getItem('id')) || null;
    const companyId   = Number(localStorage.getItem('companyId') || 0) || null;
    const rawOrgGuid  = localStorage.getItem('orgGuid') || '';
    const orgGuid     = rawOrgGuid === 'undefined' ? '' : rawOrgGuid;
    const now         = new Date().toISOString();

    const user: UserPayload = {
      username:         this.account.username?.trim(),
      email:            this.account.email?.trim(),
      departmentId:     this.account.departmentId,
      locationId:       this.account.locationId,
      approvalLevelIds: this.toNumberArray(this.account.approvalLevelIds || []),
      teams:            this.account.teams || [],
      companyId,
      orgGuid,
      isActive:         this.account.isActive !== false,
      updatedBy:        loginUserId,
      updatedDate:      now,
    };

    if (!this.isEdit) {
      user.password    = this.account.password;
      user.createdBy   = loginUserId;
      user.createdDate = now;
    } else if (this.editPassword && this.account.password) {
      user.password = this.account.password;
    }

    const payload = {
      orgGuid,
      user,
      permissions: this.getPermissionPayload()
    };

    if (!orgGuid) {
      this.saving = false;
      this.error = 'OrgGuid is missing in local storage.';
      await this.showError('Missing Data', this.error);
      return;
    }

    const request = this.isEdit
      ? this.svc.updateUserAccessWizard(this.userId!, payload)
      : this.svc.submitUserAccessWizard(payload);

    request.subscribe({
      next: async (_res: any) => {
        this.refreshAllowedMenuIds();
        this.saving = false;
        await this.showSuccess(
          this.isEdit ? 'Updated' : 'Created',
          this.isEdit ? 'User updated successfully.' : 'User created successfully.'
        );
        this.router.navigate(['/app/business-partners'], { queryParams: { tab: 'users' } });
      },
      error: err => {
        this.saving = false;
        this.error  = err?.error?.message || err?.error?.title || 'Unable to save user.';
        void this.showError('Save Failed', this.error);
      }
    });
  }

  back(): void {
    this.router.navigate(['/app/business-partners'], { queryParams: { tab: 'users' } });
  }

  // ── Private helpers ──────────────────────────────
  private buildPermRows(): PermRow[] {
    const emptyFlags = (): Record<PermFlag, boolean> =>
      ({ V: false, C: false, E: false, D: false, S: false, A: false, R: false, N: false, X: false, P: false, M: false });

    return this.modules.flatMap(mod =>
      mod.fns.map(fn => ({
        moduleId:      mod.id,
        moduleTitle:   mod.title,
        functionId:    fn.id,
        functionTitle: fn.title,
        flags:         emptyFlags(),
      }))
    );
  }

  private loadDepartmentPermissions(departmentId?: number | null): void {
    if (!departmentId || this.loadingPermissions) return;
    this.loadingPermissions = true;
    this.svc.getDepartmentMenuAccess(departmentId).pipe(catchError(() => of(null))).subscribe(res => {
      const menuIds = this.extractMenuIds(res);
      this.modules = this.buildModules(menuIds);
      this.activeModuleId = this.modules[0]?.id || '';
      this.permRows = this.buildPermRows();
      if (this.userId) this.patchSavedPermissions();
      this.loadingPermissions = false;
      this.permissionsLoaded = true;
      this.loadedDepartmentId = departmentId;
    });
  }

  private buildModules(menuIds: string[]): ModuleDef[] {
    if (!menuIds.length) return [];
    const allowed = new Set(menuIds.map(id => id.toLowerCase()));
    const modules: ModuleDef[] = [];

    if (allowed.has('home')) {
      modules.push({
        id: 'general',
        title: 'General',
        fns: [{ id: 'home', title: 'Dashboard' }]
      });
    }

    const mappedModules = APP_MENU_TREE
      .filter(item => item.type === 'collapsible' && !item.hidden)
      .map(module => {
        if (!allowed.has(module.id.toLowerCase())) return null;
        const fns = this.flattenModuleFns(module.children || []);
        return fns.length ? { id: module.id, title: module.title, fns } : null;
      })
      .filter((module): module is ModuleDef => !!module);

    modules.push(...mappedModules);

    const deduped = modules.map(module => ({
      ...module,
      fns: module.fns.filter((fn, index, arr) =>
        arr.findIndex(candidate => candidate.id.toLowerCase() === fn.id.toLowerCase()) === index
      )
    })).filter(module => module.fns.length);
    return deduped;
  }

  private extractMenuIds(res: any): string[] {
    const raw =
      res?.menuIds ??
      res?.data?.menuIds ??
      res?.data?.data?.menuIds ??
      res?.data?.items?.menuIds ??
      res?.data ??
      [];

    const values = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : Array.isArray(raw?.rows)
          ? raw.rows
          : [];

    return values
      .map(value =>
        typeof value === 'object'
          ? value?.menuId ?? value?.MenuId ?? value?.id ?? value?.Id ?? value?.menuName ?? value?.MenuName
          : value
      )
      .map(value => String(value ?? '').trim())
      .filter(Boolean);
  }

  private flattenModuleFns(nodes: MenuNode[]): Array<{ id: string; title: string }> {
    const result: Array<{ id: string; title: string }> = [];
    for (const node of nodes || []) {
      if (!node || node.hidden) continue;
      if (node.type === 'item') {
        result.push({ id: node.id, title: node.title });
      }
      if (node.children?.length) {
        result.push(...this.flattenModuleFns(node.children));
      }
    }
    return result;
  }

  private patchSavedPermissions(): void {
    if (!this.userId) return;
    this.svc.getOrganizationRoleByUserId(this.userId).pipe(catchError(() => of(null))).subscribe(res => {
      if (!res) return;
      const saved = this.extractPermissionsArray(res);
      if (!saved.length) return;
      this.permRows = this.permRows.map(row => {
        const found = saved.find(item => {
          const idMatch =
            String(item?.FunctionId ?? item?.functionId ?? '').toLowerCase() === row.functionId.toLowerCase()
            && String(item?.ModuleId ?? item?.moduleId ?? '').toLowerCase() === row.moduleId.toLowerCase();
          const titleMatch =
            String(item?.FunctionTitle ?? item?.functionTitle ?? '').toLowerCase() === row.functionTitle.toLowerCase()
            && String(item?.ModuleTitle ?? item?.moduleTitle ?? '').toLowerCase() === row.moduleTitle.toLowerCase();
          return idMatch || titleMatch;
        });
        if (!found) return row;
        const permissions = found.Permissions ?? found.permissions ?? found.flags ?? found.Flags ?? {};
        return {
          ...row,
          flags: {
            V: !!(permissions.View   ?? permissions.view   ?? permissions.V ?? false),
            C: !!(permissions.Create ?? permissions.create ?? permissions.C ?? false),
            E: !!(permissions.Edit   ?? permissions.edit   ?? permissions.E ?? false),
            D: !!(permissions.Delete ?? permissions.delete ?? permissions.D ?? false),
            S: !!(permissions.Submit ?? permissions.submit ?? permissions.S ?? false),
            A: !!(permissions.Approve ?? permissions.approve ?? permissions.A ?? false),
            R: !!(permissions.Reject ?? permissions.reject ?? permissions.R ?? false),
            N: !!(permissions.Cancel ?? permissions.cancel ?? permissions.N ?? false),
            X: !!(permissions.Export ?? permissions.export ?? permissions.X ?? false),
            P: !!(permissions.Print  ?? permissions.print  ?? permissions.P ?? false),
            M: !!(permissions.Post   ?? permissions.post   ?? permissions.Finalize ?? permissions.M ?? false)
          }
        };
      });
    });
  }

  private extractPermissionsArray(res: any): any[] {
    if (!res) return [];
    const isPermRow = (item: any) =>
      item && typeof item === 'object' &&
      (item.functionId || item.FunctionId || item.functionTitle || item.FunctionTitle);

    if (Array.isArray(res) && res.length && isPermRow(res[0])) return res;

    const data = res?.data ?? res;

    if (Array.isArray(data) && data.length) {
      if (isPermRow(data[0])) return data;
      const fromFirst = this.extractPermissionsArray(data[0]);
      if (fromFirst.length) return fromFirst;
    }

    if (data && typeof data === 'object') {
      for (const key of ['permissions', 'Permissions', 'items', 'Items', 'roles', 'Roles', 'functionPermissions', 'FunctionPermissions']) {
        if (Array.isArray(data[key]) && data[key].length && isPermRow(data[key][0])) return data[key];
      }
      for (const key of Object.keys(data)) {
        const val = data[key];
        if (typeof val === 'string' && val.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed) && parsed.length && isPermRow(parsed[0])) return parsed;
          } catch {}
        }
      }
    }

    return [];
  }

  private getPermissionPayload(): any[] {
    return this.permRows.map(row => ({
      moduleId: row.moduleId,
      moduleTitle: row.moduleTitle,
      functionId: row.functionId,
      functionTitle: row.functionTitle,
      ModuleId: row.moduleId,
      ModuleTitle: row.moduleTitle,
      FunctionId: row.functionId,
      FunctionTitle: row.functionTitle,
      flags: { ...row.flags }
      ,
      Permissions: {
        View: row.flags.V === true,
        Create: row.flags.C === true,
        Edit: row.flags.E === true,
        Delete: row.flags.D === true,
        Submit: row.flags.S === true,
        Approve: row.flags.A === true,
        Reject: row.flags.R === true,
        Cancel: row.flags.N === true,
        Export: row.flags.X === true,
        Print: row.flags.P === true,
        Post: row.flags.M === true
      }
    }));
  }

  private refreshAllowedMenuIds(): void {
    const ids = Array.from(new Set(
      this.permRows
        .filter(row => row.flags.V)
        .flatMap(row => [row.moduleId, row.functionId])
        .map(id => id.toLowerCase())
    ));
    localStorage.setItem('allowedMenuIds', JSON.stringify(ids));
    localStorage.setItem('menuIds', JSON.stringify(ids));
    window.dispatchEvent(new Event('menu-permission-updated'));
  }

  private emptyAccount(): UserPayload {
    return {
      username: '', email: '', password: '',
      departmentId: null, locationId: null,
      approvalLevelIds: [], teams: [], isActive: true,
    };
  }

  private toOptions(rows: any[], labelKey: string, valueKey: string, fallbackLabel?: string): DropdownOption[] {
    return rows
      .map(row => ({
        label: String(row?.[labelKey] ?? row?.[fallbackLabel ?? labelKey] ?? row?.name ?? row?.Name ?? ''),
        value: row?.[valueKey] ?? row?.id ?? row?.Id,
      }))
      .filter(o => o.value !== undefined && o.value !== null);
  }

  private toNumberArray(values: any[]): number[] {
    return (values || []).map(Number).filter(v => Number.isFinite(v) && v > 0);
  }

  private showWarning(title: string, text: string) {
    return Swal.fire({ icon: 'warning', title, text, confirmButtonColor: '#1a5c6e' });
  }

  private showError(title: string, text: string) {
    return Swal.fire({ icon: 'error', title, text, confirmButtonColor: '#d33' });
  }

  private showSuccess(title: string, text: string) {
    return Swal.fire({ icon: 'success', title, text, confirmButtonColor: '#1a5c6e' });
  }
}
