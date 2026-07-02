import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  ModuleHealth
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-module-health',
  templateUrl: './module-health.component.html',
  styleUrls: ['./module-health.component.scss']
})
export class ModuleHealthComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  moduleHealth: any[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadModuleHealth();
  }

  loadModuleHealth(): void {
    this.dashboardService.getModuleHealth(this.companyId).subscribe({
      next: (res: ModuleHealth[]) => {
        this.moduleHealth = (res || []).map(x => ({
          name: x.moduleName,
          percentage: x.healthPercent ?? 0,
          alerts: x.alerts ?? 0,
          status: this.getStatusText(x),
          color: this.getColor(x.healthPercent ?? 0)
        }));

        console.log('Module Health:', this.moduleHealth);
      },
      error: (err) => {
        console.error('Module Health error:', err);
      }
    });
  }

  getStatusText(item: ModuleHealth): string {
    if ((item.alerts ?? 0) === 0) {
      return `${item.healthPercent}% OK`;
    }

    return `${item.healthPercent}% - ${item.alerts} alerts`;
  }

  getColor(value: number): string {
    if (value >= 80) return 'green';
    if (value >= 60) return 'teal';
    return 'orange';
  }
}