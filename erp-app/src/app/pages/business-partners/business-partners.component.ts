import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { RowAction, TableColumn, SortState } from '../../shared/components/data-table/data-table.component';
import { BusinessPartnersService } from './business-partners.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';

type PartnerTab = 'customers' | 'suppliers' | 'users';

@Component({
  selector: 'erp-business-partners',
  standalone: false,
  templateUrl: './business-partners.component.html',
  styleUrls: ['./business-partners.component.scss']
})
export class BusinessPartnersComponent implements OnInit {
  activeTab: PartnerTab = 'customers';
  filter = { search: '' };
  loading = false;
  error = '';
  currentPage = 1;
  pageSize = 10;
  sort: SortState = { key: '', dir: 'asc' };
  allData: any[] = [];
  tableData: any[] = [];
  selectedRows: any[] = [];

  private readonly tabFunctionIds: Record<PartnerTab, string> = {
    customers: 'bp-customer',
    suppliers: 'bp-supplier',
    users: 'users'
  };
  private loginUserId: number = 0;
  tabPermissions: Record<PartnerTab, FunctionPermission>;

  private readonly allUserRowActions: RowAction[] = [
    { key: 'edit',   label: 'Edit',   icon: 'edit',   btnClass: 'info' },
    { key: 'delete', label: 'Delete', icon: 'delete', btnClass: 'danger' }
  ];

  readonly customerColumns: TableColumn[] = [
    { key: 'customerName', header: 'Customer', type: 'text', sortable: true },
    { key: 'customerCode', header: 'Code', type: 'text' },
    { key: 'customerGroupName', header: 'Group', type: 'text', sortable: true },
    { key: 'contactPerson', header: 'Contact', type: 'text' },
    { key: 'email', header: 'Email', type: 'text' },
    { key: 'phone', header: 'Phone', type: 'text' },
    { key: 'statusName', header: 'Status', type: 'badge', badgeMap: { Active: 'success', Inactive: 'danger' } }
  ];

  readonly supplierColumns: TableColumn[] = [
    { key: 'name', header: 'Supplier', type: 'text', sortable: true },
    { key: 'contact', header: 'Contact', type: 'text' },
    { key: 'email', header: 'Email', type: 'text' },
    { key: 'phone', header: 'Phone', type: 'text' },
    { key: 'countryName', header: 'Country', type: 'text' },
    { key: 'currencyName', header: 'Currency', type: 'text' },
    { key: 'statusName', header: 'Status', type: 'badge', badgeMap: { Active: 'success', Inactive: 'danger' } }
  ];

  readonly userColumns: TableColumn[] = [
    { key: 'username', header: 'Username', type: 'text', sortable: true },
    { key: 'email', header: 'Email', type: 'text', sortable: true },
    { key: 'approvalLevelText', header: 'Roles', type: 'text' },
    { key: 'teamText', header: 'Teams', type: 'text' }
  ];

  constructor(
    private partners: BusinessPartnersService,
    private route: ActivatedRoute,
    private router: Router,
    private permissionService: PermissionService
  ) {
    this.loginUserId = Number(localStorage.getItem('id') || 0);
    this.tabPermissions = {
      customers: this.permissionService.getEmptyPermission('bp-customer'),
      suppliers: this.permissionService.getEmptyPermission('bp-supplier'),
      users:     this.permissionService.getEmptyPermission('users')
    };
  }

  get columns(): TableColumn[] {
    return this.activeTab === 'customers'
      ? this.customerColumns
      : this.activeTab === 'suppliers'
        ? this.supplierColumns
        : this.userColumns;
  }

  get rowKey(): string {
    return this.activeTab === 'customers' ? 'customerId' : 'id';
  }

  get rowActions(): RowAction[] {
    return this.allUserRowActions.filter(a =>
      (a.key === 'edit'   && this.canEdit()) ||
      (a.key === 'delete' && this.canDelete())
    );
  }

  canCreate(): boolean { return this.permissionService.hasCreate(this.tabPermissions[this.activeTab]); }
  canEdit():   boolean { return this.permissionService.hasEdit(this.tabPermissions[this.activeTab]); }
  canDelete(): boolean { return this.permissionService.hasDelete(this.tabPermissions[this.activeTab]); }

  private loadAllTabPermissions(): void {
    if (!this.loginUserId) return;
    (['customers', 'suppliers', 'users'] as PartnerTab[]).forEach(tab => {
      this.permissionService.getFunctionPermission(this.loginUserId, this.tabFunctionIds[tab]).subscribe({
        next: perm => { this.tabPermissions[tab] = perm; },
        error: () => {}
      });
    });
  }

  ngOnInit(): void {
    this.loadAllTabPermissions();
    this.route.queryParamMap.subscribe(params => {
      const tab = params.get('tab');
      this.activeTab = tab === 'suppliers' || tab === 'users' ? tab : 'customers';
      this.filter.search = '';
      this.currentPage = 1;
      this.selectedRows = [];
      this.load();
    });
  }

  switchTab(tab: PartnerTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.filter.search = '';
    this.currentPage = 1;
    this.selectedRows = [];
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.sort = { key: '', dir: 'asc' };
    const request = this.activeTab === 'customers'
      ? this.partners.getCustomers()
      : this.activeTab === 'suppliers'
        ? this.partners.getSuppliers()
        : this.partners.getUsers();

    request.subscribe({
      next: response => {
        this.allData = this.partners.unwrapRows(response).map(row => this.normalizeRow(row));
        this.loading = false;
        this.applyView();
      },
      error: () => {
        this.loading = false;
        this.allData = [];
        this.tableData = [];
        this.error = `Unable to load ${this.activeTab.replace('-', ' ')} from API.`;
        void Swal.fire('Load Failed', this.error, 'error');
      }
    });
  }

  applyView(): void {
    const q = this.filter.search.trim().toLowerCase();
    let rows = q
      ? this.allData.filter(row => JSON.stringify(row).toLowerCase().includes(q))
      : [...this.allData];

    if (this.sort.key) {
      rows = rows.sort((a, b) => {
        const av = String(a?.[this.sort.key] ?? '').toLowerCase();
        const bv = String(b?.[this.sort.key] ?? '').toLowerCase();
        return this.sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }

    const start = (this.currentPage - 1) * this.pageSize;
    this.tableData = rows.slice(start, start + this.pageSize);
  }

  onSearch(): void {
    this.currentPage = 1;
    this.applyView();
  }

  onSort(sort: SortState): void {
    this.sort = sort;
    this.currentPage = 1;
    this.applyView();
  }

  onPage(page: number): void {
    this.currentPage = page;
    this.applyView();
  }

  onPageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.applyView();
  }

  onSelection(rows: any[]): void {
    this.selectedRows = rows;
  }

  onRowClick(row: any): void {
    const id = this.getId(row);
    if (!id) return;
    if (this.activeTab === 'users') {
      this.router.navigate(['/app/user-access', id]);
    } else {
      this.router.navigate(['/app/business-partners', this.activeTab, id]);
    }
  }

  onActionClick(event: { action: string; row: any }): void {
    if (event.action === 'edit') {
      this.edit(event.row);
      return;
    }
    if (event.action === 'delete') {
      this.selectedRows = [event.row];
      this.deleteSelected();
    }
  }

  create(): void {
    if (this.activeTab === 'users') {
      this.router.navigate(['/app/user-access/new']);
    } else {
      this.router.navigate(['/app/business-partners', this.activeTab, 'new']);
    }
  }

  edit(row?: any): void {
    const target = row ?? this.selectedRows[0];
    const id = this.getId(target);
    if (!id) return;
    if (this.activeTab === 'users') {
      this.router.navigate(['/app/user-access', id]);
    } else {
      this.router.navigate(['/app/business-partners', this.activeTab, id]);
    }
  }

  async deleteSelected(): Promise<void> {
    const target = this.selectedRows[0];
    const id = this.getId(target);
    if (!id) return;
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Confirm Delete',
      text: 'Deactivate/delete this record?',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#d33'
    });
    if (!result.isConfirmed) return;

    this.loading = true;
    const request = this.activeTab === 'customers'
      ? this.partners.deleteCustomer(Number(id), target?.kycId ?? target?.KycId ?? null)
      : this.activeTab === 'suppliers'
        ? this.partners.deleteSupplier(id)
        : this.partners.deleteUser(id);

    request.subscribe({
      next: async () => {
        await Swal.fire('Deleted', 'Record deleted successfully.', 'success');
        this.load();
      },
      error: () => {
        this.loading = false;
        this.error = 'Unable to delete selected partner.';
        void Swal.fire('Delete Failed', this.error, 'error');
      }
    });
  }

  private normalizeRow(row: any): any {
    if (this.activeTab === 'customers') {
      return {
        ...row,
        customerId: row?.customerId ?? row?.CustomerId ?? row?.id ?? row?.Id,
         kycId: row?.kycId ?? row?.KycId ?? row?.id ?? row?.Id ?? null,
        customerName: row?.customerName ?? row?.CustomerName ?? row?.name ?? '',
        customerCode: row?.customerCode ?? row?.CustomerCode ?? '',
        customerGroupName: row?.customerGroupName ?? row?.CustomerGroupName ?? '',
        contactPerson: row?.contactPerson ?? row?.ContactPerson ?? row?.contact ?? '',
        email: row?.email ?? row?.Email ?? '',
        phone: row?.phone ?? row?.Phone ?? '',
        statusName: row?.statusName ?? row?.StatusName ?? (row?.isActive === false ? 'Inactive' : 'Active')
      };
    }

    if (this.activeTab === 'users') {
      const approvalNames = row?.approvalLevelNames ?? row?.ApprovalLevelNames ?? [];
      const teams = row?.teams ?? row?.Teams ?? [];
      return {
        ...row,
        id: row?.id ?? row?.userId ?? row?.UserId ?? row?.Id,
        username: row?.username ?? row?.Username ?? '',
        email: row?.email ?? row?.Email ?? '',
        departmentId: row?.departmentId ?? row?.DepartmentId ?? null,
        locationId: row?.locationId ?? row?.LocationId ?? null,
        approvalLevelNames: approvalNames,
        approvalLevelText: Array.isArray(approvalNames) ? approvalNames.join(', ') : String(approvalNames || ''),
        teamText: Array.isArray(teams) ? teams.join(', ') : String(teams || ''),
        statusName: row?.isActive === false || row?.IsActive === false ? 'Inactive' : 'Active'
      };
    }

    return {
      ...row,
      id: row?.id ?? row?.supplierId ?? row?.SupplierId ?? row?.Id,
      name: row?.name ?? row?.supplierName ?? row?.SupplierName ?? '',
      contact: row?.contact ?? row?.Contact ?? row?.contactPerson ?? '',
      email: row?.email ?? row?.Email ?? '',
      phone: row?.phone ?? row?.Phone ?? '',
      countryName: row?.countryName ?? row?.CountryName ?? '',
      currencyName: row?.currencyName ?? row?.CurrencyName ?? '',
      statusName: row?.statusName ?? row?.StatusName ?? (row?.isActive === false ? 'Inactive' : 'Active')
    };
  }

  private getId(row: any): number | string | null {
    if (!row) return null;
    return this.activeTab === 'customers'
      ? row.customerId ?? row.id ?? null
      : row.id ?? row.supplierId ?? null;
  }
}
