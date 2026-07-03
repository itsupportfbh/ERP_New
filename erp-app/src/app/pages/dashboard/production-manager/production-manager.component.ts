import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  ProductionManagerKpi
} from '../dashboard.service';
import { CurrencyDisplayService } from '../../../core/services/currency-display.service';

@Component({
  standalone: false,
  selector: 'app-production-manager',
  templateUrl: './production-manager.component.html',
  styleUrls: ['./production-manager.component.scss']
})
export class ProductionManagerComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  totalRecipes = 0;
  productionOrders = 0;
  avgRecipeCost = '';
  rawMaterials = 0;
  pendingOrders = 0;

  constructor(
    private dashboardService: DashboardService,
    private cur: CurrencyDisplayService
  ) {}

  get baseSymbol(): string {
    return this.cur.baseSymbol();
  }

  ngOnInit(): void {
    this.loadProductionManagerKpi();
  }

  loadProductionManagerKpi(): void {
    this.dashboardService.getProductionManagerKpi(this.companyId).subscribe({
      next: (res: any) => {
        console.log('Production KPI Response:', res);

        this.totalRecipes = res.totalRecipes ?? res.TotalRecipes ?? 0;
        this.productionOrders = res.productionOrders ?? res.ProductionOrders ?? 0;
        this.avgRecipeCost = this.formatAmount(res.avgRecipeCost ?? res.AvgRecipeCost ?? 0);
        this.rawMaterials = res.rawMaterials ?? res.RawMaterials ?? 0;
        this.pendingOrders = res.pendingOrders ?? res.PendingOrders ?? 0;
      },
      error: (err) => {
        console.error('Production KPI error:', err);
      }
    });
  }

  formatAmount(value: number): string {
    return this.cur.compactMoney(value);
  }
}