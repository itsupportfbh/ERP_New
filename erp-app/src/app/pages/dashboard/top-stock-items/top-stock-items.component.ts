import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  TopStockItem
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-top-stock-items',
  templateUrl: './top-stock-items.component.html',
  styleUrls: ['./top-stock-items.component.scss']
})
export class TopStockItemsComponent implements OnInit {

  stockItems: TopStockItem[] = [];

  loading = false;

  constructor(
    private dashboardService: DashboardService
  ) { }

  ngOnInit(): void {
    this.loadTopStockItems();
  }

  loadTopStockItems(): void {

    this.loading = true;

    const companyId =
      Number(localStorage.getItem('companyId')) || 0;

    this.dashboardService
      .getTopStockItems(companyId)
      .subscribe({
        next: (res) => {

          console.log('Top Stock Items', res);

          this.stockItems = res;
          this.loading = false;
        },
        error: (err) => {

          console.error(err);
          this.loading = false;
        }
      });
  }
}