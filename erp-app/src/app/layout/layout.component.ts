import { Component } from '@angular/core';
import { AuthService } from '../core/services/auth.service';

interface MenuItem { label: string; icon: string; route: string; }

@Component({
  selector: 'erp-layout',
  standalone: false,
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  sidebarOpen = true;

  menus: MenuItem[] = [
    { label: 'Dashboard',    icon: '🏠', route: '/app/dashboard' },
    { label: 'Sales Order',  icon: '🛒', route: '/app/sales-order' },
    { label: 'Inventory',    icon: '📦', route: '/app/inventory' },
    { label: 'Components',   icon: '🧩', route: '/app/demo' },
  ];

  constructor(private auth: AuthService) {}

  logout(): void { this.auth.logout(); }
}
