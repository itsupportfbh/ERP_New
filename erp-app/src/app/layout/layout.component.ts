import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../core/services/auth.service';
import { SidebarService } from '../core/services/sidebar.service';

interface MenuItem {
  label: string;
  icon: string;
  route?: string;
  queryParams?: Record<string, string>;
  children?: MenuItem[];
}

@Component({
  selector: 'erp-layout',
  standalone: false,
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit, OnDestroy {
  private routerSub!: Subscription;
  get sidebarOpen(): boolean { return this.sidebar.sidebarOpen; }
  set sidebarOpen(val: boolean) { this.sidebar.setSidebar(val); }
  get openMenus(): Set<string> { return this.sidebar.openMenus; }

  userMenuOpen = false;
  get userName(): string { return localStorage.getItem('username') || 'User'; }
  get userInitial(): string { return (this.userName[0] || 'U').toUpperCase(); }

  menus: MenuItem[] = [
    { label: 'Dashboard', icon: 'home', route: '/app/dashboard' },
    {
      label: 'Business Partners',
      icon: 'partners',
      children: [
        { label: 'Customer', icon: 'customer', route: '/app/business-partners', queryParams: { tab: 'customers' } },
        { label: 'Supplier', icon: 'supplier', route: '/app/business-partners', queryParams: { tab: 'suppliers' } },
        { label: 'Users', icon: 'users', route: '/app/business-partners', queryParams: { tab: 'users' } },
      ]
    },
    {
      label: 'Purchase',
      icon: 'purchase',
      children: [
        { label: 'Purchase Request', icon: 'pr',       route: '/app/purchase/requests' },
        { label: 'Purchase Order',   icon: 'po',       route: '/app/purchase/orders' },
        { label: 'RFQ',              icon: 'rfq',      route: '/app/purchase/rfq' },
        { label: 'Good Receipt',     icon: 'grn',      route: '/app/purchase/grn' },
        { label: 'Supplier Invoice', icon: 'invoice',  route: '/app/purchase/supplier-invoice' },
        { label: 'Debit Note',       icon: 'debit',    route: '/app/purchase/debit-note' },
        { label: '3-Way Match',      icon: 'match',    route: '/app/purchase/three-way-match' },
        { label: 'Scorecard',        icon: 'scorecard',route: '/app/purchase/scorecard' },
      ]
    },
    { label: 'Sales Order', icon: 'sales', route: '/app/sales-order' },
    {
      label: 'Inventory',
      icon: 'inventory',
      children: [
        { label: 'Item Master',            icon: 'circle', route: '/app/inventory/List-itemmaster' },
        { label: 'Stock Take',             icon: 'circle', route: '/app/inventory/list-stocktake' },
        { label: 'Stock Reorder Planning', icon: 'circle', route: '/app/inventory/list-stockreorderplanning' },
        { label: 'Stock COGS',             icon: 'circle', route: '/app/inventory/stockcogs' },
        { label: 'Stock History',          icon: 'circle', route: '/app/inventory/list-stock-history' },
        {
          label: 'Internal',
          icon: 'internal',
          children: [
            { label: 'Material Request',       icon: 'circle', route: '/app/inventory/list-material-requisition' },
            { label: 'Stock Transfer Request', icon: 'circle', route: '/app/inventory/list-stock-transfer-receipt' },
          ]
        },
      ]
    },
    {
      label: 'Master',
      icon: 'master',
      children: [
        { label: 'Approval Level',  icon: 'm-approval',  route: '/app/master/approval-level' },
        { label: 'Bank',            icon: 'm-bank',      route: '/app/master/bank-list' },
        { label: 'Bin',             icon: 'm-bin',       route: '/app/master/bin' },
        { label: 'Category',        icon: 'm-category',  route: '/app/master/catagory' },
        { label: 'Cities',          icon: 'm-cities',    route: '/app/master/cities' },
        { label: 'Costing Method',  icon: 'm-costing',   route: '/app/master/coastingmethod' },
        { label: 'Company',         icon: 'm-company',   route: '/app/master/companyList' },
        { label: 'Countries',       icon: 'm-countries', route: '/app/master/countries' },
        { label: 'Currency',        icon: 'm-currency',  route: '/app/master/currency' },
        { label: 'Customer Groups', icon: 'm-custgrp',   route: '/app/master/customergroups' },
        { label: 'Department',      icon: 'm-dept',      route: '/app/master/department' },
        { label: 'Driver',          icon: 'm-driver',    route: '/app/master/driver' },
        { label: 'Exchange Rate',   icon: 'm-exchange',  route: '/app/master/exchangerate' },
        { label: 'Flag Issue',      icon: 'm-flag',      route: '/app/master/flagIssue' },
        { label: 'Incoterms',       icon: 'm-incoterms', route: '/app/master/incoterms' },
        { label: 'Item Type',       icon: 'm-itemtype',  route: '/app/master/itemType' },
        { label: 'Package List',    icon: 'm-itemset',   route: '/app/master/itemSet' },
        { label: 'Outlet',          icon: 'm-location',  route: '/app/master/location' },
        { label: 'Payment Terms',   icon: 'm-payment',   route: '/app/master/paymentTerms' },
        { label: 'Recurring',       icon: 'm-recurring', route: '/app/master/recurring' },
        { label: 'Service',         icon: 'm-service',   route: '/app/master/service' },
        { label: 'States',          icon: 'm-states',    route: '/app/master/states' },
        { label: 'Stock Issue',     icon: 'm-stock',     route: '/app/master/stockIssue' },
        { label: 'Frequency',       icon: 'm-strategy',  route: '/app/master/strategy' },
        { label: 'Supplier Groups', icon: 'm-suppgrp',   route: '/app/master/suppliergroups' },
        { label: 'Tax Code',        icon: 'm-tax',       route: '/app/master/taxcode' },
        { label: 'UOM',             icon: 'm-uom',       route: '/app/master/uom' },
        { label: 'UOM Conversion',  icon: 'm-uomconv',   route: '/app/master/uomconversion' },
        { label: 'Vehicle',         icon: 'm-vehicle',   route: '/app/master/vehicle' },
        { label: 'Warehouse',       icon: 'm-warehouse', route: '/app/master/warehouse' },
      ]
    },
    { label: 'Components', icon: 'components', route: '/app/demo' },
  ];

  constructor(
    private auth: AuthService,
    private router: Router,
    public sidebar: SidebarService
  ) {}

  ngOnInit(): void {
    this.syncMenuToRoute(this.router.url);
    this.routerSub = this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => this.syncMenuToRoute(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  private syncMenuToRoute(url: string): void {
    const activeParent = this.menus.find(m => this.hasChildren(m) && this.isMenuActiveByUrl(m, url));
    for (const m of this.menus) {
      if (!this.hasChildren(m)) continue;
      activeParent && m.label === activeParent.label
        ? this.sidebar.openMenu(m.label)
        : this.sidebar.closeMenu(m.label);
    }
  }

  private isMenuActiveByUrl(menu: MenuItem, url: string): boolean {
    return !!menu.children?.some(child => {
      if (child.route && url.startsWith(child.route)) return true;
      return !!child.children?.some(gc => gc.route && url.startsWith(gc.route));
    });
  }

  logout(): void { this.auth.logout(); }

  hasChildren(menu: MenuItem): boolean {
    return Array.isArray(menu.children) && menu.children.length > 0;
  }

  toggleMenu(menu: MenuItem): void {
    if (!this.hasChildren(menu)) return;
    this.sidebar.toggleMenu(menu.label);
  }

  isOpen(menu: MenuItem): boolean {
    return this.sidebar.isMenuOpen(menu.label);
  }

  isMenuActive(menu: MenuItem): boolean {
    return this.isMenuActiveByUrl(menu, this.router.url);
  }

  isChildActive(menu: MenuItem): boolean {
    if (!menu.route) return false;
    const tree = this.router.createUrlTree([menu.route], { queryParams: menu.queryParams });
    return this.router.isActive(tree, {
      paths: 'exact',
      queryParams: menu.queryParams ? 'exact' : 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored'
    });
  }
}
