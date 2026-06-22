import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

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
export class LayoutComponent {
  sidebarOpen = true;
  userMenuOpen = false;
  openMenus = new Set<string>(['Business Partners', 'Purchase', 'Financial', 'Inventory']);

  get userName(): string { return localStorage.getItem('username') ?? localStorage.getItem('email') ?? 'User'; }
  get userInitial(): string { return (this.userName.charAt(0) || 'U').toUpperCase(); }

  hasChildren(menu: MenuItem): boolean { return !!(menu.children?.length); }

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
    {
      label: 'Financial',
      icon: 'finance',
      children: [
        { label: 'Dashboard',           icon: 'circle',  route: '/app/finance' },
        { label: 'General Ledger',      icon: 'ledger',  route: '/app/finance/general-ledger' },
        { label: 'Chart of Account',    icon: 'ledger',  route: '/app/finance/chart-of-accounts' },
        { label: 'Journal',             icon: 'journal', route: '/app/finance/journal' },
        { label: 'Accounts Receivable', icon: 'ar',      route: '/app/finance/ar' },
        { label: 'Accounts Payable',    icon: 'ap',      route: '/app/finance/accounts-payable' },
        { label: 'Tax & Gst',           icon: 'tax',     route: '/app/finance/tax-gst' },
        { label: 'Period-close',        icon: 'close',   route: '/app/finance/period-close' },
        { label: 'Year End Close',      icon: 'close',   route: '/app/finance/year-end-close' },
        { label: 'Trial Balance',       icon: 'report',  route: '/app/finance/trial-balance' },
        { label: 'Reports',             icon: 'report',  route: '/app/finance/reports' },
      ]
    },
    { label: 'Sales Order', icon: 'sales', route: '/app/sales-order' },
    {
      label: 'Inventory',
      icon: 'inventory',
      children: [
        { label: 'Item Master',          icon: 'inv-item',    route: '/app/inventory/List-itemmaster' },
        { label: 'Stock Take',           icon: 'inv-take',    route: '/app/inventory/list-stocktake' },
        { label: 'Stock Reorder Planning', icon: 'inv-reorder', route: '/app/inventory/list-stockreorderplanning' },
        { label: 'Stock COGS',           icon: 'inv-cogs',    route: '/app/inventory/stockcogs' },
        { label: 'Stock History',        icon: 'inv-history', route: '/app/inventory/list-stock-history' },
        {
          label: 'Internal',
          icon: 'inv-internal',
          children: [
            { label: 'Material Request',       icon: 'inv-mr',      route: '/app/inventory/list-material-requisition' },
            { label: 'Stock Transfer Request', icon: 'inv-transfer', route: '/app/inventory/list-stocktransfer' },
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
        { label: 'Item Set',        icon: 'm-itemset',   route: '/app/master/itemSet' },
        { label: 'Location',        icon: 'm-location',  route: '/app/master/location' },
        { label: 'Payment Terms',   icon: 'm-payment',   route: '/app/master/paymentTerms' },
        { label: 'Recurring',       icon: 'm-recurring', route: '/app/master/recurring' },
        { label: 'Service',         icon: 'm-service',   route: '/app/master/service' },
        { label: 'States',          icon: 'm-states',    route: '/app/master/states' },
        { label: 'Stock Issue',     icon: 'm-stock',     route: '/app/master/stockIssue' },
        { label: 'Strategy',        icon: 'm-strategy',  route: '/app/master/strategy' },
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
    private router: Router
  ) {}

  logout(): void { this.auth.logout(); }

  toggleMenu(menu: MenuItem): void {
    if (!menu.children?.length) return;
    this.openMenus.has(menu.label) ? this.openMenus.delete(menu.label) : this.openMenus.add(menu.label);
  }

  isOpen(menu: MenuItem): boolean {
    return this.openMenus.has(menu.label);
  }

  isMenuActive(menu: MenuItem): boolean {
    if (menu.route && this.router.url.startsWith(menu.route)) return true;
    return !!menu.children?.some(child => child.route && this.router.url.startsWith(child.route));
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
