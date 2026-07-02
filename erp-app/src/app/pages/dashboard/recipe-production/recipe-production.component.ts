import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  RecipeProductionDashboard
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-recipe-production',
  templateUrl: './recipe-production.component.html',
  styleUrls: ['./recipe-production.component.scss']
})
export class RecipeProductionComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  openOrders = 0;
  completedToday = 0;
  activeRecipes = 0;

  openOrdersChange = 0;
  completedTodayChange = 0;
  activeRecipesChange = 0;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadRecipeProductionDashboard();
  }

  loadRecipeProductionDashboard(): void {
    this.dashboardService.getRecipeProductionDashboard(this.companyId).subscribe({
      next: (res: RecipeProductionDashboard) => {
        this.openOrders = res.openOrders ?? 0;
        this.completedToday = res.completedToday ?? 0;
        this.activeRecipes = res.activeRecipes ?? 0;

        this.openOrdersChange = res.openOrdersChange ?? 0;
        this.completedTodayChange = res.completedTodayChange ?? 0;
        this.activeRecipesChange = res.activeRecipesChange ?? 0;

        console.log('Recipe Production Dashboard:', res);
      },
      error: (err) => {
        console.error('Recipe Production Dashboard error:', err);
      }
    });
  }

  absValue(value: number): number {
    return Math.abs(Number(value || 0));
  }
}
