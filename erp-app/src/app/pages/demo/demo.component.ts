import { Component, OnInit } from '@angular/core';
import { TableColumn } from '../../shared/components/data-table/data-table.component';
import { DropdownOption } from '../../shared/components/dropdown/dropdown.component';
import { SortState } from '../../shared/components/data-table/data-table.component';

@Component({
  selector: 'erp-demo',
  standalone: false,
  templateUrl: './demo.component.html',
  styleUrls: ['./demo.component.scss']
})
export class DemoComponent implements OnInit {

  /* ---- Form fields ---- */
  form = {
    name: '', email: '', mobile: '', amount: '', date: '',
    status: null as any, category: null as any, departments: [] as any[],
    isActive: false, sendEmail: true
  };

  statusOptions: DropdownOption[] = [
    { label: 'Active',   value: 'active'   },
    { label: 'Inactive', value: 'inactive' },
    { label: 'Pending',  value: 'pending'  },
    { label: 'Blocked',  value: 'blocked'  },
  ];

  categoryOptions: DropdownOption[] = [
    { label: 'Electronics', value: 'elec' },
    { label: 'Furniture',   value: 'furn' },
    { label: 'Stationery',  value: 'stat' },
    { label: 'Raw Material',value: 'raw'  },
  ];

  deptOptions: DropdownOption[] = [
    { label: 'Sales',       value: 'sales'    },
    { label: 'Purchase',    value: 'purchase' },
    { label: 'Accounts',    value: 'accounts' },
    { label: 'Warehouse',   value: 'warehouse'},
    { label: 'HR',          value: 'hr'       },
  ];

  /* ---- Table with 20 columns — proves no horizontal scroll ---- */
  columns: TableColumn[] = [
    { key: 'id',         header: 'ID',         type: 'number', sortable: true,  align: 'right' },
    { key: 'orderNo',    header: 'Order No',   type: 'text',   sortable: true  },
    { key: 'customer',   header: 'Customer',   type: 'text',   sortable: true  },
    { key: 'product',    header: 'Product',    type: 'text',   sortable: true  },
    { key: 'category',   header: 'Category',   type: 'text'                    },
    { key: 'qty',        header: 'Qty',        type: 'number', sortable: true,  align: 'right' },
    { key: 'unit',       header: 'Unit',       type: 'text'                    },
    { key: 'rate',       header: 'Rate',       type: 'number', sortable: true,  align: 'right' },
    { key: 'amount',     header: 'Amount',     type: 'number', sortable: true,  align: 'right' },
    { key: 'tax',        header: 'Tax%',       type: 'number', align: 'right'  },
    { key: 'discount',   header: 'Disc%',      type: 'number', align: 'right'  },
    { key: 'date',       header: 'Date',       type: 'date',   sortable: true  },
    { key: 'status',     header: 'Status',     type: 'badge',
      badgeMap: { Delivered: 'success', Pending: 'warning', Cancelled: 'danger', Processing: 'default' }
    },
    { key: 'warehouse',  header: 'Warehouse',  type: 'text'                    },
    { key: 'active',     header: 'Active',     type: 'boolean'                 },
    { key: 'salesman',   header: 'Salesman',   type: 'text',   sortable: true  },
    { key: 'branch',     header: 'Branch',     type: 'text'                    },
    { key: 'payMode',    header: 'Pay Mode',   type: 'text'                    },
    { key: 'dueDate',    header: 'Due Date',   type: 'date'                    },
    { key: 'remarks',    header: 'Remarks',    type: 'text'                    },
  ];

  allData: any[] = [];
  tableData: any[] = [];
  loading = false;
  currentPage = 1;
  pageSize = 10;
  sort: SortState = { key: '', dir: 'asc' };

  ngOnInit(): void {
    this.allData = this.generateData(120);
    this.applyPage();
  }

  generateData(count: number): any[] {
    const statuses  = ['Delivered', 'Pending', 'Cancelled', 'Processing'];
    const customers = ['Ravi Traders', 'Sri Murugan Stores', 'Metro Supplies', 'Anand Corp', 'KSR Enterprises'];
    const products  = ['Laptop', 'Chair', 'Monitor', 'Keyboard', 'Table', 'Phone', 'Printer', 'Headset'];
    const categories= ['Electronics', 'Furniture', 'Stationery', 'Raw Material'];
    const units     = ['Nos', 'Kg', 'Box', 'Pcs', 'Ltr'];
    const warehouses= ['WH-01 Chennai', 'WH-02 Coimbatore', 'WH-03 Salem'];
    const salesmen  = ['Karthik', 'Priya', 'Ramu', 'Sujatha', 'Bala'];
    const branches  = ['Chennai HO', 'Coimbatore', 'Salem', 'Madurai'];
    const payModes  = ['Cash', 'Credit', 'UPI', 'Cheque'];

    return Array.from({ length: count }, (_, i) => {
      const qty  = Math.floor(Math.random() * 50) + 1;
      const rate = Math.round((Math.random() * 9000 + 100) * 100) / 100;
      const date = new Date(2024, i % 12, (i % 28) + 1);
      const due  = new Date(date); due.setDate(due.getDate() + 30);
      return {
        id:        i + 1,
        orderNo:   `ORD-${String(1000 + i).padStart(5, '0')}`,
        customer:  customers[i % customers.length],
        product:   products[i % products.length],
        category:  categories[i % categories.length],
        qty,
        unit:      units[i % units.length],
        rate,
        amount:    Math.round(qty * rate * 100) / 100,
        tax:       [5, 12, 18][i % 3],
        discount:  Math.floor(Math.random() * 10),
        date:      date.toLocaleDateString('en-IN'),
        status:    statuses[i % statuses.length],
        warehouse: warehouses[i % warehouses.length],
        active:    i % 3 !== 0,
        salesman:  salesmen[i % salesmen.length],
        branch:    branches[i % branches.length],
        payMode:   payModes[i % payModes.length],
        dueDate:   due.toLocaleDateString('en-IN'),
        remarks:   i % 4 === 0 ? 'Urgent delivery' : 'Normal',
      };
    });
  }

  applyPage(): void {
    const sorted = this.sort.key ? [...this.allData].sort((a, b) => {
      const va = a[this.sort.key]; const vb = b[this.sort.key];
      return this.sort.dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    }) : this.allData;
    const start = (this.currentPage - 1) * this.pageSize;
    this.tableData = sorted.slice(start, start + this.pageSize);
  }

  onSort(s: SortState): void { this.sort = s; this.currentPage = 1; this.applyPage(); }
  onPage(p: number): void { this.currentPage = p; this.applyPage(); }
  onPageSize(s: number): void { this.pageSize = s; this.currentPage = 1; this.applyPage(); }

  onReload(): void {
    this.loading = true;
    setTimeout(() => { this.loading = false; this.allData = this.generateData(120); this.applyPage(); }, 900);
  }

  formJson(): string { return JSON.stringify(this.form, null, 2); }
}
