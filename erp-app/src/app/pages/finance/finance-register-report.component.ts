import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditPrintService } from '../../core/services/audit-print.service';
import { MasterService } from '../../core/services/master.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { FinanceService } from './finance.service';

interface RegisterColumn { key: string; label: string; amount?: boolean; date?: boolean; }

@Component({
  selector: 'erp-finance-register-report',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './finance-register-report.component.html',
  styleUrls: ['./finance-register-report.component.scss']
})
export class FinanceRegisterReportComponent implements OnInit {
  @Input({ required: true }) kind!: 'receipts' | 'payments';
  loading = false; error = ''; columnsOpen = false;
  search = ''; fromDate = ''; toDate = ''; groupBy = 'none';
  loginBranch = 'All branches'; selectedBranch = 'All branches';
  rows: any[] = []; filtered: any[] = [];
  columnSelection: Record<string, boolean> = {};
  readonly currency = localStorage.getItem('companyCurrencyName') || 'MYR';

  constructor(private finance: FinanceService, private master: MasterService, private print: AuditPrintService) {}

  ngOnInit(): void {
    const today = new Date(); const start = new Date(today.getFullYear(), 0, 1);
    this.fromDate = start.toISOString().slice(0, 10); this.toDate = today.toISOString().slice(0, 10);
    this.columns.forEach(c => this.columnSelection[c.key] = true);
    this.loadLoginBranch(); this.load();
  }

  get title(): string { return this.kind === 'receipts' ? 'Receipts Register' : 'Payments Register'; }
  get endpoint(): string { return this.kind === 'receipts' ? '/ArReceipt/getAll' : '/finance/ap/payments'; }
  get partnerLabel(): string { return this.kind === 'receipts' ? 'Customer' : 'Supplier'; }
  get columns(): RegisterColumn[] {
    return this.kind === 'receipts' ? [
      { key:'number', label:'Receipt No' }, { key:'invoice', label:'Invoice(s)' }, { key:'partner', label:'Customer' },
      { key:'date', label:'Date', date:true }, { key:'method', label:'Mode' },
      { key:'amount', label:'Amount', amount:true }, { key:'baseAmount', label:`Base (${this.currency})`, amount:true }, { key:'status', label:'Status' }
    ] : [
      { key:'number', label:'Payment No' }, { key:'partner', label:'Supplier' }, { key:'invoice', label:'Invoice' },
      { key:'date', label:'Date', date:true }, { key:'method', label:'Method' }, { key:'reference', label:'Reference' },
      { key:'amount', label:'Amount', amount:true }, { key:'currency', label:'Currency' }, { key:'status', label:'Status' }
    ];
  }
  get visibleColumns(): RegisterColumn[] { return this.columns.filter(c => this.columnSelection[c.key] !== false); }
  get total(): number { return this.filtered.reduce((sum, row) => sum + (this.kind === 'receipts' ? row.baseAmount : row.amount), 0); }

  load(): void {
    this.loading = true; this.error = '';
    this.finance.list({ list: this.endpoint }).subscribe({
      next: response => { this.rows = this.finance.unwrap(response).map(row => this.normalize(row)); this.applyFilter(); this.loading = false; },
      error: () => { this.rows = []; this.filtered = []; this.error = `${this.title} data unavailable.`; this.loading = false; }
    });
  }

  applyFilter(): void {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.rows.filter(row => {
      const date = String(row.date || '').slice(0, 10);
      const inDate = (!this.fromDate || date >= this.fromDate) && (!this.toDate || date <= this.toDate);
      const inSearch = !q || ['number','partner','invoice','method','reference','status'].some(key => String(row[key] ?? '').toLowerCase().includes(q));
      return inDate && inSearch;
    });
  }
  clearFilters(): void { this.search=''; this.groupBy='none'; this.selectedBranch=this.loginBranch; this.applyFilter(); }
  toggleColumn(key: string): void {
    if (this.columnSelection[key] && this.visibleColumns.length === 1) return;
    this.columnSelection[key] = !this.columnSelection[key];
  }
  get displayRows(): any[] {
    if (this.groupBy === 'none') return this.filtered;
    const groups = new Map<string, any[]>();
    this.filtered.forEach(row => {
      const key = this.groupBy === 'partner' ? row.partner : this.groupBy === 'method' ? row.method : this.loginBranch;
      groups.set(key || '-', [...(groups.get(key || '-') || []), row]);
    });
    const result:any[]=[]; groups.forEach((items,label) => { result.push({_group:true,label,count:items.length}); result.push(...items); }); return result;
  }

  exportExcel(): void {
    const cols=this.visibleColumns; const data=[cols.map(c=>c.label), ...this.filtered.map(r=>cols.map(c=>r[c.key]))];
    const csv=data.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=`${this.title.replace(/ /g,'')}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }
  exportPdf(): void {
    this.print.print({ reportTitle:this.title, periodLine:`For The Period From ${this.fromDate} To ${this.toDate}`,
      metaLines:[`Branch : ${this.loginBranch}`], labelColumnKey:'partner',
      columns:this.visibleColumns.map(c=>({header:c.label,key:c.key,align:c.amount?'right':undefined,type:c.amount?'number':c.date?'date':undefined})), rows:this.filtered,
      totalRows:[{label:`Grand Total Amount (${this.currency})`,values:{amount:this.total,baseAmount:this.total},grand:true}] });
  }

  private normalize(row:any):any {
    const received=Number(row.amountReceived??row.AmountReceived??row.amount??row.Amount??0);
    const amount=Number(row.amount??row.Amount??row.amountReceived??row.AmountReceived??0);
    return this.kind === 'receipts' ? {
      number:row.receiptNo??row.ReceiptNo??row.referenceNo??'-', date:row.receiptDate??row.ReceiptDate, partner:row.customerName??row.CustomerName??'-',
      invoice:row.invoiceNos??row.InvoiceNos??row.invoiceNo??'', method:row.paymentMode??row.PaymentMode??'-', reference:row.referenceNo??row.ReferenceNo??'',
      currency:row.currencyName??row.CurrencyName??this.currency, amount:received, baseAmount:Number(row.amountBase??row.AmountBase??received), status:row.status??row.Status??'Posted'
    } : {
      number:row.paymentNo??row.PaymentNo??row.referenceNo??'-', date:row.paymentDate??row.PaymentDate, partner:row.supplierName??row.SupplierName??'-',
      invoice:row.invoiceNo??row.InvoiceNo??'-', method:row.paymentMethodName??row.PaymentMethodName??row.paymentMode??'-', reference:row.referenceNo??row.ReferenceNo??'',
      currency:row.currencyName??row.CurrencyName??this.currency, amount, baseAmount:Number(row.amountBase??row.AmountBase??amount), status:row.status??row.Status??'Posted'
    };
  }
  private loadLoginBranch():void {
    const id=Number(localStorage.getItem('locationId')||0); if(!id)return;
    this.master.getLocations().subscribe({next:(res:any)=>{const list=res?.data??res??[];const x=Array.isArray(list)?list.find((v:any)=>Number(v.id??v.locationId??v.outletId)===id):null;this.loginBranch=x?.name??x?.locationName??x?.outletName??`Outlet ${id}`;this.selectedBranch=this.loginBranch;},error:()=>{this.loginBranch=`Outlet ${id}`;this.selectedBranch=this.loginBranch;}});
  }
}
