import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { MaterialRequisitionService } from 'app/main/material-requisation/material-requisition.service';
import { SalesService } from 'app/pages/sales/sales.service';
import { AuthService } from '../../core/services/auth.service';

type RoleGroup =
  | 'admin'
  | 'finance-manager'
  | 'finance-executive'
  | 'sales-manager'
  | 'sales-executive'
  | 'procurement-manager'
  | 'procurement-executive'
  | 'inventory-manager'
  | 'inventory-execution'
  | 'store-incharge'
  | 'production-manager'
  | 'recipe-production';

@Component({
  selector: 'erp-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class DashboardComponent implements OnInit {
  loading = false;
  roleLabel = '';
  /** Role views the user qualifies for, from their approval levels. */
  activeRoles: RoleGroup[] = [];

  readonly companyId = Number(localStorage.getItem('companyId')) || 0;

  /**
   * The cross-company "Pending Material Requests" widget belongs to the HQ
   * company (1), which fulfils other companies' requisitions. "All companies"
   * mode (companyId 0) is a superset view, so it must see the widget too -
   * otherwise selecting All Companies hides data that a single-company HQ login
   * would show.
   */
  get canSeeCrossCompanyMr(): boolean { return this.companyId === 1 || this.companyId === 0; }

  pendingMrRequests: any[] = [];
  mrLoading = false;

  pendingFulfillment: any[] = [];
  pfLoading = false;

  constructor(
    private mrService: MaterialRequisitionService,
    private salesSvc: SalesService,
    private router: Router,
    private auth: AuthService
  ) {}

  goToMrList(): void {
    this.router.navigate(['/app/inventory/list-material-requisition']);
  }

  goToPendingFulfillment(): void {
    this.router.navigate(['/app/sales/pending-fulfillment']);
  }

  loadPendingFulfillment(): void {
    this.pfLoading = true;
    this.salesSvc.getPendingFulfillment().subscribe({
      next: (res: any) => {
        const list: any[] = res?.data ?? res ?? [];
        this.pendingFulfillment = Array.isArray(list) ? list : [];
        this.pfLoading = false;
      },
      error: () => { this.pfLoading = false; }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    // The user's approval-level roles decide which child widget components render.
    // Each widget self-loads its own data, so the parent only resolves roles here.
    this.activeRoles = this.detectRoles();
    this.roleLabel = this.activeRoles.map(r => this.roleLabelFor(r)).join('  +  ');
    this.loading = false;

    // Pending widgets are only shown to Procurement Executive.
    if (this.showRole('procurement-executive')) {
      if (this.canSeeCrossCompanyMr) {
        this.loadPendingMrRequests();
      }
      this.loadPendingFulfillment();
    }
  }

  loadPendingMrRequests(): void {
    this.mrLoading = true;
    this.mrService.GetMaterialRequest().subscribe({
      next: (res: any) => {
        const list: any[] = res?.data ?? res ?? [];
        this.pendingMrRequests = (Array.isArray(list) ? list : [])
          .filter((x: any) => Number(x.companyId ?? 0) !== 1 && (x.status ?? 0) === 1);
        this.mrLoading = false;
      },
      error: () => { this.mrLoading = false; }
    });
  }

  /**
   * Resolve the dashboard views purely from the user's approval-level roles
   * (`approvalRoles` in localStorage = UserApprovalLevel → ApprovalLevel names for this user id).
   * Each assigned role adds its own widget set; department is NOT used.
   */
  private detectRoles(): RoleGroup[] {
    let roles: string[] = [];
    try { roles = JSON.parse(localStorage.getItem('approvalRoles') || '[]'); } catch {}

    const out = new Set<RoleGroup>();
    if (this.auth.isSuperAdmin()) out.add('admin');
    for (const raw of roles) {
      const s = (raw || '').toLowerCase().trim();
      if (!s) continue;
      if (s.includes('super admin') || s.includes('system administrator') || s === 'admin') out.add('admin');
      else if (s.includes('finance manager'))                                        out.add('finance-manager');
      else if (s.includes('finance'))                                                out.add('finance-executive');
      else if (s.includes('sales manager'))                                          out.add('sales-manager');
      else if (s.includes('sales'))                                                  out.add('sales-executive');
      else if (s.includes('procurement manager') || s.includes('purchase manager')) out.add('procurement-manager');
      else if (s.includes('procurement') || s.includes('purchase'))                 out.add('procurement-executive');
      else if (s.includes('store'))                                                  out.add('store-incharge');
      else if (s.includes('inventory manager'))                                      out.add('inventory-manager');
      else if (s.includes('inventory'))                                              out.add('inventory-execution');
      else if (s.includes('recipe') || s.includes('production executive'))           out.add('recipe-production');
      else if (s.includes('production'))                                             out.add('production-manager');
    }
    return Array.from(out);
  }

  /** True when the given role view is active for the current user (used by the template). */
  showRole(role: RoleGroup): boolean {
    return this.activeRoles.includes(role);
  }

  private roleLabelFor(role: RoleGroup): string {
    switch (role) {
      case 'admin':                 return 'Admin Overview';
      case 'finance-manager':       return 'Finance Manager';
      case 'finance-executive':     return 'Finance Executive';
      case 'sales-manager':         return 'Sales Manager';
      case 'sales-executive':       return 'Sales Executive';
      case 'procurement-manager':   return 'Procurement Manager';
      case 'procurement-executive': return 'Procurement Executive';
      case 'inventory-manager':     return 'Inventory Manager';
      case 'inventory-execution':   return 'Inventory Execution';
      case 'store-incharge':        return 'Store In-Charge';
      case 'production-manager':    return 'Production Manager';
      case 'recipe-production':     return 'Recipe Production';
    }
  }

}
