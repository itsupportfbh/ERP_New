import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { LayoutComponent } from './layout/layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { SalesOrderComponent } from './pages/sales-order/sales-order.component';
import { NewOrderComponent } from './pages/sales-order/new-order/new-order.component';
import { InventoryComponent } from './pages/inventory/inventory.component';
import { DemoComponent } from './pages/demo/demo.component';

const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'app',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '',                     redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',            component: DashboardComponent  },
      { path: 'sales-order',          component: SalesOrderComponent },
      { path: 'sales-order/new',      component: NewOrderComponent   },
      { path: 'inventory',            component: InventoryComponent  },
      { path: 'demo',                 component: DemoComponent       },
    ]
  },
  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
