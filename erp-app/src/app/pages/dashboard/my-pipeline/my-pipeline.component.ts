import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  MyPipelineDashboard,
  MyPipelineItem
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-my-pipeline',
  templateUrl: './my-pipeline.component.html',
  styleUrls: ['./my-pipeline.component.scss']
})
export class MyPipelineComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;
  userId = Number(localStorage.getItem('id')) || 0;

  myPipeline: MyPipelineItem[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadMyPipeline();
  }

  loadMyPipeline(): void {
    this.dashboardService
      .getMyPipelineDashboard(this.companyId, this.userId)
      .subscribe({
        next: (res: MyPipelineDashboard) => {
          this.myPipeline = [
            {
              name: 'PR Created',
              count: res.prCreated ?? 0,
              percentage: res.prCreatedPercent ?? 0
            },
            {
              name: 'PO Raised',
              count: res.poRaised ?? 0,
              percentage: res.poRaisedPercent ?? 0
            },
            {
              name: 'GRN Received',
              count: res.grnReceived ?? 0,
              percentage: res.grnReceivedPercent ?? 0
            },
            {
              name: 'PIN Booked',
              count: res.pinBooked ?? 0,
              percentage: res.pinBookedPercent ?? 0
            }
          ];

          console.log('My Pipeline:', res);
        },
        error: (err) => {
          console.error('My Pipeline error:', err);
        }
      });
  }
}