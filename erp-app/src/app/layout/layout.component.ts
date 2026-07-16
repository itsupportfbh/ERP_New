import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { forkJoin, Subscription, filter } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';
import { CurrentPeriodLockState, PeriodLockStateService } from '../core/services/period-lock-state.service';
import { MasterService } from '../core/services/master.service';

interface MenuItem {
  label: string;
  icon: string;
  route?: string;
  queryParams?: Record<string, string>;
  children?: MenuItem[];
  permId?: string;
}

@Component({
  selector: 'erp-layout',
  standalone: false,
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit, OnDestroy {
  sidebarOpen = true;
  userMenuOpen = false;
  openMenus = new Set<string>();

  private routerSub!: Subscription;
  private periodLockSub?: Subscription;

  viewableIds = new Set<string>();
  permLoaded = false;
  showAll = false;
  currentPeriodLocked = false;
  currentPeriodName = '';

  private readonly menuReloadHandler = () => this.loadMenuPermissions();

  get userName(): string { return localStorage.getItem('username') ?? localStorage.getItem('email') ?? 'User'; }
  get userInitial(): string { return (this.userName.charAt(0) || 'U').toUpperCase(); }
  get companyName(): string {
    const c = localStorage.getItem('companyName');
    return c && c !== 'null' && c !== 'undefined' ? c : '';
  }

  hasChildren(menu: MenuItem): boolean { return !!(menu.children?.length); }

  menus: MenuItem[] = [
    { label: 'Dashboard', icon: 'home', route: '/app/dashboard' },
     {
      label: 'Master',
      icon: 'master',
      children: [
        { label: 'Approval Level',  icon: 'm-approval',  route: '/app/master/approval-level',  permId: 'approval-level' },
        { label: 'Bank',            icon: 'm-bank',      route: '/app/master/bank-list',        permId: 'bank' },
        { label: 'Bin',             icon: 'm-bin',       route: '/app/master/bin',              permId: 'bin' },
        { label: 'Category',        icon: 'm-category',  route: '/app/master/catagory',         permId: 'catagory' },
        { label: 'Cities',          icon: 'm-cities',    route: '/app/master/cities',           permId: 'cities' },
        { label: 'Costing Method',  icon: 'm-costing',   route: '/app/master/coastingmethod',   permId: 'costingmethod' },
        { label: 'Company',         icon: 'm-company',   route: '/app/master/companyList',      permId: 'company' },
        { label: 'Countries',       icon: 'm-countries', route: '/app/master/countries',        permId: 'countries' },
        { label: 'Currency',        icon: 'm-currency',  route: '/app/master/currency',         permId: 'currency' },
        { label: 'Customer Groups', icon: 'm-custgrp',   route: '/app/master/customergroups',   permId: 'customergroups' },
        { label: 'Department',      icon: 'm-dept',      route: '/app/master/department',       permId: 'department' },
        { label: 'Department Menu Access', icon: 'm-dept', route: '/app/master/department-menu-access', permId: 'department-menu-access' },
        { label: 'Driver',          icon: 'm-driver',    route: '/app/master/driver',           permId: 'driver' },
        { label: 'Exchange Rate',   icon: 'm-exchange',  route: '/app/master/exchangerate',     permId: 'exchangerate' },
        { label: 'Flag Issue',      icon: 'm-flag',      route: '/app/master/flagIssue',        permId: 'flagissue' },
        { label: 'Incoterms',       icon: 'm-incoterms', route: '/app/master/incoterms',        permId: 'incoterms' },
        { label: 'Item Type',       icon: 'm-itemtype',  route: '/app/master/itemType',         permId: 'itemType' },
        { label: 'Item Set',        icon: 'm-itemset',   route: '/app/master/itemSet',          permId: 'itemSet' },
        { label: 'Outlet',          icon: 'm-location',  route: '/app/master/location',         permId: 'location' },
        { label: 'Payment Terms',   icon: 'm-payment',   route: '/app/master/paymentTerms',     permId: 'paymentTerms' },
        { label: 'Recurring',       icon: 'm-recurring', route: '/app/master/recurring',        permId: 'recurring' },
        { label: 'Service',         icon: 'm-service',   route: '/app/master/service',          permId: 'service' },
        { label: 'States',          icon: 'm-states',    route: '/app/master/states',           permId: 'states' },
        { label: 'Stock Issue',     icon: 'm-stock',     route: '/app/master/stockIssue',       permId: 'stockissue' },
        { label: 'Frequency',       icon: 'm-strategy',  route: '/app/master/strategy',         permId: 'strategy' },
        { label: 'Supplier Groups', icon: 'm-suppgrp',   route: '/app/master/suppliergroups',   permId: 'suppliergroups' },
        { label: 'Tax Code',        icon: 'm-tax',       route: '/app/master/taxcode',          permId: 'taxcode' },
        { label: 'UOM',             icon: 'm-uom',       route: '/app/master/uom',              permId: 'uom' },
        { label: 'UOM Conversion',  icon: 'm-uomconv',   route: '/app/master/uomconversion',    permId: 'uomconversion' },
        { label: 'Vehicle',         icon: 'm-vehicle',   route: '/app/master/vehicle',          permId: 'vehicle' },
        { label: 'Warehouse',       icon: 'm-warehouse', route: '/app/master/warehouse',        permId: 'warehouse' },
      ]
    },
    {
      label: 'Business Partners',
      icon: 'partners',
      children: [
        { label: 'Customer', icon: 'customer', route: '/app/business-partners', queryParams: { tab: 'customers' }, permId: 'bp-customer' },
        { label: 'Supplier', icon: 'supplier', route: '/app/business-partners', queryParams: { tab: 'suppliers' }, permId: 'bp-supplier' },
        { label: 'Users',    icon: 'users',    route: '/app/business-partners', queryParams: { tab: 'users' },     permId: 'users' },
      ]
    },
     {
      label: 'Sales',
      icon: 'sales',
      children: [
        { label: 'Quotation',          icon: 'quote',    route: '/app/sales/quotations',       permId: 'qt-list' },
        { label: 'Sales Order',        icon: 'so',       route: '/app/sales/orders',            permId: 'so-list' },
        { label: 'Picking & Packing',  icon: 'pick',     route: '/app/sales/picking',           permId: 'sales-pp-list' },
        { label: 'Delivery Order',     icon: 'delivery', route: '/app/sales/delivery-orders',   permId: 'do-list2' },
        { label: 'Sales Invoice',      icon: 'invoice',  route: '/app/sales/invoices',          permId: 'si-list' },
        { label: 'Return / Credit',    icon: 'credit',   route: '/app/sales/credit-notes',      permId: 'cn-list' },
        { label: 'Report',             icon: 'report',   route: '/app/sales/reports',           permId: 'sales-report' },
      ]
    },
    {
      label: 'Purchase',
      icon: 'purchase',
      children: [
        { label: 'Purchase Request', icon: 'pr',        route: '/app/purchase/requests',         permId: 'pr-list' },
        { label: 'Purchase Order',   icon: 'po',        route: '/app/purchase/orders',           permId: 'po-list' },
        { label: 'RFQ',              icon: 'rfq',       route: '/app/purchase/rfq',              permId: 'rfq' },
        { label: 'Good Receipt',     icon: 'grn',       route: '/app/purchase/grn',              permId: 'grn-list' },
        { label: 'Mobile Receiving', icon: 'grn',       route: '/app/purchase/mobile-receiving', permId: 'mobilereceiving' },
        { label: 'Supplier Invoice', icon: 'invoice',   route: '/app/purchase/supplier-invoice', permId: 'pin-list' },
        { label: 'Debit Note',       icon: 'debit',     route: '/app/purchase/debit-note',       permId: 'dn-list' },
        { label: 'Scorecard',        icon: 'scorecard', route: '/app/purchase/scorecard',        permId: 'supplier-scorecard' },
        { label: 'Pending Fulfillment', icon: 'pr',     route: '/app/purchase/pending-fulfillment', permId: 'pr-list' },
      ]
    },
        {
      label: 'Inventory',
      icon: 'inventory',
      children: [
        { label: 'Item Master',            icon: 'inv-item',    route: '/app/inventory/List-itemmaster',           permId: 'im-list' },
        { label: 'Stock Take',             icon: 'inv-take',    route: '/app/inventory/list-stocktake',            permId: 'stocktake-list' },
        { label: 'Stock Adjustment',       icon: 'inv-take',    route: '/app/inventory/list-stockadjustment',      permId: 'stock-adjustment' },
        { label: 'Stock Reorder Planning', icon: 'inv-reorder', route: '/app/inventory/list-stockreorderplanning', permId: 'reorder-list' },
        { label: 'Stock COGS',             icon: 'inv-cogs',    route: '/app/inventory/stockcogs',                 permId: 'stockcogs' },
        { label: 'Stock History',          icon: 'inv-history', route: '/app/inventory/list-stock-history',        permId: 'list-stock-history' },
        {
          label: 'Internal',
          icon: 'inv-internal',
          children: [
            { label: 'Material Request',       icon: 'inv-mr',       route: '/app/inventory/list-material-requisition', permId: 'mr-list' },
            { label: 'Stock Transfer Request', icon: 'inv-transfer', route: '/app/inventory/list-stock-transfer-receipt', permId: 'list-stock-transfer-receipt' },
          ]
        },
      ]
    },
    {
      label: 'Financial',
      icon: 'finance',
      children: [
        { label: 'General Ledger',      icon: 'ledger',  route: '/app/finance/general-ledger',    permId: 'ledger' },
        { label: 'Chart of Account',    icon: 'ledger',  route: '/app/finance/chart-of-accounts', permId: 'coa' },
        { label: 'Journal',             icon: 'journal', route: '/app/finance/journal',           permId: 'journal' },
        { label: 'Accounts Receivable', icon: 'ar',      route: '/app/finance/ar',                permId: 'ar' },
        { label: 'Accounts Payable',    icon: 'ap',      route: '/app/finance/accounts-payable',  permId: 'ap' },
        { label: 'Tax & Gst',           icon: 'tax',     route: '/app/finance/tax-gst',           permId: 'tax' },
        { label: 'Period-close',        icon: 'close',   route: '/app/finance/period-close',      permId: 'period' },
        { label: 'Year End Close',      icon: 'close',   route: '/app/finance/year-end-close',    permId: 'year-end' },
        { label: 'Trial Balance',       icon: 'report',  route: '/app/finance/trial-balance',     permId: 'tb' },
        { label: 'Bank Reconciliation', icon: 'ledger',  route: '/app/finance/bank-reconciliation' },
        { label: 'Reports',             icon: 'report',  route: '/app/finance/reports',           permId: 'reports' },
      ]
    },
      {
      label: 'Recipe',
      icon: 'recipe',
      children: [
        { label: 'Recipe Master',        icon: 'recipe', route: '/app/recipe/recipes',              permId: 'recipe-list' },
        { label: 'Production Planning', icon: 'plan',   route: '/app/recipe/production-planning',  permId: 'pp-list' },
        { label: 'Batch Production',    icon: 'batch',  route: '/app/recipe/batch-production',     permId: 'bp-list' },
      ]
    },
  ];

  filteredMenus: MenuItem[] = this.menus;
  menuSearch = '';

  get searchedMenus(): MenuItem[] {
    const term = this.menuSearch.trim().toLowerCase();
    if (!term) return this.filteredMenus;

    const result: MenuItem[] = [];
    for (const m of this.filteredMenus) {
      if (!m.children?.length) {
        if (m.label.toLowerCase().includes(term)) result.push(m);
        continue;
      }
      const parentMatches = m.label.toLowerCase().includes(term);
      const filteredChildren = (m.children || [])
        .map(child => {
          if (!child.children?.length) {
            return (parentMatches || child.label.toLowerCase().includes(term)) ? child : null;
          }
          const gcMatches = child.children.filter(gc => gc.label.toLowerCase().includes(term));
          const childMatches = parentMatches || child.label.toLowerCase().includes(term);
          if (childMatches || gcMatches.length > 0) {
            return { ...child, children: childMatches ? child.children : gcMatches };
          }
          return null;
        })
        .filter((c): c is MenuItem => c !== null);

      if (parentMatches || filteredChildren.length > 0) {
        result.push({ ...m, children: parentMatches ? m.children : filteredChildren });
      }
    }
    return result;
  }

  private applyMenuFilter(): void {
    if (this.showAll || !this.permLoaded) {
      this.filteredMenus = this.menus;
      return;
    }
    this.filteredMenus = this.menus
      .map(m => {
        if (!m.children?.length) {
          return (!m.permId || this.viewableIds.has(m.permId)) ? m : null;
        }
        const visibleChildren = m.children
          .map(child => {
            if (!child.children?.length) {
              return (!child.permId || this.viewableIds.has(child.permId)) ? child : null;
            }
            const visibleGrandchildren = child.children.filter(
              gc => !gc.permId || this.viewableIds.has(gc.permId)
            );
            return visibleGrandchildren.length ? { ...child, children: visibleGrandchildren } : null;
          })
          .filter((c): c is MenuItem => c !== null);
        return visibleChildren.length ? { ...m, children: visibleChildren } : null;
      })
      .filter((m): m is MenuItem => m !== null);
  }

  constructor(
    private auth: AuthService,
    private router: Router,
    private permissionService: PermissionService,
    private periodLockState: PeriodLockStateService,
    private masterSvc: MasterService
  ) {
    this.showAll = this.auth.isSuperAdmin();
    window.addEventListener('menu-permission-updated', this.menuReloadHandler);
  }

  ngOnInit(): void {
     this.masterSvc.cacheCompanyLogo();
    this.syncOpenMenuFromUrl(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: NavigationEnd) => this.syncOpenMenuFromUrl(e.urlAfterRedirects));

    if (this.showAll) {
      this.permLoaded = true;
      this.applyMenuFilter();
    } else {
      this.loadMenuPermissions();
    }

    this.periodLockSub = this.periodLockState.currentState$.subscribe((state: CurrentPeriodLockState) => {
      this.currentPeriodLocked = !!state.isLocked;
      this.currentPeriodName = state.periodName || '';
    });
    this.periodLockState.refresh().subscribe({ error: () => {} });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    this.periodLockSub?.unsubscribe();
    window.removeEventListener('menu-permission-updated', this.menuReloadHandler);
  }

  private syncOpenMenuFromUrl(url: string): void {
    for (const menu of this.menus) {
      if (menu.children?.length && this.menuContainsUrl(menu, url)) {
        const toOpen = new Set<string>([menu.label]);
        // Also open any level-2 parent that contains the active URL
        for (const child of menu.children) {
          if (child.children?.length && this.menuContainsUrl(child, url)) {
            toOpen.add(child.label);
          }
        }
        this.openMenus = toOpen;
        return;
      }
    }
    this.openMenus = new Set();
  }

  private menuContainsUrl(menu: MenuItem, url: string): boolean {
    if (!menu.children) return false;
    for (const child of menu.children) {
      if (child.route) {
        if (url.startsWith(child.route)) return true;
        // Also match create/edit pages under the same module directory
        const lastSlash = child.route.lastIndexOf('/');
        if (lastSlash > 5) {
          const moduleDir = child.route.substring(0, lastSlash + 1);
          if (url.startsWith(moduleDir)) return true;
        }
      }
      if (child.children?.length && this.menuContainsUrl(child, url)) return true;
    }
    return false;
  }

  loadMenuPermissions(): void {
    if (this.showAll) {
      this.permLoaded = true;
      this.applyMenuFilter();
      return;
    }
    const userId = Number(localStorage.getItem('id') || 0);
    if (!userId) {
      this.permLoaded = true;
      return;
    }

    const allPermIds: string[] = [];
    const collectPermIds = (items: MenuItem[]) => {
      for (const item of items) {
        if (item.permId) allPermIds.push(item.permId);
        if (item.children) collectPermIds(item.children);
      }
    };
    collectPermIds(this.menus);

    forkJoin(allPermIds.map(permId =>
      this.permissionService.getFunctionPermission(userId, permId)
    )).subscribe({
      next: (results: FunctionPermission[]) => {
        this.viewableIds = new Set(
          results
            .map((perm, i) => (perm?.view ? allPermIds[i] : null))
            .filter((id): id is string => id !== null)
        );
        this.permLoaded = true;
        this.applyMenuFilter();
      },
      error: () => {
        this.showAll = true;
        this.permLoaded = true;
        this.applyMenuFilter();
      }
    });
  }

  logout(): void { this.auth.logout(); }

  toggleMenu(menu: MenuItem): void {
    if (!menu.children?.length) return;
    const topLevelLabels = new Set(this.menus.filter(m => m.children?.length).map(m => m.label));
    const isTopLevel = topLevelLabels.has(menu.label);
    if (this.openMenus.has(menu.label)) {
      const next = new Set(this.openMenus);
      next.delete(menu.label);
      this.openMenus = next;
    } else if (isTopLevel) {
      const next = new Set<string>();
      this.openMenus.forEach(label => { if (!topLevelLabels.has(label)) next.add(label); });
      next.add(menu.label);
      this.openMenus = next;
    } else {
      this.openMenus = new Set([...this.openMenus, menu.label]);
    }
  }

  isOpen(menu: MenuItem): boolean {
    if (this.menuSearch.trim()) return true;
    return this.openMenus.has(menu.label);
  }

  isMenuActive(menu: MenuItem): boolean {
    if (menu.route && this.router.url.startsWith(menu.route)) return true;
    return this.menuContainsUrl(menu, this.router.url.split('?')[0]);
  }

  isChildActive(menu: MenuItem): boolean {
    if (!menu.route) return false;
    // Business Partners tabs use queryParams — exact match only
    if (menu.queryParams) {
      const tree = this.router.createUrlTree([menu.route], { queryParams: menu.queryParams });
      return this.router.isActive(tree, {
        paths: 'exact', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored'
      });
    }
    const url = this.router.url.split('?')[0];
    // Direct prefix match — handles /app/purchase/requests/new, /app/purchase/requests/:id
    if (url.startsWith(menu.route)) return true;
    // Key match — handles Create/Edit pages whose URL segment differs from the list route
    // e.g. /app/inventory/Create-itemmaster  →  activates /app/inventory/List-itemmaster
    const moduleDir = menu.route.substring(0, menu.route.lastIndexOf('/') + 1);
    if (moduleDir.length > 5 && url.startsWith(moduleDir)) {
      const menuKey = this.routeKey(menu.route);
      const urlKey  = this.routeKey(url);
      return menuKey.length > 0 && menuKey === urlKey;
    }
    return false;
  }

  private routeKey(route: string): string {
    const parts = route.split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p && !p.startsWith(':') && !/^\d+$/.test(p)) {
        return p.replace(/^(list|create|edit|update|view|details|new)-?/i, '').toLowerCase();
      }
    }
    return '';
  }
}
