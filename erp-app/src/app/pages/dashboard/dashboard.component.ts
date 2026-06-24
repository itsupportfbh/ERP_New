import { Component, OnInit } from '@angular/core';
import { DashboardService } from './dashboard.service';
import Swal from 'sweetalert2';

export interface KpiCard {
  title: string;
  value: string | number;
  color: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal';
  icon: string;
  change: number;
  isCount?: boolean;
}

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
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  loading = false;
  cards: KpiCard[] = [];
  roleLabel = '';
  currentRole: RoleGroup | '' = '';

  // Additional section data
  arApHealth: any = null;
  moduleHealth: any[] = [];
  sysExceptions: any[] = [];
  arAging: any = null;
  salesOverview: any = null;
  openSalesOrders: any[] = [];
  purchaseFlow: any = null;
  openPOs: any[] = [];
  myPRs: any[] = [];
  stockAlerts: any[] = [];
  topStockItems: any[] = [];
  productionOrders: any[] = [];
  topRecipes: any[] = [];

  private readonly companyId = Number(localStorage.getItem('companyId')) || 0;
  private readonly userId    = Number(localStorage.getItem('id')) || 0;

  constructor(private svc: DashboardService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const role = this.detectRole();
    this.currentRole = role;
    this.roleLabel = this.roleLabelFor(role);
    this.loading = true;
    this.cards = [];
    this.resetAdditional();

    this.apiFor(role).subscribe({
      next: (res: any) => {
        const d = res?.data ?? res?.result ?? res ?? {};
        this.cards = this.buildCards(role, d);
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Load Failed', text: err?.error?.message || 'Dashboard unavailable.', confirmButtonColor: '#0e4a60' });
      }
    });

    this.loadAdditional(role);
  }

  private resetAdditional(): void {
    this.arApHealth = null; this.moduleHealth = []; this.sysExceptions = [];
    this.arAging = null; this.salesOverview = null; this.openSalesOrders = [];
    this.purchaseFlow = null; this.openPOs = []; this.myPRs = [];
    this.stockAlerts = []; this.topStockItems = [];
    this.productionOrders = []; this.topRecipes = [];
  }

  private loadAdditional(role: RoleGroup): void {
    const c = this.companyId;
    const go = (obs: any, fn: (d: any) => void) =>
      obs.subscribe({ next: fn, error: () => {} });
    const arr = (d: any) => Array.isArray(d) ? d : (d?.data ?? d?.result ?? []);
    const obj = (d: any) => d?.data ?? d?.result ?? d;

    switch (role) {
      case 'admin':
        go(this.svc.getAdminArApHealth(c),       d => this.arApHealth    = obj(d));
        go(this.svc.getModuleHealth(c),           d => this.moduleHealth  = arr(d));
        go(this.svc.getSystemWideExceptions(c),   d => this.sysExceptions = arr(d));
        break;
      case 'finance-manager':
        go(this.svc.getARAgingData(c),            d => this.arAging       = obj(d));
        go(this.svc.getSystemWideExceptions(c),   d => this.sysExceptions = arr(d));
        break;
      case 'finance-executive':
        go(this.svc.getARAgingData(c),            d => this.arAging       = obj(d));
        break;
      case 'sales-manager':
        go(this.svc.getSalesOverview(c),          d => this.salesOverview    = obj(d));
        go(this.svc.getOpenSalesOrders(c),        d => this.openSalesOrders  = arr(d));
        go(this.svc.getARAgingData(c),            d => this.arAging          = obj(d));
        break;
      case 'sales-executive':
        go(this.svc.getOpenSalesOrders(c),        d => this.openSalesOrders  = arr(d));
        go(this.svc.getARAgingData(c),            d => this.arAging          = obj(d));
        break;
      case 'procurement-manager':
        go(this.svc.getPurchaseFlowDashboard(c),  d => this.purchaseFlow = obj(d));
        go(this.svc.getOpenPurchaseOrders(c),     d => this.openPOs      = arr(d));
        break;
      case 'procurement-executive':
        go(this.svc.getMyPurchaseRequests(c, this.userId), d => this.myPRs   = arr(d));
        go(this.svc.getOpenPurchaseOrders(c),              d => this.openPOs = arr(d));
        break;
      case 'inventory-manager':
      case 'inventory-execution':
      case 'store-incharge':
        go(this.svc.getStockAlerts(c),    d => this.stockAlerts   = arr(d));
        go(this.svc.getTopStockItems(c),  d => this.topStockItems = arr(d));
        break;
      case 'production-manager':
      case 'recipe-production':
        go(this.svc.getProductionOrders(c), d => this.productionOrders = arr(d));
        go(this.svc.getTopRecipes(c),       d => this.topRecipes       = arr(d));
        break;
    }
  }

  private detectRole(): RoleGroup {
    let roles: string[] = [];
    try { roles = JSON.parse(localStorage.getItem('approvalRoles') || '[]'); } catch {}
    const r = (roles[0] || '').toLowerCase().trim();

    if (r.includes('super admin') || r.includes('admin'))                     return 'admin';
    if (r.includes('finance manager'))                                        return 'finance-manager';
    if (r.includes('finance'))                                                return 'finance-executive';
    if (r.includes('sales manager'))                                          return 'sales-manager';
    if (r.includes('sales'))                                                  return 'sales-executive';
    if (r.includes('procurement manager') || r.includes('purchase manager')) return 'procurement-manager';
    if (r.includes('procurement') || r.includes('purchase'))                 return 'procurement-executive';
    if (r.includes('inventory manager'))                                      return 'inventory-manager';
    if (r.includes('store'))                                                  return 'store-incharge';
    if (r.includes('inventory'))                                              return 'inventory-execution';
    if (r.includes('recipe'))                                                 return 'recipe-production';
    if (r.includes('production'))                                             return 'production-manager';
    return 'admin';
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

  private apiFor(role: RoleGroup) {
    switch (role) {
      case 'finance-manager':       return this.svc.getFinanceSummaryDashboard(this.companyId);
      case 'finance-executive':     return this.svc.getFinanceOpsDashboard(this.companyId);
      case 'sales-manager':         return this.svc.getSalesManagerDashboard(this.companyId);
      case 'sales-executive':       return this.svc.getSalesExecutive(this.companyId);
      case 'procurement-manager':   return this.svc.getPurchaseDashboard(this.companyId);
      case 'procurement-executive': return this.svc.getPurchaseUserDashboard(this.companyId, this.userId);
      case 'inventory-manager':     return this.svc.getInventoryManagerKpi(this.companyId);
      case 'inventory-execution':   return this.svc.getInventoryKpiDashboard(this.companyId);
      case 'store-incharge':        return this.svc.getInventorySummary(this.companyId);
      case 'production-manager':    return this.svc.getProductionManagerKpi(this.companyId);
      case 'recipe-production':     return this.svc.getRecipeProductionDashboard(this.companyId);
      default:                      return this.svc.getAdminSummaryDashboard(this.companyId);
    }
  }

  private buildCards(role: RoleGroup, d: any): KpiCard[] {
    const amt = (v: any) => this.formatAmount(Number(v) || 0);
    const num = (v: any) => Number(v) || 0;

    switch (role) {
      case 'admin': return [
        { title: 'Total Revenue',  value: amt(d.totalRevenue),  color: 'blue',   icon: 'dollar', change: 0 },
        { title: 'Total Payables', value: amt(d.totalPayables), color: 'orange', icon: 'card',   change: 0 },
        { title: 'Total SKUs',     value: num(d.totalSkus),     color: 'teal',   icon: 'box',    change: 0, isCount: true },
        { title: 'All Exceptions', value: num(d.allExceptions), color: 'red',    icon: 'alert',  change: 0, isCount: true },
      ];
      case 'finance-manager': return [
        { title: 'Total Revenue',  value: amt(d.totalRevenue),  color: 'blue',   icon: 'dollar',    change: num(d.totalRevenueChangePercent) },
        { title: 'Collections',    value: amt(d.collections),   color: 'green',  icon: 'briefcase', change: num(d.collectionsChangePercent) },
        { title: 'Total Payables', value: amt(d.totalPayables), color: 'orange', icon: 'card',      change: num(d.totalPayablesChangePercent) },
        { title: 'Exceptions',     value: num(d.exceptions),    color: 'red',    icon: 'alert',     change: num(d.exceptionsChange), isCount: true },
      ];
      case 'finance-executive': return [
        { title: 'Open AR Invoices', value: num(d.openArInvoices),   color: 'blue',   icon: 'invoice', change: num(d.openArInvoicesChange), isCount: true },
        { title: 'AP Due Today',     value: num(d.apDueToday),       color: 'orange', icon: 'card',    change: num(d.apDueTodayChange), isCount: true },
        { title: '3-Way Mismatch',   value: amt(d.threeWayMismatch), color: 'red',    icon: 'alert',   change: num(d.threeWayMismatchChangePercent) },
      ];
      case 'sales-manager': return [
        { title: 'Total Revenue',    value: amt(d.totalRevenue ?? d.TotalRevenue),       color: 'blue',  icon: 'dollar',    change: 0 },
        { title: 'Active Customers', value: num(d.activeCustomers ?? d.ActiveCustomers), color: 'green', icon: 'users',     change: 0, isCount: true },
        { title: 'Avg Deal Size',    value: amt(d.avgDealSize ?? d.AvgDealSize),          color: 'teal',  icon: 'briefcase', change: 0 },
        { title: 'AR Overdue',       value: amt(d.arOverdue ?? d.ArOverdue),              color: 'red',   icon: 'alert',     change: 0 },
      ];
      case 'sales-executive': return [
        { title: 'Quotations',   value: num(d.quotation),   color: 'blue',   icon: 'doc',     change: 0, isCount: true },
        { title: 'Sales Orders', value: num(d.salesOrders), color: 'green',  icon: 'so',      change: 0, isCount: true },
        { title: 'Deliveries',   value: num(d.deliveries),  color: 'orange', icon: 'truck',   change: 0, isCount: true },
        { title: 'Invoices',     value: num(d.invoices),    color: 'teal',   icon: 'invoice', change: 0, isCount: true },
      ];
      case 'procurement-manager': return [
        { title: 'Open PRs',       value: num(d.openPrs),       color: 'blue',   icon: 'pr',   change: num(d.openPrsChange), isCount: true },
        { title: 'Open POs',       value: num(d.openPos),       color: 'green',  icon: 'po',   change: num(d.openPosChange), isCount: true },
        { title: 'Pending GRN',    value: num(d.pendingGrn),    color: 'orange', icon: 'grn',  change: num(d.pendingGrnChange), isCount: true },
        { title: 'AP Outstanding', value: amt(d.apOutstanding), color: 'red',    icon: 'card', change: num(d.apOutstandingChangePercent) },
      ];
      case 'procurement-executive': return [
        { title: 'My Open PRs', value: num(d.myOpenPrs),  color: 'blue',   icon: 'pr',  change: num(d.myOpenPrsChange), isCount: true },
        { title: 'Pending GRN', value: num(d.pendingGrn), color: 'orange', icon: 'grn', change: num(d.pendingGrnChange), isCount: true },
        { title: 'Open PINs',   value: num(d.openPins),   color: 'red',    icon: 'pin', change: num(d.openPinsChange), isCount: true },
      ];
      case 'inventory-manager': return [
        { title: 'Total SKUs',     value: num(d.totalSkus),     color: 'blue',   icon: 'box',   change: num(d.totalSkusChange), isCount: true },
        { title: 'Below Min',      value: num(d.belowMin),      color: 'orange', icon: 'alert', change: num(d.belowMinChange), isCount: true },
        { title: 'Negative Stock', value: num(d.negativeStock), color: 'red',    icon: 'alert', change: num(d.negativeStockChange), isCount: true },
        { title: 'Slow Moving',    value: num(d.slowMoving),    color: 'purple', icon: 'clock', change: num(d.slowMovingChange), isCount: true },
      ];
      case 'inventory-execution': return [
        { title: 'Available SKUs', value: num(d.availableSkus), color: 'blue',   icon: 'box',   change: num(d.availableSkusChange), isCount: true },
        { title: 'Below Min',      value: num(d.belowMin),      color: 'orange', icon: 'alert', change: num(d.belowMinChange), isCount: true },
        { title: 'New Items',      value: num(d.newItems),      color: 'green',  icon: 'plus',  change: num(d.newItemsChange), isCount: true },
      ];
      case 'store-incharge': return [
        { title: 'Total SKUs',  value: num(d.totalSkus),     color: 'blue',   icon: 'box',   change: 0, isCount: true },
        { title: 'GRN Pending', value: num(d.grnPending),    color: 'orange', icon: 'grn',   change: 0, isCount: true },
        { title: 'Neg. Stock',  value: num(d.negativeStock), color: 'red',    icon: 'alert', change: 0, isCount: true },
      ];
      case 'production-manager': return [
        { title: 'Total Recipes',   value: num(d.totalRecipes ?? d.TotalRecipes),         color: 'blue',   icon: 'recipe', change: 0, isCount: true },
        { title: 'Prod. Orders',    value: num(d.productionOrders ?? d.ProductionOrders), color: 'green',  icon: 'po',     change: 0, isCount: true },
        { title: 'Avg Recipe Cost', value: amt(d.avgRecipeCost ?? d.AvgRecipeCost),       color: 'orange', icon: 'dollar', change: 0 },
        { title: 'Raw Materials',   value: num(d.rawMaterials ?? d.RawMaterials),         color: 'teal',   icon: 'box',    change: 0, isCount: true },
        { title: 'Pending Orders',  value: num(d.pendingOrders ?? d.PendingOrders),       color: 'red',    icon: 'clock',  change: 0, isCount: true },
      ];
      case 'recipe-production': return [
        { title: 'Open Orders',     value: num(d.openOrders),     color: 'blue',   icon: 'box',     change: num(d.openOrdersChange), isCount: true },
        { title: 'Completed Today', value: num(d.completedToday), color: 'green',  icon: 'invoice', change: num(d.completedTodayChange), isCount: true },
        { title: 'Active Recipes',  value: num(d.activeRecipes),  color: 'orange', icon: 'recipe',  change: num(d.activeRecipesChange), isCount: true },
      ];
      default: return [];
    }
  }

  // ── Template helpers ────────────────────────────────────────────────────────
  formatAmount(value: any): string {
    const v = Number(value) || 0;
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
    if (v >= 100000)   return `₹${(v / 100000).toFixed(1)}L`;
    return `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
  }

  absChange(v: number): number { return Math.abs(Number(v) || 0); }

  ovPct(val: any, ov: any): number {
    const max = Math.max(Number(ov?.quotation) || 0, Number(ov?.salesOrders) || 0, Number(ov?.deliveries) || 0, Number(ov?.invoices) || 0);
    return max > 0 ? Math.round((Number(val) || 0) / max * 100) : 0;
  }

  prStatusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('approved') || s.includes('po raised')) return 'badge-sm-success';
    if (s.includes('pending')) return 'badge-sm-warn';
    return 'badge-sm-info';
  }

  alertClass(issue: string): string {
    return (issue || '').toLowerCase().includes('negative') ? 'badge-sm-danger' : 'badge-sm-warn';
  }

  prodStatusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('done') || s.includes('complet')) return 'st-done';
    if (s.includes('progress'))                      return 'st-progress';
    if (s.includes('overdue'))                       return 'st-overdue';
    return 'st-pending';
  }

  recipeColor(i: number): string {
    return ['img-blue', 'img-green', 'img-beige', 'img-purple'][i % 4];
  }
}
