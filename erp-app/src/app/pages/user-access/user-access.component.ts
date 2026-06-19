import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
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

const FALLBACK_MODULES: ModuleDef[] = [
  {
    id: 'dashboard', title: 'Dashboard',
    fns: [{ id: 'dashboard', title: 'Dashboard' }]
  },
  {
    id: 'business-partners', title: 'Business Partners',
    fns: [
      { id: 'bp-customers',    title: 'Customers'         },
      { id: 'bp-suppliers',    title: 'Suppliers'         },
      { id: 'bp-users',        title: 'Users'             },
    ]
  },
  {
    id: 'purchase', title: 'Purchase',
    fns: [
      { id: 'purchase-request',        title: 'Purchase Request'  },
      { id: 'purchase-order',          title: 'Purchase Order'    },
      { id: 'purchase-rfq',            title: 'RFQ'               },
      { id: 'purchase-grn',            title: 'Good Receipt (GRN)'},
      { id: 'purchase-supplier-invoice', title: 'Supplier Invoice'},
      { id: 'purchase-debit-note',     title: 'Debit Note'        },
      { id: 'purchase-three-way-match',title: '3-Way Match'       },
      { id: 'purchase-scorecard',      title: 'Supplier Scorecard'},
    ]
  },
  {
    id: 'sales-order', title: 'Sales',
    fns: [
      { id: 'sales-order-list', title: 'Sales Order List' },
      { id: 'sales-order-new',  title: 'New Sales Order'  },
    ]
  },
  {
    id: 'inventory', title: 'Inventory',
    fns: [
      { id: 'inventory-list',   title: 'Inventory List'   },
      { id: 'inventory-adjust', title: 'Stock Adjustment'  },
    ]
  },
];

const MENU_MODULES: ModuleDef[] = [
  { id: 'dashboard', title: 'Dashboard', fns: [{ id: 'dashboard', title: 'Dashboard' }] },
  {
    id: 'business-partners', title: 'Business Partners',
    fns: [
      { id: 'bp-customer',  title: 'Customers' },
      { id: 'bp-customers', title: 'Customers' },
      { id: 'bp-supplier',  title: 'Suppliers' },
      { id: 'bp-suppliers', title: 'Suppliers' },
      { id: 'bp-users',     title: 'Users' }
    ]
  },
  {
    id: 'purchase', title: 'Purchase',
    fns: [
      { id: 'purchase-request',          title: 'Purchase Request'   },
      { id: 'purchase-order',            title: 'Purchase Order'     },
      { id: 'purchase-rfq',              title: 'RFQ'                },
      { id: 'purchase-grn',              title: 'Good Receipt (GRN)' },
      { id: 'purchase-supplier-invoice', title: 'Supplier Invoice'   },
      { id: 'purchase-debit-note',       title: 'Debit Note'         },
      { id: 'purchase-three-way-match',  title: '3-Way Match'        },
      { id: 'purchase-scorecard',        title: 'Supplier Scorecard' },
    ]
  },
  {
    id: 'sales-order', title: 'Sales',
    fns: [
      { id: 'sales-order',      title: 'Sales Order'      },
      { id: 'sales-order-list', title: 'Sales Order List' },
      { id: 'sales-order-new',  title: 'New Sales Order'  }
    ]
  },
  {
    id: 'inventory', title: 'Inventory',
    fns: [
      { id: 'inventory',        title: 'Inventory'        },
      { id: 'inventory-list',   title: 'Inventory List'   },
      { id: 'inventory-adjust', title: 'Stock Adjustment' }
    ]
  },
  { id: 'components', title: 'Components', fns: [{ id: 'components', title: 'Components' }] }
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
      }
    });
  }

  // ── Step navigation ──────────────────────────────
  goStep(n: number): void {
    if (n < this.step) { this.step = n; this.error = ''; return; }
    if (n >= 2 && !this.validateStep1()) return;
    if (n >= 2) this.loadDepartmentPermissions(this.account.departmentId);
    this.step  = n;
    this.error = '';
  }

  next(): void { this.goStep(this.step + 1); }
  prev(): void { this.step--; this.error = ''; }

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
  submit(): void {
    if (!this.validateStep1()) { this.step = 1; return; }
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
      return;
    }

    const request = this.isEdit
      ? this.svc.updateUserAccessWizard(this.userId!, payload)
      : this.svc.submitUserAccessWizard(payload);

    request.subscribe({
      next: (res: any) => {
        this.refreshAllowedMenuIds();
        this.saving = false;
        this.router.navigate(['/app/business-partners'], { queryParams: { tab: 'users' } });
      },
      error: err => {
        this.saving = false;
        this.error  = err?.error?.message || err?.error?.title || 'Unable to save user.';
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
    });
  }

  private buildModules(menuIds: string[]): ModuleDef[] {
    if (!menuIds.length) return FALLBACK_MODULES;
    const allowed = new Set(menuIds.map(id => id.toLowerCase()));
    const modules = MENU_MODULES.map(module => {
      const parentAllowed = allowed.has(module.id.toLowerCase());
      const fns = module.fns.filter(fn => parentAllowed || allowed.has(fn.id.toLowerCase()));
      return fns.length ? { ...module, fns } : null;
    }).filter((module): module is ModuleDef => !!module);
    return modules.length ? modules : FALLBACK_MODULES;
  }

  private extractMenuIds(res: any): string[] {
    const raw = res?.menuIds ?? res?.data?.menuIds ?? res?.data ?? [];
    if (!Array.isArray(raw)) return [];
    return raw.map(value => String(value).trim()).filter(Boolean);
  }

  private patchSavedPermissions(): void {
    if (!this.userId) return;
    this.svc.getOrganizationRoleByUserId(this.userId).pipe(catchError(() => of(null))).subscribe(res => {
      const data = res?.data ?? res;
      const jsonText = data?.rolesJSON ?? data?.RolesJSON;
      if (!jsonText) return;
      let saved: any[] = [];
      try { saved = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText; } catch { saved = []; }
      if (!Array.isArray(saved)) return;
      this.permRows = this.permRows.map(row => {
        const found = saved.find(item =>
          String(item?.FunctionId ?? item?.functionId ?? '').toLowerCase() === row.functionId.toLowerCase()
          && String(item?.ModuleId ?? item?.moduleId ?? '').toLowerCase() === row.moduleId.toLowerCase()
        );
        if (!found) return row;
        const permissions = found.Permissions ?? found.permissions ?? {};
        return {
          ...row,
          flags: {
            V: !!(permissions.View ?? permissions.view ?? permissions.V),
            C: !!(permissions.Create ?? permissions.create ?? permissions.C),
            E: !!(permissions.Edit ?? permissions.edit ?? permissions.E),
            D: !!(permissions.Delete ?? permissions.delete ?? permissions.D),
            S: !!(permissions.Submit ?? permissions.submit ?? permissions.S),
            A: !!(permissions.Approve ?? permissions.approve ?? permissions.A),
            R: !!(permissions.Reject ?? permissions.reject ?? permissions.R),
            N: !!(permissions.Cancel ?? permissions.cancel ?? permissions.N),
            X: !!(permissions.Export ?? permissions.export ?? permissions.X),
            P: !!(permissions.Print ?? permissions.print ?? permissions.P),
            M: !!(permissions.Post ?? permissions.post ?? permissions.Finalize ?? permissions.M)
          }
        };
      });
    });
  }

  private getPermissionPayload(): any[] {
    return this.permRows.map(row => ({
      moduleId: row.moduleId,
      moduleTitle: row.moduleTitle,
      functionId: row.functionId,
      functionTitle: row.functionTitle,
      flags: { ...row.flags }
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
}
