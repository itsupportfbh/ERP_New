import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  ProductionOutput
} from '../dashboard.service';

interface OutputDay {
  dayName: string;
  outputQty: number;
  pct: number;
}

@Component({
  standalone: false,
  selector: 'app-production-output',
  templateUrl: './production-output.component.html',
  styleUrls: ['./production-output.component.scss']
})
export class ProductionOutputComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  outputDays: OutputDay[] = [];
  maxQty = 0;
  totalQty = 0;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadProductionOutput();
  }

  loadProductionOutput(): void {
    this.dashboardService.getProductionOutput(this.companyId).subscribe({
      next: (res: ProductionOutput[]) => {
        const rows = (res || []).map(x => ({
          dayName: x.dayName,
          outputQty: Number(x.outputQty || 0)
        }));

        this.maxQty = rows.reduce((m, r) => Math.max(m, r.outputQty), 0);
        this.totalQty = rows.reduce((s, r) => s + r.outputQty, 0);

        this.outputDays = rows.map(r => ({
          ...r,
          pct: this.maxQty > 0 ? Math.round((r.outputQty / this.maxQty) * 100) : 0
        }));

        console.log('Production Output:', res);
      },
      error: (err) => {
        console.error('Production Output error:', err);
      }
    });
  }
}
