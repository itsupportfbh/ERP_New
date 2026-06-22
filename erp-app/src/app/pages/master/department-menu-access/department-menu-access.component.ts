import { Component, OnInit } from '@angular/core';
import Swal from 'sweetalert2';
import {
  ApiResponse,
  DepartmentDto,
  DepartmentMenuAccessListItem,
  DepartmentMenuAccessService,
  SaveDepartmentMenuAccessRequest
} from './department-menu-access.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';

interface MenuModule {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const MENU_MODULES: MenuModule[] = [
  { id: 'home', title: 'General', description: 'Dashboard and common access', icon: 'fas fa-home' },
  { id: 'businesspartners', title: 'Business Partners', description: 'Customers, suppliers and users', icon: 'fas fa-users' },
  { id: 'sales', title: 'Sales', description: 'Sales documents and order flow', icon: 'fas fa-chart-line' },
  { id: 'purchase', title: 'Purchase', description: 'Procurement and vendor operations', icon: 'fas fa-shopping-cart' },
  { id: 'inventory', title: 'Inventory', description: 'Stock, transfers and internal requests', icon: 'fas fa-boxes' },
  { id: 'financial', title: 'Financial', description: 'Accounting, ledger and tax', icon: 'fas fa-wallet' },
  { id: 'master', title: 'Master', description: 'Core setup and administrative masters', icon: 'fas fa-cogs' },
  { id: 'recipe', title: 'Recipe', description: 'Recipe and production planning', icon: 'fas fa-utensils' }
];

@Component({
  selector: 'erp-department-menu-access',
  standalone: false,
  templateUrl: './department-menu-access.component.html',
  styleUrls: ['./department-menu-access.component.scss']
})
export class DepartmentMenuAccessComponent implements OnInit {
  rows: DepartmentMenuAccessListItem[] = [];
  departments: DepartmentDto[] = [];
  loading = false;
  saving = false;
  isFormVisible = false;
  isEditMode = false;
  selectedDepartmentId: number | null = null;
  selectedDepartmentName = '';
  checkedIds = new Set<string>();

  readonly modules = MENU_MODULES;

  permission: FunctionPermission;
  isPermissionLoaded = false;
  userId: number = 0;
  functionId = 'department-menu-access';

  canCreate(): boolean { return this.permissionService.hasCreate(this.permission); }
  canEdit(): boolean { return this.permissionService.hasEdit(this.permission); }
  canDelete(): boolean { return this.permissionService.hasDelete(this.permission); }

  constructor(private service: DepartmentMenuAccessService, private permissionService: PermissionService) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void {
    this.loadPermission();
    this.loadList();
    this.loadDepartments();
  }

  loadPermission(): void {
    if (!this.userId || this.userId <= 0) {
      this.permission = this.permissionService.getEmptyPermission(this.functionId);
      this.isPermissionLoaded = true;
      return;
    }
    this.permissionService.getFunctionPermission(this.userId, this.functionId).subscribe({
      next: (res: FunctionPermission) => {
        this.permission = res || this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
      },
      error: () => {
        this.permission = this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
      }
    });
  }

  loadList(): void {
    this.loading = true;
    this.service.getAllDepartmentMenuAccess().subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (Array.isArray((res as any)?.data) ? (res as any).data : []);
        this.rows = items.map((row: any) => this.normalizeRow(row));
        this.loading = false;
      },
      error: () => {
        this.rows = [];
        this.loading = false;
      }
    });
  }

  loadDepartments(): void {
    this.service.getDepartments().subscribe({
      next: (res: ApiResponse<DepartmentDto[]>) => {
        const raw = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray((res as any)?.result)
              ? (res as any).result
              : Array.isArray((res as any)?.items)
                ? (res as any).items
                : [];

        this.departments = raw
          .map((item: any) => ({
            id: Number(item?.id ?? item?.Id ?? item?.departmentId ?? item?.DepartmentId ?? 0),
            departmentName: String(item?.departmentName ?? item?.name ?? item?.DepartmentName ?? item?.Name ?? '').trim()
          }))
          .filter((item: DepartmentDto) => item.id > 0 && !!item.departmentName);

        this.ensureSelectedDepartmentOption();
      },
      error: () => {
        this.departments = [];
      }
    });
  }

  showCreate(): void {
    this.isFormVisible = true;
    this.isEditMode = false;
    this.selectedDepartmentId = null;
    this.selectedDepartmentName = '';
    this.checkedIds.clear();
  }

  edit(row: DepartmentMenuAccessListItem): void {
    this.isFormVisible = true;
    this.isEditMode = true;
    this.selectedDepartmentId = row.departmentId;
    this.selectedDepartmentName = row.departmentName || '';
    this.ensureSelectedDepartmentOption();
    this.checkedIds.clear();
    this.patchAccess(row.departmentId);
  }

  cancel(): void {
    this.isFormVisible = false;
    this.isEditMode = false;
    this.selectedDepartmentId = null;
    this.selectedDepartmentName = '';
    this.checkedIds.clear();
  }

  onDepartmentChange(): void {
    if (!this.selectedDepartmentId) {
      this.checkedIds.clear();
      this.selectedDepartmentName = '';
      return;
    }
    this.selectedDepartmentName = this.getDepartmentName(this.selectedDepartmentId);
    if (this.isEditMode) {
      this.patchAccess(this.selectedDepartmentId);
      return;
    }
    this.checkedIds.clear();
  }

  patchAccess(departmentId: number): void {
    this.loading = true;
    this.service.getByDepartmentId(departmentId).subscribe({
      next: (res: any) => {
        const ids = this.extractMenuIds(res);
        const allowed = new Set(this.modules.map(module => module.id));
        this.checkedIds = new Set(ids.filter(id => allowed.has(id)));
        this.loading = false;
      },
      error: () => {
        this.checkedIds.clear();
        this.loading = false;
      }
    });
  }

  isChecked(moduleId: string): boolean {
    return this.checkedIds.has(moduleId);
  }

  toggleModule(moduleId: string): void {
    if (this.checkedIds.has(moduleId)) {
      this.checkedIds.delete(moduleId);
    } else {
      this.checkedIds.add(moduleId);
    }
  }

  getSelectedCount(): number {
    return this.checkedIds.size;
  }

  getDepartmentName(departmentId: number): string {
    return this.departments.find(item => item.id === departmentId)?.departmentName || this.selectedDepartmentName || `Department #${departmentId}`;
  }

  getPreviewNames(row: DepartmentMenuAccessListItem): string[] {
    if (Array.isArray(row.menuNames) && row.menuNames.length) {
      return row.menuNames;
    }
    return (row.menuIds || [])
      .map(id => this.modules.find(module => module.id === id)?.title || this.toTitle(id));
  }

  save(): void {
    if (!this.selectedDepartmentId) {
      void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please select a department.' });
      return;
    }

    const payload: SaveDepartmentMenuAccessRequest = {
      departmentId: this.selectedDepartmentId,
      menuIds: Array.from(this.checkedIds),
      updatedBy: Number(localStorage.getItem('id') || 0)
    };

    this.saving = true;
    this.service.saveDepartmentMenuAccess(payload).subscribe({
      next: async (res) => {
        this.saving = false;
        if (res?.success || res?.isSuccess) {
          await Swal.fire({
            icon: 'success',
            title: this.isEditMode ? 'Updated' : 'Created',
            text: res?.message || 'Department menu access saved successfully.'
          });
          this.cancel();
          this.loadList();
          return;
        }
        void Swal.fire({ icon: 'error', title: 'Save Failed', text: res?.message || 'Unable to save access.' });
      },
      error: (err) => {
        this.saving = false;
        void Swal.fire({ icon: 'error', title: 'Save Failed', text: err?.error?.message || 'Unable to save access.' });
      }
    });
  }

  remove(row: DepartmentMenuAccessListItem): void {
    void Swal.fire({
      icon: 'warning',
      title: 'Delete Access?',
      text: `Do you want to delete access for ${row.departmentName}?`,
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.service.deleteDepartmentMenuAccess(row.departmentId).subscribe({
        next: async (res) => {
          if (res?.success || res?.isSuccess) {
            await Swal.fire({ icon: 'success', title: 'Deleted', text: res?.message || 'Department access deleted.' });
            this.loadList();
            return;
          }
          void Swal.fire({ icon: 'error', title: 'Delete Failed', text: res?.message || 'Unable to delete access.' });
        },
        error: (err) => {
          void Swal.fire({ icon: 'error', title: 'Delete Failed', text: err?.error?.message || 'Unable to delete access.' });
        }
      });
    });
  }

  trackByDepartment(_index: number, row: DepartmentMenuAccessListItem): number {
    return row.departmentId;
  }

  trackByModule(_index: number, module: MenuModule): string {
    return module.id;
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
      .map((value: any) => typeof value === 'object' ? value?.menuId ?? value?.id ?? value?.menuName : value)
      .map((value: any) => String(value ?? '').trim())
      .filter(Boolean)
      .map((value: string) => value.toLowerCase());
  }

  private normalizeRow(row: any): DepartmentMenuAccessListItem {
    const menuIds = (Array.isArray(row?.menuIds) ? row.menuIds : [])
      .map((value: any) => String(value ?? '').trim())
      .filter(Boolean);
    const menuNames = Array.isArray(row?.menuNames) ? row.menuNames : [];
    return {
      departmentId: Number(row?.departmentId ?? row?.departmentID ?? row?.id ?? 0),
      departmentName: row?.departmentName ?? row?.name ?? '',
      menuIds,
      menuNames
    };
  }

  private toTitle(value: string): string {
    return value
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  private ensureSelectedDepartmentOption(): void {
    if (!this.selectedDepartmentId || !this.selectedDepartmentName) return;
    const exists = this.departments.some(item => item.id === this.selectedDepartmentId);
    if (exists) return;
    this.departments = [
      { id: this.selectedDepartmentId, departmentName: this.selectedDepartmentName },
      ...this.departments
    ];
  }
}
