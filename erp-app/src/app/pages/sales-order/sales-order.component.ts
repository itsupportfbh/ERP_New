import { Component, OnInit } from '@angular/core';
import { TableColumn, SortState } from '../../shared/components/data-table/data-table.component';
import { DropdownOption } from '../../shared/components/dropdown/dropdown.component';

@Component({
  selector: 'erp-sales-order',
  standalone: false,
  templateUrl: './sales-order.component.html',
  styleUrls: ['./sales-order.component.scss']
})
export class SalesOrderComponent implements OnInit {

  filter = { search: '', status: null as any, dateFrom: '', dateTo: '' };

  statusOptions: DropdownOption[] = [
    { label: 'All',       value: null       },
    { label: 'Pending',   value: 'Pending'  },
    { label: 'Delivered', value: 'Delivered'},
    { label: 'Cancelled', value: 'Cancelled'},
  ];

  columns: TableColumn[] = [
    { key: 'orderNo',  header: 'Order No', type: 'text',   sortable: true },
    { key: 'date',     header: 'Date',     type: 'date',   sortable: true },
    { key: 'customer', header: 'Customer', type: 'text',   sortable: true },
    { key: 'items',    header: 'Items',    type: 'number', align: 'right' },
    { key: 'amount',   header: 'Amount', type: 'number', sortable: true, align: 'right' },
    { key: 'tax',      header: 'Tax',    type: 'number', align: 'right' },
    { key: 'total',    header: 'Total',  type: 'number', sortable: true, align: 'right' },
    { key: 'status',   header: 'Status',   type: 'badge',
      badgeMap: { Delivered: 'success', Pending: 'warning', Cancelled: 'danger' }
    },
    { key: 'salesman', header: 'Salesman', type: 'text' },
    { key: 'remarks',  header: 'Remarks',  type: 'text' },
  ];

  allData: any[] = [];
  tableData: any[] = [];
  loading = false;
  currentPage = 1;
  pageSize = 10;
  sort: SortState = { key: '', dir: 'asc' };

  ngOnInit(): void { this.allData = this.generate(80); this.applyPage(); }

  generate(n: number): any[] {
    const customers = ['Ravi Traders', 'Metro Supplies', 'Anand Corp', 'KSR Enterprises', 'Sri Murugan Stores'];
    const salesmen  = ['Karthik', 'Priya', 'Ramu', 'Sujatha', 'Bala'];
    const statuses  = ['Pending', 'Delivered', 'Cancelled'];
    return Array.from({ length: n }, (_, i) => {
      const amt = Math.round((Math.random() * 50000 + 1000) * 100) / 100;
      const tax = Math.round(amt * 0.18 * 100) / 100;
      return {
        orderNo:  `SO-${String(2000 + i).padStart(5, '0')}`,
        date:     new Date(2024, i % 12, (i % 28) + 1).toLocaleDateString('en-IN'),
        customer: customers[i % customers.length],
        items:    Math.floor(Math.random() * 10) + 1,
        amount:   amt,
        tax,
        total:    Math.round((amt + tax) * 100) / 100,
        status:   statuses[i % statuses.length],
        salesman: salesmen[i % salesmen.length],
        remarks:  i % 4 === 0 ? 'Urgent delivery' : 'Normal',
      };
    });
  }

  applyPage(): void {
    const start = (this.currentPage - 1) * this.pageSize;
    this.tableData = this.allData.slice(start, start + this.pageSize);
  }

  onSort(s: SortState): void { this.sort = s; this.currentPage = 1; this.applyPage(); }
  onPage(p: number): void { this.currentPage = p; this.applyPage(); }
  onPageSize(s: number): void { this.pageSize = s; this.currentPage = 1; this.applyPage(); }
}
