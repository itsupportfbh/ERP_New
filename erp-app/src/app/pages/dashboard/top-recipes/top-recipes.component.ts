import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  TopRecipe
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-top-recipes',
  templateUrl: './top-recipes.component.html',
  styleUrls: ['./top-recipes.component.scss']
})
export class TopRecipesComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  recipes: any[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadTopRecipes();
  }

  loadTopRecipes(): void {

  this.dashboardService
    .getTopRecipes(this.companyId)
    .subscribe({

      next: (res: any[]) => {

        this.recipes = res.map((x, i) => ({

          name: x.recipeName,

          cuisine: `Used ${x.usageCount} times`,

          status: 'Active',

          cost: '₹' + Number(x.recipeCost).toFixed(0),

          badgeClass: 'badge-active',

          initial: (x.recipeName || '?').charAt(0).toUpperCase(),

          imageClass: this.getImageClass(i)

        }));

      },

      error: err => console.error(err)

    });

}

  formatAmount(value: number): string {
    return `₹${Number(value || 0).toLocaleString('en-IN')}`;
  }

  getBadgeClass(status: string): string {
    return status === 'Active' ? 'active-badge' : 'draft-badge';
  }

  getImageClass(index: number): string {
    const classes = [
      'img-blue',
      'img-green',
      'img-beige',
      'img-purple'
    ];

    return classes[index % classes.length];
  }
}