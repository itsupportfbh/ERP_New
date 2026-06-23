import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { DropdownOption } from '../../../shared/components/dropdown/dropdown.component';
import {
  BusinessPartnersService,
  CustomerPayload,
  PartnerType,
  SupplierPayload,
  UserPayload
} from '../business-partners.service';

interface ComplianceFile {
  name: string;
  base64: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface ComplianceDoc {
  name: string;
  number: string | null;
  expiry: string | null;
  files: ComplianceFile[];
}

interface KycFileMap {
  drivingLicence: File | null;
  utilityBill: File | null;
  bankStatement: File | null;
  acra: File | null;
}

interface KycPreviewMap {
  drivingLicence: string | null;
  utilityBill: string | null;
  bankStatement: string | null;
  acra: string | null;
}

@Component({
  selector: 'erp-partner-form',
  standalone: false,
  templateUrl: './partner-form.component.html',
  styleUrls: ['./partner-form.component.scss']
})
export class PartnerFormComponent implements OnInit {
  type: PartnerType = 'customers';
  id: string | null = null;
  loading = false;
  saving = false;
  error = '';

  customer: CustomerPayload = this.emptyCustomer();
  supplier: SupplierPayload = this.emptySupplier();
  user: UserPayload = this.emptyUser();

  countryOptions: DropdownOption[] = [];
  customerGroupOptions: DropdownOption[] = [];
  paymentTermOptions: DropdownOption[] = [];
  currencyOptions: DropdownOption[] = [];
  incotermOptions: DropdownOption[] = [];
  itemOptions: DropdownOption[] = [];
  ledgerOptions: DropdownOption[] = [];
  departmentOptions: DropdownOption[] = [];
  locationOptions: DropdownOption[] = [];
  approvalLevelOptions: DropdownOption[] = [];
  statusOptions: DropdownOption[] = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 2 },
    { label: 'On Hold', value: 3 }
  ];
  userStatusOptions: DropdownOption[] = [
    { label: 'Active', value: true },
    { label: 'Inactive', value: false }
  ];

  existingCustomers: any[] = [];
  customerStep = 1;
  kycLocked = false;
  kycFiles: KycFileMap = {
    drivingLicence: null,
    utilityBill: null,
    bankStatement: null,
    acra: null
  };
  kycPreview: KycPreviewMap = {
    drivingLicence: null,
    utilityBill: null,
    bankStatement: null,
    acra: null
  };

  supplierPreferredItemIds: number[] = [];
  supplierDocs: ComplianceDoc[] = [{ name: '', number: '', expiry: null, files: [] }];
  exchangeRate: number | null = null;
  exchangeRateLoading = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private partners: BusinessPartnersService
  ) {}

  get isEdit(): boolean {
    return !!this.id;
  }

  get title(): string {
    const label = this.type === 'customers'
      ? 'Customer'
      : this.type === 'suppliers'
        ? 'Supplier'
        : 'User';
    return `${this.isEdit ? 'Edit' : 'New'} ${label}`;
  }

  ngOnInit(): void {
    const routeType = this.route.snapshot.paramMap.get('type');
    this.type = routeType === 'suppliers' || routeType === 'users' ? routeType : 'customers';
    const routeId = this.route.snapshot.paramMap.get('id');
    this.id = routeId === 'new' ? null : routeId;

    this.loadSharedMasters();
    if (this.type === 'customers') this.loadCustomerMasters();
    if (this.type === 'suppliers') this.loadSupplierMasters();
    if (this.type === 'users') this.loadUserMasters();
    if (this.id) this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const request = this.type === 'customers'
      ? this.partners.getCustomerById(this.id as string)
      : this.type === 'suppliers'
        ? this.partners.getSupplierById(this.id as string)
        : this.partners.getUserById(this.id as string);

    request.subscribe({
      next: response => {
        const data = this.partners.unwrapOne(response);
        if (this.type === 'customers') this.patchCustomer(data);
        else if (this.type === 'suppliers') this.patchSupplier(data);
        else this.patchUser(data);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = 'Unable to load selected record.';
        void this.showError('Load Failed', this.error);
      }
    });
  }

  async save(): Promise<void> {
    this.error = '';
    if (!this.validate()) {
      if (this.error) await this.showWarning('Validation', this.error);
      return;
    }

    if (this.type === 'customers' && !this.isEdit) {
      const duplicateHandled = await this.handleDuplicateCustomer();
      if (duplicateHandled) return;
    }

    this.saving = true;
    const request = this.type === 'customers'
      ? this.saveCustomer()
      : this.type === 'suppliers'
        ? this.saveSupplier()
        : this.saveUser();

    request.subscribe({
      next: async (res: any) => {
        this.saving = false;
        if (res && res.isSuccess === false) {
          this.error = res.message || 'Unable to save record.';
          void this.showError('Save Failed', this.error);
          return;
        }
        await this.showSuccess(
          this.isEdit ? 'Updated' : 'Created',
          `${this.title} saved successfully.`
        );
        this.back();
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message || err?.error?.title || 'Unable to save record.';
        void this.showError('Save Failed', this.error);
      }
    });
  }

  back(): void {
    this.router.navigate(['/app/business-partners'], {
      queryParams: { tab: this.type }
    });
  }

  onCustomerCountryChange(countryId: number | null): void {
    this.customer.countryId = this.toNumber(countryId);
    this.customer.locationId = null;
    if (!this.customer.countryId) return;
    this.loadLocationsByCountry(this.customer.countryId);
  }

  private loadLocationsByCountry(countryId: number, selectedLocationId?: number | null): void {
    this.partners.getLocationsByCountry(countryId).subscribe({
      next: res => {
        this.locationOptions = this.toOptions(this.partners.unwrapRows(res), 'name', 'id', 'locationName');
        if (selectedLocationId) this.customer.locationId = selectedLocationId;
      },
      error: () => {}
    });
  }

  async nextCustomerStep(): Promise<void> {
    this.error = '';
    if (this.customerStep === 1 && !this.validateCustomerAccount()) {
      if (this.error) await this.showWarning('Validation', this.error);
      return;
    }
    if (this.customerStep === 2 && !this.validateCustomerCommercial()) {
      if (this.error) await this.showWarning('Validation', this.error);
      return;
    }
    this.customerStep = Math.min(3, this.customerStep + 1);
  }

  prevCustomerStep(): void {
    this.error = '';
    this.customerStep = Math.max(1, this.customerStep - 1);
  }

  onKycFile(event: Event, key: 'drivingLicence' | 'utilityBill' | 'bankStatement' | 'acra'): void {
    if (this.kycLocked) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    this.kycFiles[key] = file;
    const reader = new FileReader();
    reader.onload = () => this.kycPreview[key] = String(reader.result || '');
    reader.readAsDataURL(file);
    input.value = '';
  }

  onSupplierCurrencyChange(currencyId: number | null): void {
    this.supplier.currencyId = this.toNumber(currencyId);
    this.exchangeRate = null;
    if (!this.supplier.currencyId) return;
    const companyCurrencyId = Number(localStorage.getItem('companyCurrencyId') || 0);
    if (!companyCurrencyId || companyCurrencyId === this.supplier.currencyId) {
      this.exchangeRate = 1;
      return;
    }
    this.exchangeRateLoading = true;
    const today = new Date().toISOString().substring(0, 10);
    this.partners.getExchangeRate(this.supplier.currencyId, companyCurrencyId, today).subscribe({
      next: res => {
        this.exchangeRate = res?.isSuccess ? (res?.data?.rate ?? null) : null;
        this.exchangeRateLoading = false;
      },
      error: () => {
        this.exchangeRate = null;
        this.exchangeRateLoading = false;
      }
    });
  }

  addSupplierDoc(): void {
    this.supplierDocs.push({ name: '', number: '', expiry: null, files: [] });
  }

  removeSupplierDoc(index: number): void {
    this.supplierDocs.splice(index, 1);
    if (!this.supplierDocs.length) this.addSupplierDoc();
  }

  async onSupplierDocFiles(event: Event, index: number): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    for (const file of files) {
      const dataUrl = await this.readFileAsDataUrl(file);
      const comma = dataUrl.indexOf(',');
      const mime = dataUrl.match(/^data:([^;]+);base64,/i)?.[1] || file.type || 'application/octet-stream';
      this.supplierDocs[index].files.push({
        name: file.name,
        base64: comma >= 0 ? dataUrl.substring(comma + 1) : '',
        mimeType: mime,
        size: file.size,
        dataUrl
      });
    }
    input.value = '';
  }

  removeSupplierDocFile(docIndex: number, fileIndex: number): void {
    this.supplierDocs[docIndex].files.splice(fileIndex, 1);
  }

  toggleRole(id: number): void {
    const ids = this.user.approvalLevelIds ?? [];
    const idx = ids.indexOf(id);
    this.user.approvalLevelIds = idx === -1 ? [...ids, id] : ids.filter(v => v !== id);
  }

  private saveCustomer() {
    const formData = new FormData();

    if (this.customer.kycId) formData.append('KycId', this.customer.kycId.toString());
    const customerId = this.customer.customerId ?? (this.id ? Number(this.id) : null);
    if (customerId) formData.append('CustomerId', customerId.toString());

    formData.append('CustomerName', this.customer.customerName || '');
    formData.append('CountryId', (this.customer.countryId ?? '').toString());
    formData.append('LocationId', (this.customer.locationId ?? '').toString());
    formData.append('ContactNumber', this.customer.phone || '');
    formData.append('PointOfContactPerson', this.customer.contactPerson || '');
    formData.append('Email', this.customer.email || '');
    formData.append('CustomerGroupId', (this.customer.customerGroupId ?? '').toString());
    formData.append('BudgetLineId', (this.customer.budgetLineId ?? '').toString());
    formData.append('PaymentTermId', (this.customer.paymentTermId ?? '').toString());
    formData.append('CreditAmount', (this.customer.creditAmount ?? 0).toString());
    formData.append('CreatedBy', String(Number(localStorage.getItem('id')) || 0));
    formData.append('UpdatedBy', String(Number(localStorage.getItem('id')) || 0));
    formData.append('CompanyId', (localStorage.getItem('companyId') || '0').toString());

    const approvedId = Number(this.customer.approvedBy || 0);
    const isApproved = this.kycLocked || approvedId > 0;
    formData.append('IsApproved', isApproved ? 'true' : 'false');
    if (approvedId > 0) {
      formData.append('ApprovedBy', String(approvedId));
    }

    if (!this.kycLocked) {
      if (this.kycFiles.drivingLicence) formData.append('DrivingLicence', this.kycFiles.drivingLicence);
      if (this.kycFiles.utilityBill) formData.append('UtilityBill', this.kycFiles.utilityBill);
      if (this.kycFiles.bankStatement) formData.append('BankStatement', this.kycFiles.bankStatement);
      if (this.kycFiles.acra) formData.append('Acra', this.kycFiles.acra);
    }

    return this.isEdit
      ? this.partners.updateCustomer(formData)
      : this.partners.createCustomer(formData);
  }

  private saveSupplier() {
    const payload = this.normalizeSupplierPayload();
    return this.isEdit
      ? this.partners.updateSupplier(payload)
      : this.partners.createSupplier(payload);
  }

  private saveUser() {
    const loginUserId = Number(localStorage.getItem('id')) || null;
    const companyId   = Number(localStorage.getItem('companyId') || 0) || null;
    const rawOrgGuid  = localStorage.getItem('orgGuid') || '';
    const orgGuid     = rawOrgGuid === 'undefined' ? '' : rawOrgGuid;
    const now = new Date().toISOString();
    const payload: UserPayload = {
      username: this.user.username?.trim(),
      email: this.user.email?.trim(),
      departmentId: this.toNumber(this.user.departmentId),
      locationId: this.toNumber(this.user.locationId),
      approvalLevelIds: this.toNumberArray(this.user.approvalLevelIds || []),
      teams: this.user.teams || [],
      companyId,
      orgGuid,
      updatedBy: loginUserId,
      updatedDate: now,
      isActive: this.user.isActive !== false
    };

    if (!this.isEdit) {
      payload.password = this.user.password || '';
      payload.createdBy = loginUserId;
      payload.createdDate = now;
    } else if (this.user.password) {
      payload.password = this.user.password;
    }

    return this.isEdit
      ? this.partners.updateUser(this.id as string, payload)
      : this.partners.createUser(payload);
  }

  private loadUserMasters(): void {
    this.partners.getApprovalLevels().subscribe({
      next: res => this.approvalLevelOptions = this.toOptions(this.partners.unwrapRows(res), 'name', 'id'),
      error: () => this.approvalLevelOptions = []
    });

    this.partners.getDepartments().subscribe({
      next: res => this.departmentOptions = this.toOptions(this.partners.unwrapRows(res), 'name', 'id', 'departmentName'),
      error: () => this.departmentOptions = []
    });

    this.partners.getLocations().subscribe({
      next: res => this.locationOptions = this.toOptions(this.partners.unwrapRows(res), 'locationName', 'id', 'name'),
      error: () => this.locationOptions = []
    });
  }

  private loadSharedMasters(): void {
    this.partners.getCountries().pipe(catchError(() => of([]))).subscribe(res => {
      this.countryOptions = this.toOptions(this.partners.unwrapRows(res), 'countryName', 'id', 'name');
    });
    this.partners.getLocations().pipe(catchError(() => of([]))).subscribe(res => {
      this.locationOptions = this.toOptions(this.partners.unwrapRows(res), 'locationName', 'id', 'name');
    });
  }

  private loadCustomerMasters(): void {
    forkJoin({
      groups: this.partners.getCustomerGroups().pipe(catchError(() => of([]))),
      terms: this.partners.getPaymentTerms().pipe(catchError(() => of([]))),
      ledgers: this.partners.getChartOfAccounts().pipe(catchError(() => of([]))),
      approvers: this.partners.getApprovalLevels().pipe(catchError(() => of([]))),
      customers: this.partners.getAllCustomerMaster().pipe(catchError(() => of([])))
    }).subscribe(({ groups, terms, ledgers, approvers, customers }) => {
      this.customerGroupOptions = this.toOptions(this.partners.unwrapRows(groups), 'name', 'id', 'customerGroupName');
      this.paymentTermOptions = this.toOptions(this.partners.unwrapRows(terms), 'paymentTermsName', 'id', 'name');
      this.ledgerOptions = this.toLedgerOptions(this.partners.unwrapRows(ledgers));
      this.approvalLevelOptions = this.toOptions(this.partners.unwrapRows(approvers), 'name', 'id');
      this.existingCustomers = this.partners.unwrapRows(customers);
    });
  }

  private loadSupplierMasters(): void {
    forkJoin({
      terms: this.partners.getPaymentTerms().pipe(catchError(() => of([]))),
      currencies: this.partners.getCurrencies().pipe(catchError(() => of([]))),
      incoterms: this.partners.getIncoterms().pipe(catchError(() => of([]))),
      items: this.partners.getItems().pipe(catchError(() => of([]))),
      ledgers: this.partners.getChartOfAccounts().pipe(catchError(() => of([])))
    }).subscribe(({ terms, currencies, incoterms, items, ledgers }) => {
      this.paymentTermOptions = this.toOptions(this.activeRows(terms), 'paymentTermsName', 'id', 'name');
      this.currencyOptions = this.toOptions(this.activeRows(currencies), 'currencyName', 'id', 'name');
      this.incotermOptions = this.toOptions(this.activeRows(incoterms), 'incotermsName', 'id', 'name');
      this.itemOptions = this.toOptions(this.activeRows(items), 'itemName', 'id', 'name');
      this.ledgerOptions = this.toLedgerOptions(this.activeRows(ledgers));
    });
  }

  private validate(): boolean {
    if (this.type === 'customers') return this.validateCustomerAccount() && this.validateCustomerCommercial();

    if (this.type === 'suppliers' && !this.supplier.name?.trim()) {
      this.error = 'Supplier name is required.';
      return false;
    }

    if (this.type === 'users') {
      if (!this.user.username?.trim() || !this.user.email?.trim()) {
        this.error = 'Username and email are required.';
        return false;
      }
      if (!this.isEdit && !this.user.password) {
        this.error = 'Password is required for new user.';
        return false;
      }
      if (!this.user.departmentId || !this.user.locationId) {
        this.error = 'Department and location are required.';
        return false;
      }
    }

    return true;
  }

  private async handleDuplicateCustomer(): Promise<boolean> {
    const duplicate = this.findDuplicateCustomer();
    if (!duplicate) return false;
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Customer Exists',
      text: 'Customer already exists for selected Country and Location. Load existing record instead?',
      showCancelButton: true,
      confirmButtonText: 'Load Existing',
      cancelButtonText: 'Stay Here',
      confirmButtonColor: '#16a34a'
    });
    if (result.isConfirmed) {
      const dupId = duplicate.customerId ?? duplicate.CustomerId ?? duplicate.id ?? duplicate.Id;
      if (dupId) {
        this.id = String(dupId);
        this.router.navigate(['/app/business-partners', 'customers', dupId]);
        this.load();
      }
    }
    return true;
  }

  private showWarning(title: string, text: string) {
    return Swal.fire({ icon: 'warning', title, text, confirmButtonColor: '#16a34a' });
  }

  private showError(title: string, text: string) {
    return Swal.fire({ icon: 'error', title, text, confirmButtonColor: '#16a34a' });
  }

  private showSuccess(title: string, text: string) {
    return Swal.fire({ icon: 'success', title, text, confirmButtonColor: '#16a34a' });
  }

  private patchCustomer(data: any): void {
    this.customer = {
      customerId: this.pick(data, 'customerId', 'CustomerId', 'id', 'Id') ?? null,
      kycId: this.pick(data, 'kycId', 'KycId') ?? null,
      customerName: this.pick(data, 'customerName', 'CustomerName') ?? '',
      customerCode: this.pick(data, 'customerCode', 'CustomerCode') ?? '',
      customerGroupId: this.pick(data, 'customerGroupId', 'CustomerGroupId') ?? null,
      contactPerson: this.pick(data, 'contactPerson', 'ContactPerson', 'pointOfContactPerson', 'PointOfContactPerson', 'contact', 'Contact') ?? '',
      email: this.pick(data, 'email', 'Email') ?? '',
      phone: this.pick(data, 'phone', 'Phone', 'contactNumber', 'ContactNumber') ?? '',
      address: this.pick(data, 'address', 'Address') ?? '',
      taxRegNo: this.pick(data, 'taxRegNo', 'TaxRegNo') ?? '',
      countryId: this.pick(data, 'countryId', 'CountryId') ?? null,
      locationId: this.pick(data, 'locationId', 'LocationId') ?? null,
      statusId: this.pick(data, 'statusId', 'StatusId') ?? 1,
      paymentTermId: this.pick(data, 'paymentTermId', 'PaymentTermId') ?? null,
      budgetLineId: this.pick(data, 'budgetLineId', 'BudgetLineId') ?? null,
      creditAmount: this.pick(data, 'creditAmount', 'CreditAmount') ?? null,
      approvedBy: this.toNumber(this.pick(data, 'approvedBy', 'ApprovedBy')),
      isApproved: this.pick(data, 'isApproved', 'IsApproved') ?? false
    };
    this.kycLocked = this.customer.isApproved === true;
    const base = this.baseApiUrl();
    this.kycPreview.drivingLicence = this.toAssetUrl(this.pick(data, 'dlImage', 'DLImage'), base);
    this.kycPreview.utilityBill = this.toAssetUrl(this.pick(data, 'utilityBillImage', 'UtilityBillImage'), base);
    this.kycPreview.bankStatement = this.toAssetUrl(this.pick(data, 'bsImage', 'BSImage'), base);
    this.kycPreview.acra = this.toAssetUrl(this.pick(data, 'acraImage', 'AcraImage', 'ACRAImage'), base);
    if (this.customer.countryId) this.loadLocationsByCountry(this.customer.countryId, this.customer.locationId);
  }

  private patchSupplier(data: any): void {
    this.supplier = {
      id: this.pick(data, 'id', 'Id', 'supplierId', 'SupplierId') ?? null,
      name: this.pick(data, 'name', 'Name', 'supplierName', 'SupplierName') ?? '',
      code: this.pick(data, 'code', 'Code') ?? '',
      contact: this.pick(data, 'contact', 'Contact', 'contactPerson', 'ContactPerson') ?? '',
      email: this.pick(data, 'email', 'Email') ?? '',
      phone: this.pick(data, 'phone', 'Phone') ?? '',
      address: this.pick(data, 'address', 'Address') ?? '',
      taxReg: this.pick(data, 'taxReg', 'TaxReg') ?? '',
      leadTime: this.pick(data, 'leadTime', 'LeadTime') ?? null,
      statusId: this.pick(data, 'statusId', 'StatusId') ?? null,
      countryId: this.pick(data, 'countryId', 'CountryId') ?? null,
      termsId: this.pick(data, 'termsId', 'TermsId') ?? null,
      currencyId: this.pick(data, 'currencyId', 'CurrencyId') ?? null,
      incotermsId: this.pick(data, 'incotermsId', 'IncotermsId') ?? null,
      budgetLineId: this.pick(data, 'budgetLineId', 'BudgetLineId') ?? null,
      bankName: this.pick(data, 'bankName', 'BankName') ?? '',
      bankAcc: this.pick(data, 'bankAcc', 'BankAcc') ?? '',
      bankSwift: this.pick(data, 'bankSwift', 'BankSwift') ?? '',
      bankBranch: this.pick(data, 'bankBranch', 'BankBranch') ?? ''
    };
    this.supplierPreferredItemIds = String(this.pick(data, 'itemID', 'ItemID') ?? '')
      .split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isFinite(value) && value > 0);
    this.supplierDocs = this.parseComplianceDocs(this.pick(data, 'complianceDocuments', 'ComplianceDocuments'));
    if (!this.supplierDocs.length) this.supplierDocs = [{ name: '', number: '', expiry: null, files: [] }];
    if (this.supplier.currencyId) this.onSupplierCurrencyChange(this.supplier.currencyId);
  }

  private patchUser(data: any): void {
    this.user = {
      id: data?.id ?? data?.userId ?? data?.UserId ?? data?.Id ?? null,
      username: data?.username ?? data?.Username ?? '',
      email: data?.email ?? data?.Email ?? '',
      password: '',
      departmentId: this.toNumber(data?.departmentId ?? data?.DepartmentId),
      locationId: this.toNumber(data?.locationId ?? data?.LocationId),
      approvalLevelIds: this.toNumberArray(
        data?.approvalLevelIds ?? data?.ApprovalLevelIds ??
        data?.approvalLevelId ?? data?.ApprovalLevelId ?? []
      ),
      teams: data?.teams ?? data?.Teams ?? [],
      isActive: data?.isActive ?? data?.IsActive ?? true
    };
  }

  private normalizeSupplierPayload(): SupplierPayload {
    const docs = this.supplierDocs.map(doc => ({
      name: (doc.name || '').trim(),
      number: doc.number || null,
      expiry: doc.expiry ? new Date(doc.expiry).toISOString() : null,
      files: doc.files.map(file => ({
        fileName: file.name,
        fileUrl: file.base64,
        mimeType: file.mimeType,
        size: file.size
      }))
    }));
    const userId = Number(localStorage.getItem('id')) || null;
    return {
      ...this.supplier,
      id: this.toNumber(this.supplier.id),
      leadTime: this.toNumber(this.supplier.leadTime),
      statusId: this.toNumber(this.supplier.statusId),
      countryId: this.toNumber(this.supplier.countryId),
      termsId: this.toNumber(this.supplier.termsId),
      currencyId: this.toNumber(this.supplier.currencyId),
      incotermsId: this.toNumber(this.supplier.incotermsId),
      budgetLineId: this.toNumber(this.supplier.budgetLineId),
      itemID: this.supplierPreferredItemIds.join(','),
      ComplianceDocuments: JSON.stringify(docs),
      createdBy: userId,
      updatedBy: userId
    };
  }

  private validateCustomerAccount(): boolean {
    if (!this.customer.customerName?.trim()) {
      this.error = 'Customer name is required.';
      return false;
    }
    if (!this.customer.countryId || !this.customer.locationId) {
      this.error = 'Country and location are required.';
      return false;
    }
    if (!this.customer.contactPerson?.trim() || !this.customer.email?.trim() || !this.customer.phone?.trim()) {
      this.error = 'Contact person, email and phone are required.';
      return false;
    }
    if (!/^\d{10}$/.test(String(this.customer.phone || '').trim())) {
      this.error = 'Contact number must be 10 digits.';
      return false;
    }
    return true;
  }

  private validateCustomerCommercial(): boolean {
    if (this.customer.creditAmount !== null && this.customer.creditAmount !== undefined && Number(this.customer.creditAmount) < 0) {
      this.error = 'Credit amount cannot be negative.';
      return false;
    }
    return true;
  }

  private findDuplicateCustomer(): any | null {
    const name = (this.customer.customerName || '').trim().toLowerCase();
    const countryId = Number(this.customer.countryId);
    const locationId = Number(this.customer.locationId);
    if (!name || !countryId || !locationId) return null;
    return this.existingCustomers.find(row => {
      const rowId = Number(row?.customerId ?? row?.CustomerId ?? row?.id ?? row?.Id);
      if (this.isEdit && rowId === Number(this.customer.customerId ?? this.id)) return false;
      return (String(row?.customerName ?? row?.CustomerName ?? '').trim().toLowerCase() === name)
        && Number(row?.countryId ?? row?.CountryId) === countryId
        && Number(row?.locationId ?? row?.LocationId) === locationId;
    }) || null;
  }

  private toOptions(rows: any[], primaryLabel: string, valueKey: string, fallbackLabel?: string): DropdownOption[] {
    return rows.map(row => ({
      label: String(this.pick(row, primaryLabel, fallbackLabel || primaryLabel, 'Name', 'name', 'title', 'Title', 'id', 'Id') ?? ''),
      value: this.pick(row, valueKey, 'Id', 'id')
    })).filter(option => option.value !== undefined && option.value !== null);
  }

  private pick(row: any, ...keys: string[]): any {
    if (!row) return undefined;
    for (const key of keys) {
      if (!key) continue;
      if (row[key] !== undefined && row[key] !== null) return row[key];
      const found = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
      if (found && row[found] !== undefined && row[found] !== null) return row[found];
    }
    return undefined;
  }

  private activeRows(response: any): any[] {
    return this.partners.unwrapRows(response).filter(row => row?.isActive !== false && row?.IsActive !== false);
  }

  private toLedgerOptions(rows: any[]): DropdownOption[] {
    const active = rows.filter(row => row?.isActive !== false && row?.IsActive !== false);
    return active.map(row => {
      const label = row?.headCodeName
        ?? row?.HeadCodeName
        ?? this.buildLedgerPath(row, active)
        ?? row?.headName
        ?? row?.HeadName
        ?? row?.name
        ?? row?.id;
      return {
        label: String(label),
        value: row?.id ?? row?.Id
      };
    }).filter(option => option.value !== undefined && option.value !== null);
  }

  private buildLedgerPath(row: any, rows: any[]): string {
    const headName = String(row?.headName ?? row?.HeadName ?? '').trim();
    const headCode = row?.headCode ?? row?.HeadCode ?? '';
    let parentCode = Number(row?.parentHead ?? row?.ParentHead ?? 0);
    let path = headName;
    while (parentCode) {
      const parent = rows.find(item => Number(item?.headCode ?? item?.HeadCode ?? 0) === parentCode);
      if (!parent) break;
      path = `${parent?.headName ?? parent?.HeadName} >> ${path}`;
      parentCode = Number(parent?.parentHead ?? parent?.ParentHead ?? 0);
    }
    return headCode ? `${headCode} - ${path}` : path;
  }

  private parseComplianceDocs(raw: any): ComplianceDoc[] {
    if (!raw) return [];
    let rows: any[] = [];
    try { rows = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
    if (!Array.isArray(rows)) return [];
    return rows.map(row => ({
      name: row?.name ?? '',
      number: row?.number ?? null,
      expiry: this.toDateInput(row?.expiry),
      files: (Array.isArray(row?.files) ? row.files : []).map((file: any) => {
        const name = file?.fileName ?? file?.name ?? 'file';
        const mimeType = file?.mimeType ?? 'application/octet-stream';
        const rawUrl = file?.fileUrl ?? file?.url ?? '';
        const isData = String(rawUrl).startsWith('data:');
        const base64 = isData ? String(rawUrl).split(',')[1] ?? '' : String(rawUrl);
        return {
          name,
          base64,
          mimeType,
          size: Number(file?.size ?? 0),
          dataUrl: isData ? rawUrl : `data:${mimeType};base64,${base64}`
        };
      })
    }));
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private toDateInput(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const time = Date.parse(value);
    if (Number.isNaN(time)) return null;
    return new Date(time).toISOString().substring(0, 10);
  }

  private baseApiUrl(): string {
    return (this.partners as any).apiUrl?.replace(/\/api$/i, '') || '';
  }

  private toAssetUrl(value: any, base: string): string | null {
    if (!value) return null;
    const text = String(value);
    if (text.startsWith('http') || text.startsWith('data:')) return text;
    return `${base}${text}`;
  }

  private toNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private toNumberArray(values: any[]): number[] {
    return (values || [])
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0);
  }

  private emptyCustomer(): CustomerPayload {
    return {
      customerName: '',
      customerCode: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      taxRegNo: '',
      statusId: 1,
      creditAmount: null,
      isApproved: false
    };
  }

  private emptySupplier(): SupplierPayload {
    return {
      name: '',
      code: '',
      contact: '',
      email: '',
      phone: '',
      address: '',
      taxReg: '',
      leadTime: null,
      statusId: 1,
      bankName: '',
      bankAcc: '',
      bankSwift: '',
      bankBranch: ''
    };
  }

  private emptyUser(): UserPayload {
    return {
      username: '',
      email: '',
      password: '',
      departmentId: null,
      locationId: null,
      approvalLevelIds: [],
      teams: [],
      isActive: true
    };
  }
}
