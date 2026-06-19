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
  openMenus = new Set<string>(['Business Partners', 'Purchase']);

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
    { label: 'Inventory', icon: 'inventory', route: '/app/inventory' },
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
