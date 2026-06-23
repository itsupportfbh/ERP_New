import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type FinanceActionKey =
  | 'create'
  | 'update'
  | 'delete'
  | 'post'
  | 'pay'
  | 'lock'
  | 'unlock'
  | 'reconcile'
  | 'email'
  | 'close'
  | 'run'
  | 'preview'
  | 'file'
  | 'reopen'
  | 'export'
  | 'fx'
  | 'unreconcile'
  | 'import';

export interface FinanceEndpointConfig {
  list?: string;
  get?: string;
  create?: string;
  update?: string;
  delete?: string;
  post?: string;
  pay?: string;
  lock?: string;
  unlock?: string;
  reconcile?: string;
  email?: string;
  close?: string;
  run?: string;
  preview?: string;
  file?: string;
  reopen?: string;
  export?: string;
  fx?: string;
  unreconcile?: string;
  import?: string;
  report?: string;
  static?: string;
  listMethod?: 'GET' | 'POST';
  listBody?: any;
}

export interface FinancePageConfig {
  key: string;
  title: string;
  subtitle: string;
  endpoint: FinanceEndpointConfig;
  columns: { key: string; header: string; type?: 'text' | 'number' | 'date' | 'badge'; align?: 'left' | 'center' | 'right' }[];
  searchKeys: string[];
  actions: FinanceActionKey[];
  formFields?: { key: string; label: string; type?: 'text' | 'number' | 'date' | 'textarea' }[];
  reportFilters?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    if (Array.isArray(res?.items)) return res.items;
    if (Array.isArray(res?.rows)) return res.rows;
    return [];
  }

  unwrapOne(res: any): any {
    if (Array.isArray(res)) return res[0] ?? {};
    return res?.data ?? res?.result ?? res ?? {};
  }

  list(config: FinanceEndpointConfig, params?: Record<string, string | number | null | undefined>): Observable<any> {
    const url = config.list || config.report;
    if (!url) throw new Error('List endpoint missing');
    const resolvedUrl = this.interpolate(url, params);
    if (config.listMethod === 'POST') {
      return this.http.post(this.url(resolvedUrl), { ...(config.listBody ?? {}), ...(params ?? {}) });
    }
    return this.http.get(this.url(resolvedUrl), { params: this.params(params) });
  }

  get(config: FinanceEndpointConfig, id: number | string): Observable<any> {
    if (!config.get) throw new Error('Get endpoint missing');
    return this.http.get(this.url(config.get, id));
  }

  create(config: FinanceEndpointConfig, payload: any): Observable<any> {
    if (!config.create) throw new Error('Create endpoint missing');
    return this.http.post(this.url(config.create), payload);
  }

  update(config: FinanceEndpointConfig, id: number | string, payload: any): Observable<any> {
    if (!config.update) throw new Error('Update endpoint missing');
    return this.http.put(this.url(config.update, id), payload);
  }

  delete(config: FinanceEndpointConfig, id: number | string): Observable<any> {
    if (!config.delete) throw new Error('Delete endpoint missing');
    return this.http.delete(this.url(config.delete, id));
  }

  run(config: FinanceEndpointConfig, action: FinanceActionKey, rowOrPayload: any): Observable<any> {
    const id = rowOrPayload?.id ?? rowOrPayload?.iD ?? rowOrPayload?.journalId ?? rowOrPayload?.invoiceId;
    const endpoint = config[action as keyof FinanceEndpointConfig] as string | undefined;
    if (!endpoint) throw new Error(`${action} endpoint missing`);
    const needsBody = ['post', 'pay', 'lock', 'unlock', 'reconcile', 'email', 'import', 'run', 'preview', 'file', 'fx'].includes(action);
    const body = needsBody ? rowOrPayload : {};
    const resolvedEndpoint = this.interpolate(endpoint, rowOrPayload);
    if (action === 'export') {
      return this.http.get(this.url(resolvedEndpoint, endpoint.endsWith('/') ? id : undefined), { responseType: 'blob' });
    }
    if (action === 'preview') {
      return this.http.get(this.url(resolvedEndpoint, endpoint.endsWith('/') ? id : undefined), { params: this.params(rowOrPayload) });
    }
    return this.http.post(this.url(resolvedEndpoint, endpoint.endsWith('/') ? id : undefined), body);
  }

  getSuppliers(): Observable<any> {
    return this.http.get(this.url('/Suppliers/getAllSupplier'));
  }

  getCustomers(): Observable<any> {
    return this.http.get(this.url('/CustomerMaster/GetAllCustomerMaster'));
  }

  dashboard(): Observable<any> {
    return this.http.get(this.url('/Dashboard'));
  }

  gstYears(): Observable<any> {
    return this.http.get(this.url('/GstReturns/years'));
  }

  gstPeriods(fyStartYear: string | number): Observable<any> {
    return this.http.get(this.url(`/GstReturns/periods/${fyStartYear}`));
  }

  gstReturnForPeriod(periodId: string | number): Observable<any> {
    return this.http.get(this.url(`/GstReturns/return/${periodId}`));
  }

  gstDetails(params?: Record<string, string | number | null | undefined>): Observable<any> {
    return this.http.get(this.url('/GstReturns/details'), { params: this.params(params) });
  }

  putBody(endpoint: string, payload: any): Observable<any> {
    return this.http.put(this.url(endpoint), payload);
  }

  private url(endpoint: string, id?: number | string): string {
    const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (id !== undefined && id !== null && (clean.includes(':id') || clean.includes('{id}'))) {
      return `${this.api}${clean.replace(':id', String(id)).replace('{id}', String(id))}`;
    }
    const suffix = id === undefined || id === null ? '' : String(id);
    return `${this.api}${clean}${clean.endsWith('/') ? suffix : ''}`;
  }

  private params(values?: Record<string, string | number | null | undefined>): HttpParams {
    let params = new HttpParams();
    Object.entries(values ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    });
    return params;
  }

  private interpolate(endpoint: string, values?: Record<string, any>): string {
    let resolved = endpoint;
    Object.entries(values ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        resolved = resolved.replace(`:${key}`, encodeURIComponent(String(value))).replace(`{${key}}`, encodeURIComponent(String(value)));
      }
    });
    return resolved;
  }
}

export const FINANCE_PAGES: FinancePageConfig[] = [
  {
    key: 'reports',
    title: 'Reports',
    subtitle: 'Finance reports hub with trial balance, P&L, balance sheet, GST, aging, daybook and forecast',
    endpoint: { static: 'reports' },
    columns: [
      { key: 'reportName', header: 'Report' },
      { key: 'description', header: 'Description' },
      { key: 'module', header: 'Module' }
    ],
    searchKeys: ['reportName', 'description', 'module'],
    actions: []
  },
  {
    key: 'chart-of-accounts',
    title: 'Chart of Accounts',
    subtitle: 'Account master with create, update and delete controls',
    endpoint: {
      list: '/ChartOfAccount/GetChartOfAccounts',
      get: '/ChartOfAccount/GetChartOfAccountById/',
      create: '/ChartOfAccount/CreateChartOfAccount',
      update: '/ChartOfAccount/UpdateChartOfAccountById/',
      delete: '/ChartOfAccount/DeleteChartOfAccountById/'
    },
    columns: [
      { key: 'accountCode', header: 'Code' },
      { key: 'accountName', header: 'Account' },
      { key: 'accountType', header: 'Type' },
      { key: 'parentAccountName', header: 'Parent' },
      { key: 'isActive', header: 'Active', type: 'badge' }
    ],
    searchKeys: ['accountCode', 'accountName', 'accountType'],
    actions: ['create', 'update', 'delete'],
    formFields: [
      { key: 'accountCode', label: 'Account Code' },
      { key: 'accountName', label: 'Account Name' },
      { key: 'accountType', label: 'Account Type' },
      { key: 'parentAccountId', label: 'Parent Account ID', type: 'number' },
      { key: 'description', label: 'Description', type: 'textarea' }
    ]
  },
  {
    key: 'journal',
    title: 'Journals',
    subtitle: 'Journal entries, recurring journals and batch posting',
    endpoint: { list: '/Journal/GetAllJournals', create: '/Journal/create', post: '/Journal/post-batch' },
    columns: [
      { key: 'journalNo', header: 'Journal No' },
      { key: 'journalDate', header: 'Date', type: 'date' },
      { key: 'description', header: 'Description' },
      { key: 'entryType', header: 'Entry Type' },
      { key: 'recurringFrequency', header: 'Frequency' },
      { key: 'totalDebit', header: 'Debit', type: 'number', align: 'right' },
      { key: 'totalCredit', header: 'Credit', type: 'number', align: 'right' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['journalNo', 'description', 'status', 'entryType'],
    actions: ['create', 'post'],
    formFields: [
      { key: 'journalDate', label: 'Journal Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'totalDebit', label: 'Total Debit', type: 'number' },
      { key: 'totalCredit', label: 'Total Credit', type: 'number' }
    ]
  },
  {
    key: 'general-ledger',
    title: 'General Ledger',
    subtitle: 'Ledger movement and account drilldown',
    endpoint: { list: '/GeneralLedger/GetGeneralLedger' },
    columns: [
      { key: 'postingDate', header: 'Date', type: 'date' },
      { key: 'accountCode', header: 'Code' },
      { key: 'accountName', header: 'Account' },
      { key: 'description', header: 'Description' },
      { key: 'debit', header: 'Debit', type: 'number', align: 'right' },
      { key: 'credit', header: 'Credit', type: 'number', align: 'right' }
    ],
    searchKeys: ['accountCode', 'accountName', 'description'],
    actions: [],
    reportFilters: true
  },
  {
    key: 'accounts-payable',
    title: 'Accounts Payable',
    subtitle: 'Supplier invoices, payment status and AP posting',
    endpoint: { list: '/finance/ap/invoices' },
    columns: [
      { key: 'supplierName', header: 'Supplier' },
      { key: 'invoiceNo', header: 'Invoice' },
      { key: 'invoiceDate', header: 'Date', type: 'date' },
      { key: 'dueDate', header: 'Due', type: 'date' },
      { key: 'amount', header: 'Amount', type: 'number', align: 'right' },
      { key: 'balance', header: 'Balance', type: 'number', align: 'right' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['supplierName', 'invoiceNo', 'status'],
    actions: ['pay']
  },
  {
    key: 'ap-advance',
    title: 'AP Advance',
    subtitle: 'Supplier advance payments and GRN adjustment',
    endpoint: { list: '/finance/ap/getsupplier-advances', create: '/finance/ap/createsupplier-advance' },
    columns: [
      { key: 'supplierName', header: 'Supplier' },
      { key: 'advanceNo', header: 'Advance No' },
      { key: 'advanceDate', header: 'Date', type: 'date' },
      { key: 'amount', header: 'Amount', type: 'number', align: 'right' },
      { key: 'balance', header: 'Balance', type: 'number', align: 'right' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['supplierName', 'advanceNo', 'status'],
    actions: ['create'],
    formFields: [
      { key: 'supplierId', label: 'Supplier ID', type: 'number' },
      { key: 'advanceDate', label: 'Advance Date', type: 'date' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' }
    ]
  },
  {
    key: 'ar',
    title: 'Accounts Receivable',
    subtitle: 'Customer invoice and collection workspace',
    endpoint: { list: '/ArInvoice/list' },
    columns: [
      { key: 'customerName', header: 'Customer' },
      { key: 'invoiceNo', header: 'Invoice' },
      { key: 'invoiceDate', header: 'Date', type: 'date' },
      { key: 'dueDate', header: 'Due', type: 'date' },
      { key: 'amount', header: 'Amount', type: 'number', align: 'right' },
      { key: 'balance', header: 'Balance', type: 'number', align: 'right' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['customerName', 'invoiceNo', 'status'],
    actions: []
  },
  {
    key: 'ar-invoices',
    title: 'AR Invoices',
    subtitle: 'Create and maintain customer invoices',
    endpoint: { list: '/ArInvoice/list', create: '/SalesInvoice/Create' },
    columns: [
      { key: 'invoiceNo', header: 'Invoice' },
      { key: 'customerName', header: 'Customer' },
      { key: 'invoiceDate', header: 'Date', type: 'date' },
      { key: 'amount', header: 'Amount', type: 'number', align: 'right' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['invoiceNo', 'customerName', 'status'],
    actions: ['create'],
    formFields: [
      { key: 'customerId', label: 'Customer ID', type: 'number' },
      { key: 'invoiceDate', label: 'Invoice Date', type: 'date' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' }
    ]
  },
  {
    key: 'receipts',
    title: 'Receipts',
    subtitle: 'AR receipts and customer allocation',
    endpoint: { list: '/ArReceipt/getAll', get: '/ArReceipt/get/', create: '/ArReceipt/insert', update: '/ArReceipt/update/', delete: '/ArReceipt/Delete/' },
    columns: [
      { key: 'receiptNo', header: 'Receipt' },
      { key: 'customerName', header: 'Customer' },
      { key: 'receiptDate', header: 'Date', type: 'date' },
      { key: 'amount', header: 'Amount', type: 'number', align: 'right' },
      { key: 'paymentMode', header: 'Mode' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['receiptNo', 'customerName', 'paymentMode', 'status'],
    actions: ['create', 'update', 'delete'],
    formFields: [
      { key: 'customerId', label: 'Customer ID', type: 'number' },
      { key: 'receiptDate', label: 'Receipt Date', type: 'date' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'paymentMode', label: 'Payment Mode' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' }
    ]
  },
  {
    key: 'ar-advance',
    title: 'AR Advance',
    subtitle: 'Customer advance receipts',
    endpoint: { list: '/ArInvoice/advance/open', create: '/ArInvoice/advance' },
    columns: [
      { key: 'customerName', header: 'Customer' },
      { key: 'advanceNo', header: 'Advance No' },
      { key: 'advanceDate', header: 'Date', type: 'date' },
      { key: 'amount', header: 'Amount', type: 'number', align: 'right' },
      { key: 'balance', header: 'Balance', type: 'number', align: 'right' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['customerName', 'advanceNo', 'status'],
    actions: ['create'],
    formFields: [
      { key: 'customerId', label: 'Customer ID', type: 'number' },
      { key: 'advanceDate', label: 'Advance Date', type: 'date' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' }
    ]
  },
  {
    key: 'bank-reconciliation',
    title: 'Bank Reconciliation',
    subtitle: 'Match bank statement lines with ledger transactions',
    endpoint: {
      list: '/BankReconciliation/lines',
      reconcile: '/BankReconciliation/reconcile',
      unreconcile: '/BankReconciliation/unreconcile/',
      import: '/BankReconciliation/import'
    },
    columns: [
      { key: 'bankName', header: 'Bank' },
      { key: 'statementDate', header: 'Statement Date', type: 'date' },
      { key: 'referenceNo', header: 'Reference' },
      { key: 'ledgerAmount', header: 'Ledger', type: 'number', align: 'right' },
      { key: 'bankAmount', header: 'Bank', type: 'number', align: 'right' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['bankName', 'referenceNo', 'status'],
    actions: ['import', 'reconcile', 'unreconcile'],
    reportFilters: true
  },
  {
    key: 'period-close',
    title: 'Period Close',
    subtitle: 'Accounting period lock, unlock and close status',
    endpoint: {
      list: '/PeriodClose/periods',
      lock: '/PeriodClose/lock',
      unlock: '/PeriodClose/lock',
      fx: '/PeriodClose/run-fx-reval'
    },
    columns: [
      { key: 'periodName', header: 'Period' },
      { key: 'fromDate', header: 'From', type: 'date' },
      { key: 'toDate', header: 'To', type: 'date' },
      { key: 'status', header: 'Status', type: 'badge' },
      { key: 'closedByName', header: 'Closed By' }
    ],
    searchKeys: ['periodName', 'status', 'closedByName'],
    actions: ['lock', 'unlock', 'fx']
  },
  {
    key: 'year-end-close',
    title: 'Year End Close',
    subtitle: 'Fiscal year closing workflow',
    endpoint: { list: '/YearEndClose/status/:fyStartYear', preview: '/YearEndClose/preview', run: '/YearEndClose/run' },
    columns: [
      { key: 'fiscalYear', header: 'Fiscal Year' },
      { key: 'startDate', header: 'Start', type: 'date' },
      { key: 'endDate', header: 'End', type: 'date' },
      { key: 'status', header: 'Status', type: 'badge' },
      { key: 'closedDate', header: 'Closed Date', type: 'date' }
    ],
    searchKeys: ['fiscalYear', 'status'],
    actions: ['preview', 'run']
  },
  {
    key: 'opening-balance',
    title: 'Opening Balance',
    subtitle: 'Opening balances per account',
    endpoint: { list: '/OpeningBalance/getAll', get: '/OpeningBalance/get/', create: '/OpeningBalance/insert', update: '/OpeningBalance/update/', delete: '/OpeningBalance/Delete/' },
    columns: [
      { key: 'accountCode', header: 'Code' },
      { key: 'accountName', header: 'Account' },
      { key: 'balanceDate', header: 'Date', type: 'date' },
      { key: 'debit', header: 'Debit', type: 'number', align: 'right' },
      { key: 'credit', header: 'Credit', type: 'number', align: 'right' }
    ],
    searchKeys: ['accountCode', 'accountName'],
    actions: ['create', 'update', 'delete'],
    formFields: [
      { key: 'accountId', label: 'Account ID', type: 'number' },
      { key: 'balanceDate', label: 'Balance Date', type: 'date' },
      { key: 'debit', label: 'Debit', type: 'number' },
      { key: 'credit', label: 'Credit', type: 'number' }
    ]
  },
  {
    key: 'tax-gst',
    title: 'Tax and GST',
    subtitle: 'GST details, returns and tax code controls',
    endpoint: { list: '/TaxCode/getAll', create: '/TaxCode/insert', update: '/TaxCode/update', delete: '/TaxCode/delete/' },
    columns: [
      { key: 'taxCode', header: 'Code' },
      { key: 'taxName', header: 'Name' },
      { key: 'taxRate', header: 'Rate', type: 'number', align: 'right' },
      { key: 'taxType', header: 'Type' },
      { key: 'isActive', header: 'Active', type: 'badge' }
    ],
    searchKeys: ['taxCode', 'taxName', 'taxType'],
    actions: ['create', 'update', 'delete'],
    formFields: [
      { key: 'taxCode', label: 'Tax Code' },
      { key: 'taxName', label: 'Tax Name' },
      { key: 'taxRate', label: 'Tax Rate', type: 'number' },
      { key: 'taxType', label: 'Tax Type' }
    ]
  },
  {
    key: 'gst-return',
    title: 'GST Returns',
    subtitle: 'GST return preparation and filing view',
    endpoint: {
      list: '/GstReturns/years',
      lock: '/GstReturns/apply-lock',
      reopen: '/GstReturns/reopen/',
      file: '/GstReturns/mark-filed/',
      post: '/GstReturns/:id/post-to-gl',
      export: '/GstReturns/export-excel/'
    },
    columns: [
      { key: 'returnNo', header: 'Return No' },
      { key: 'periodName', header: 'Period' },
      { key: 'outputTax', header: 'Output Tax', type: 'number', align: 'right' },
      { key: 'inputTax', header: 'Input Tax', type: 'number', align: 'right' },
      { key: 'netTax', header: 'Net Tax', type: 'number', align: 'right' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['returnNo', 'periodName', 'status'],
    actions: ['lock', 'reopen', 'file', 'post', 'export'],
    reportFilters: true
  },
  {
    key: 'trial-balance',
    title: 'Trial Balance',
    subtitle: 'Trial balance report',
    endpoint: { list: '/financereport/trial-balance', listMethod: 'POST', listBody: {} },
    columns: [
      { key: 'accountCode', header: 'Code' },
      { key: 'accountName', header: 'Account' },
      { key: 'openingBalance', header: 'Opening', type: 'number', align: 'right' },
      { key: 'debit', header: 'Debit', type: 'number', align: 'right' },
      { key: 'credit', header: 'Credit', type: 'number', align: 'right' },
      { key: 'closingBalance', header: 'Closing', type: 'number', align: 'right' }
    ],
    searchKeys: ['accountCode', 'accountName'],
    actions: [],
    reportFilters: true
  },
  {
    key: 'profit-loss',
    title: 'Profit and Loss',
    subtitle: 'Profit and loss statement',
    endpoint: { list: '/FinanceReport/GetProfitLossDetails' },
    columns: [
      { key: 'accountName', header: 'Account' },
      { key: 'category', header: 'Category' },
      { key: 'amount', header: 'Amount', type: 'number', align: 'right' }
    ],
    searchKeys: ['accountName', 'category'],
    actions: [],
    reportFilters: true
  },
  {
    key: 'balance-sheet',
    title: 'Balance Sheet',
    subtitle: 'Balance sheet statement',
    endpoint: { list: '/FinanceReport/GetBalanceSheetDetails' },
    columns: [
      { key: 'accountName', header: 'Account' },
      { key: 'section', header: 'Section' },
      { key: 'amount', header: 'Amount', type: 'number', align: 'right' }
    ],
    searchKeys: ['accountName', 'section'],
    actions: [],
    reportFilters: true
  },
  {
    key: 'gst-report',
    title: 'GST Report',
    subtitle: 'GST tax report',
    endpoint: { list: '/GstReturns/details' },
    columns: [
      { key: 'taxCode', header: 'Tax Code' },
      { key: 'taxType', header: 'Type' },
      { key: 'taxableAmount', header: 'Taxable', type: 'number', align: 'right' },
      { key: 'taxAmount', header: 'Tax', type: 'number', align: 'right' }
    ],
    searchKeys: ['taxCode', 'taxType'],
    actions: [],
    reportFilters: true
  },
  {
    key: 'ap-aging',
    title: 'AP Aging',
    subtitle: 'Supplier payable aging',
    endpoint: { list: '/ApAging/summary' },
    columns: [
      { key: 'supplierName', header: 'Supplier' },
      { key: 'current', header: 'Current', type: 'number', align: 'right' },
      { key: 'days30', header: '30 Days', type: 'number', align: 'right' },
      { key: 'days60', header: '60 Days', type: 'number', align: 'right' },
      { key: 'days90', header: '90 Days', type: 'number', align: 'right' },
      { key: 'total', header: 'Total', type: 'number', align: 'right' }
    ],
    searchKeys: ['supplierName'],
    actions: [],
    reportFilters: true
  },
  {
    key: 'ar-aging',
    title: 'AR Aging',
    subtitle: 'Customer receivable aging',
    endpoint: { list: '/ArAging/summary' },
    columns: [
      { key: 'customerName', header: 'Customer' },
      { key: 'current', header: 'Current', type: 'number', align: 'right' },
      { key: 'days30', header: '30 Days', type: 'number', align: 'right' },
      { key: 'days60', header: '60 Days', type: 'number', align: 'right' },
      { key: 'days90', header: '90 Days', type: 'number', align: 'right' },
      { key: 'total', header: 'Total', type: 'number', align: 'right' }
    ],
    searchKeys: ['customerName'],
    actions: [],
    reportFilters: true
  },
  {
    key: 'daybook',
    title: 'Daybook',
    subtitle: 'Daily accounting transaction report',
    endpoint: { list: '/FinanceReport/daybook', listMethod: 'POST', listBody: {} },
    columns: [
      { key: 'postingDate', header: 'Date', type: 'date' },
      { key: 'voucherNo', header: 'Voucher' },
      { key: 'accountName', header: 'Account' },
      { key: 'description', header: 'Description' },
      { key: 'debit', header: 'Debit', type: 'number', align: 'right' },
      { key: 'credit', header: 'Credit', type: 'number', align: 'right' }
    ],
    searchKeys: ['voucherNo', 'accountName', 'description'],
    actions: [],
    reportFilters: true
  },
  {
    key: 'collection-forecast',
    title: 'Collection Forecast',
    subtitle: 'Expected customer collections',
    endpoint: { list: '/ArCollectionForecast/summary' },
    columns: [
      { key: 'customerName', header: 'Customer' },
      { key: 'invoiceNo', header: 'Invoice' },
      { key: 'dueDate', header: 'Due Date', type: 'date' },
      { key: 'expectedDate', header: 'Expected', type: 'date' },
      { key: 'amount', header: 'Amount', type: 'number', align: 'right' },
      { key: 'probability', header: 'Probability', type: 'number', align: 'right' }
    ],
    searchKeys: ['customerName', 'invoiceNo'],
    actions: [],
    reportFilters: true
  },
  {
    key: 'invoice-email',
    title: 'Invoice Email',
    subtitle: 'Invoice email queue and resend actions',
    endpoint: { list: '/invoiceemail/invoices?docType=SI', email: '/invoiceemail/sales/' },
    columns: [
      { key: 'invoiceNo', header: 'Invoice' },
      { key: 'customerName', header: 'Customer' },
      { key: 'emailTo', header: 'Email' },
      { key: 'sentDate', header: 'Sent Date', type: 'date' },
      { key: 'status', header: 'Status', type: 'badge' }
    ],
    searchKeys: ['invoiceNo', 'customerName', 'emailTo', 'status'],
    actions: ['email']
  }
];
