import { Component } from '@angular/core';

@Component({
  selector: 'erp-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  stats = [
    { label: 'Total Orders',   value: '1,248', icon: '🛒', color: '#2563a8' },
    { label: 'Revenue',        value: '₹8.4L', icon: '💰', color: '#16a34a' },
    { label: 'Pending',        value: '47',    icon: '⏳', color: '#d97706' },
    { label: 'Inventory Items',value: '3,091', icon: '📦', color: '#7c3aed' },
  ];
}
