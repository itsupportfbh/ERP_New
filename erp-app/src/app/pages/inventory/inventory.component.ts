import { Component, OnInit } from '@angular/core';
import { TableColumn, SortState } from '../../shared/components/data-table/data-table.component';
import { DropdownOption } from '../../shared/components/dropdown/dropdown.component';

@Component({
  selector: 'erp-inventory',
  standalone: false,
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss']
})
export class InventoryComponent implements OnInit {

  filter = { search: '', category: null as any, warehouse: [] as any[] };

  categoryOptions: DropdownOption[] = [
    { label: 'All',          value: null      },
    { label: 'Electronics',  value: 'elec'    },
    { label: 'Furniture',    value: 'furn'    },
    { label: 'Stationery',   value: 'stat'    },
  ];

  warehouseOptions: DropdownOption[] = [
    { label: 'WH-01 Chennai',      value: 'wh1' },
    { label: 'WH-02 Coimbatore',   value: 'wh2' },
    { label: 'WH-03 Salem',        value: 'wh3' },
  ];

  columns: TableColumn[] = [
    { key: 'code',      header: 'Item Code',   type: 'text',   sortable: true  },
    { key: 'name',      header: 'Item Name',   type: 'text',   sortable: true  },
    { key: 'category',  header: 'Category',    type: 'text'                    },
    { key: 'unit',      header: 'Unit',        type: 'text'                    },
    { key: 'stock',     header: 'Stock',       type: 'number', sortable: true,  align: 'right' },
    { key: 'minStock',  header: 'Min Stock',   type: 'number', align: 'right'  },
    { key: 'rate',      header: 'Rate ₹',      type: 'number', sortable: true,  align: 'right' },
    { key: 'value',     header: 'Value ₹',     type: 'number', sortable: true,  align: 'right' },
    { key: 'warehouse', header: 'Warehouse',   type: 'text'                    },
    { key: 'active',    header: 'Active',      type: 'boolean'                 },
    { key: 'status',    header: 'Stock Status', type: 'badge',
      badgeMap: { 'In Stock': 'success', 'Low Stock': 'warning', 'Out of Stock': 'danger' }
    },
  ];

  allData: any[] = [];
  tableData: any[] = [];
  loading = false;
  currentPage = 1;
  pageSize = 10;
  sort: SortState = { key: '', dir: 'asc' };

  ngOnInit(): void { this.allData = this.generate(90); this.applyPage(); }

  generate(n: number): any[] {
    const cats  = ['Electronics', 'Furniture', 'Stationery', 'Raw Material'];
    const units = ['Nos', 'Kg', 'Box', 'Pcs'];
    const whs   = ['WH-01 Chennai', 'WH-02 Coimbatore', 'WH-03 Salem'];
    const names = ['Laptop', 'Chair', 'A4 Paper', 'Steel Rod', 'Monitor', 'Table', 'Pen', 'Copper Wire'];
    return Array.from({ length: n }, (_, i) => {
      const stock = Math.floor(Math.random() * 200);
      const min   = 10;
      const rate  = Math.round((Math.random() * 5000 + 50) * 100) / 100;
      const st    = stock === 0 ? 'Out of Stock' : stock < min ? 'Low Stock' : 'In Stock';
      return {
        code:      `ITM-${String(100 + i).padStart(4, '0')}`,
        name:      `${names[i % names.length]} ${i + 1}`,
        category:  cats[i % cats.length],
        unit:      units[i % units.length],
        stock,
        minStock:  min,
        rate,
        value:     Math.round(stock * rate * 100) / 100,
        warehouse: whs[i % whs.length],
        active:    i % 5 !== 0,
        status:    st,
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
