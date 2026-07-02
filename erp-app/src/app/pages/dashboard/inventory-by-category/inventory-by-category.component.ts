import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  InventoryCategory
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-inventory-by-category',
  templateUrl: './inventory-by-category.component.html',
  styleUrls: ['./inventory-by-category.component.scss']
})
export class InventoryByCategoryComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  categories: any[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadInventoryByCategory();
  }

  loadInventoryByCategory(): void {
    this.dashboardService.getInventoryByCategory(this.companyId).subscribe({
      next: (res: InventoryCategory[]) => {
        this.categories = (res || []).map(x => ({
          name: x.category,
          value: x.stockValue,
          percentage: Number(x.percentage || 0)
        }));

        console.log('Inventory By Category:', this.categories);
      },
      error: (err) => {
        console.error('Inventory By Category error:', err);
      }
    });
  }
}