import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { DropdownOption } from '../../../shared/components/dropdown/dropdown.component';

@Component({
  selector: 'erp-new-order',
  standalone: false,
  templateUrl: './new-order.component.html',
  styleUrls: ['./new-order.component.scss']
})
export class NewOrderComponent {

  header = {
    orderNo:    'SO-' + String(Date.now()).slice(-6),
    date:       new Date().toISOString().split('T')[0],
    dueDate:    '',
    customer:   null as any,
    branch:     null as any,
    salesman:   null as any,
    payMode:    null as any,
    warehouse:  null as any,
    remarks:    '',
    urgent:     false,
    taxInclusive: false,
  };

  lines: OrderLine[] = [this.emptyLine()];

  customers: DropdownOption[] = [
    { label: 'Ravi Traders',        value: 'c1' },
    { label: 'Sri Murugan Stores',  value: 'c2' },
    { label: 'Metro Supplies',      value: 'c3' },
    { label: 'Anand Corp',          value: 'c4' },
    { label: 'KSR Enterprises',     value: 'c5' },
  ];

  branches: DropdownOption[] = [
    { label: 'Chennai HO',   value: 'b1' },
    { label: 'Coimbatore',   value: 'b2' },
    { label: 'Salem',        value: 'b3' },
    { label: 'Madurai',      value: 'b4' },
  ];

  salesmen: DropdownOption[] = [
    { label: 'Karthik',  value: 's1' },
    { label: 'Priya',    value: 's2' },
    { label: 'Ramu',     value: 's3' },
    { label: 'Sujatha',  value: 's4' },
    { label: 'Bala',     value: 's5' },
  ];

  payModes: DropdownOption[] = [
    { label: 'Cash',    value: 'cash'   },
    { label: 'Credit',  value: 'credit' },
    { label: 'UPI',     value: 'upi'    },
    { label: 'Cheque',  value: 'cheque' },
  ];

  warehouses: DropdownOption[] = [
    { label: 'WH-01 Chennai',    value: 'wh1' },
    { label: 'WH-02 Coimbatore', value: 'wh2' },
    { label: 'WH-03 Salem',      value: 'wh3' },
  ];

  products: DropdownOption[] = [
    { label: 'Laptop',    value: 'p1' },
    { label: 'Chair',     value: 'p2' },
    { label: 'Monitor',   value: 'p3' },
    { label: 'Keyboard',  value: 'p4' },
    { label: 'Table',     value: 'p5' },
    { label: 'Headset',   value: 'p6' },
  ];

  units: DropdownOption[] = [
    { label: 'Nos', value: 'nos' },
    { label: 'Kg',  value: 'kg'  },
    { label: 'Box', value: 'box' },
    { label: 'Pcs', value: 'pcs' },
  ];

  taxOptions: DropdownOption[] = [
    { label: '0%',  value: 0  },
    { label: '5%',  value: 5  },
    { label: '12%', value: 12 },
    { label: '18%', value: 18 },
  ];

  constructor(private router: Router) {}

  emptyLine(): OrderLine {
    return { product: null, unit: null, qty: '', rate: '', disc: '', tax: null, amount: 0 };
  }

  addLine(): void { this.lines.push(this.emptyLine()); }

  removeLine(i: number): void {
    if (this.lines.length > 1) this.lines.splice(i, 1);
  }

  calcLine(line: OrderLine): void {
    const qty  = parseFloat(line.qty)  || 0;
    const rate = parseFloat(line.rate) || 0;
    const disc = parseFloat(line.disc) || 0;
    const tax  = line.tax ?? 0;
    const base = qty * rate * (1 - disc / 100);
    line.amount = Math.round(base * (1 + tax / 100) * 100) / 100;
  }

  get subtotal(): number { return this.lines.reduce((s, l) => s + (l.amount || 0), 0); }
  get totalTax(): number {
    return this.lines.reduce((s, l) => {
      const base = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0) * (1 - (parseFloat(l.disc) || 0) / 100);
      return s + base * ((l.tax ?? 0) / 100);
    }, 0);
  }
  get grandTotal(): number { return this.subtotal; }

  onSave(): void {
    alert(`Order ${this.header.orderNo} saved! (demo)`);
    this.router.navigate(['/app/sales-order']);
  }

  onCancel(): void { this.router.navigate(['/app/sales-order']); }
}

interface OrderLine {
  product: any;
  unit: any;
  qty: string;
  rate: string;
  disc: string;
  tax: any;
  amount: number;
}
