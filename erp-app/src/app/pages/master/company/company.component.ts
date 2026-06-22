import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';

type CompanyTab = 'general' | 'financeTax' | 'defaults' | 'numberSeries' | 'adminUser' | 'audit';

const blankGeneral = () => ({ code: '', name: '', legalName: '', registrationNo: '', taxRegistrationNo: '', status: 'Active', phone: '', email: '', website: '', country: 'Singapore', contactPerson: '', contactMobileNo: '', contactEmail: '', address1: '', address2: '', city: '', state: '', postal: '' });
const blankFinance = () => ({ baseCurrency: 'SGD', currencyId: null as any, country: 'Singapore', countryId: null as any, taxMode: 'Exclusive', gstNo: '', filingFrequency: 'Monthly', defaultOutputTaxCode: '', defaultInputTaxCode: '', decimalPlaces: 2, roundingRule: 'Round half up' });
const blankDefaults = () => ({ defaultBranch: 'Head Office', defaultWarehouse: 'Main Warehouse', defaultBin: 'MAIN', defaultLanguage: 'EN', timeZone: 'Asia/Kolkata' });
const blankAdmin = () => ({ username: '', email: '', password: '', departmentId: 1, locationId: 1 });
const defaultNumberSeries = () => ([
  { document: 'Sales Invoice', prefix: 'SI', nextNo: 1, reset: true },
  { document: 'Purchase Invoice (PIN)', prefix: 'PIN', nextNo: 1, reset: true },
  { document: 'Delivery Order', prefix: 'DO', nextNo: 1, reset: true }
]);

@Component({ selector: 'erp-company', standalone: false, templateUrl: './company.component.html', styleUrls: ['./company.component.scss'] })
export class CompanyComponent implements OnInit {
  // List state
  orgs: any[] = [];
  filteredOrgs: any[] = [];
  searchText = '';
  loading = false;
  totalOrganizations = 0; totalCompanies = 0; activeCompanies = 0; inactiveCompanies = 0;

  // Form state
  isFormVisible = false;
  isEditMode = false;
  selectedId = 0;
  activeTab: CompanyTab = 'general';
  message = ''; isError = false; saving = false;
  showPassword = false;

  // Organization mode
  isNewOrganization = true;
  organizations: any[] = [];
  selectedOrganizationId = 0;
  selectedOrgGuid = '';

  // Dropdown data
  currencies: any[] = [];
  countries: any[] = [];

  // Logo
  logoPreview: string | null = null;

  // Audit
  lastUpdatedBy = '—'; lastUpdatedAt = '—';
  auditTrail: Array<{ date: string; user: string; change: string }> = [];

  // Delete
  showDeleteModal = false;
  itemToDelete: any = null;
  showResultPopup = false; popupIsSuccess = false; popupMessage = '';

  // Forms
  general = blankGeneral();
  financeTax = blankFinance();
  defaults = blankDefaults();
  numberSeries: any[] = defaultNumberSeries();
  integrations = { whatsapp: true, smtp: true, ocr: false, apiEndpoint: '', apiKey: '' };
  adminUser = blankAdmin();

  readonly tabsOrder: CompanyTab[] = ['general', 'financeTax', 'defaults', 'numberSeries', 'adminUser', 'audit'];
  permission: FunctionPermission;
  isPermissionLoaded = false;
  userId: number = 0;
  functionId = 'company';

  constructor(private masterSvc: MasterService, private permissionService: PermissionService) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void { this.loadPermission(); }

  load(): void {
    this.loading = true;
    const approvalRoles: string[] = JSON.parse(localStorage.getItem('approvalRoles') || '[]');
    const isSuperAdmin = approvalRoles.some(x => (x || '').trim().toLowerCase() === 'super admin');
    const approvalLevelName = isSuperAdmin ? 'Super Admin' : '';
    const orgGuid = localStorage.getItem('orgGuid') || '';

    this.masterSvc.getOrganizationCompanyList(approvalLevelName, orgGuid).subscribe({
      next: (res: any) => {
        this.orgs = Array.isArray(res) ? res : (res?.data || []);
        this.filteredOrgs = [...this.orgs];
        this.updateCounts();
        this.loading = false;
      },
      error: () => { this.orgs = []; this.filteredOrgs = []; this.updateCounts(); this.loading = false; }
    });
  }

  updateCounts(): void {
    this.totalOrganizations = this.orgs.length;
    this.totalCompanies = this.orgs.reduce((s, o) => s + (o.companyCount || o.companies?.length || 0), 0);
    this.activeCompanies = this.orgs.reduce((s, o) => s + (o.companies || []).filter((c: any) => c.isActive).length, 0);
    this.inactiveCompanies = this.orgs.reduce((s, o) => s + (o.companies || []).filter((c: any) => !c.isActive).length, 0);
  }

  onSearch(): void {
    const q = (this.searchText || '').trim().toLowerCase();
    if (!q) { this.filteredOrgs = [...this.orgs]; return; }
    this.filteredOrgs = this.orgs.map(org => {
      const orgMatch = (org.orgCode || '').toLowerCase().includes(q) || (org.orgName || '').toLowerCase().includes(q);
      const companyMatches = (org.companies || []).filter((c: any) =>
        (c.companyCode || '').toLowerCase().includes(q) || (c.companyName || '').toLowerCase().includes(q) ||
        (c.adminUsername || '').toLowerCase().includes(q) || (c.adminEmail || '').toLowerCase().includes(q)
      );
      if (orgMatch) return { ...org, companies: [...(org.companies || [])] };
      if (companyMatches.length) return { ...org, companies: companyMatches };
      return null;
    }).filter(Boolean);
  }

  getAvatar(org: any): string {
    const name = (org?.orgName || '').trim();
    if (!name) return '?';
    const words = name.split(' ').filter((x: string) => x);
    return words.length === 1 ? words[0][0].toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();
  }

  // ── Open create form
  showAddForm(): void {
    this.isFormVisible = true;
    this.isEditMode = false;
    this.selectedId = 0;
    this.activeTab = 'general';
    this.general = blankGeneral();
    this.financeTax = blankFinance();
    this.defaults = blankDefaults();
    this.numberSeries = defaultNumberSeries();
    this.integrations = { whatsapp: true, smtp: true, ocr: false, apiEndpoint: '', apiKey: '' };
    this.adminUser = blankAdmin();
    this.logoPreview = null;
    this.isNewOrganization = true;
    this.selectedOrganizationId = 0;
    this.selectedOrgGuid = '';
    this.message = ''; this.isError = false;
    this.loadDropdowns();
  }

  // ── Open edit form
  editCompany(company: any): void {
    this.isFormVisible = true;
    this.isEditMode = true;
    this.selectedId = company.id;
    this.activeTab = 'general';
    this.message = ''; this.isError = false;
    this.loadDropdowns();
    this.loading = true;

    this.masterSvc.getCompanyById(company.id).subscribe({
      next: (res: any) => {
        this.loading = false;
        const g = res.general || {};
        this.general = {
          code: g.code || '', name: g.name || '', legalName: g.legalName || '',
          registrationNo: g.registrationNo || '', taxRegistrationNo: g.taxRegistrationNo || '',
          status: g.status || 'Active', phone: g.phone || '', email: g.email || '',
          website: g.website || '', country: g.country || 'Singapore',
          contactPerson: g.contactPerson || '', contactMobileNo: g.contactMobileNo || '',
          contactEmail: g.contactEmail || '', address1: g.address1 || '',
          address2: g.address2 || '', city: g.city || '', state: g.state || '', postal: g.postal || ''
        };
        const f = res.financeTax || {};
        this.financeTax = {
          baseCurrency: f.baseCurrency || 'SGD', currencyId: f.currencyId || null,
          country: f.country || 'Singapore', countryId: f.countryId || null,
          taxMode: f.taxMode || 'Exclusive', gstNo: f.gstNo || '',
          filingFrequency: f.filingFrequency || 'Monthly',
          defaultOutputTaxCode: f.defaultOutputTaxCode || '',
          defaultInputTaxCode: f.defaultInputTaxCode || '',
          decimalPlaces: f.decimalPlaces ?? 2, roundingRule: f.roundingRule || 'Round half up'
        };
        const d = res.defaults || {};
        this.defaults = { defaultBranch: d.defaultBranch || 'Head Office', defaultWarehouse: d.defaultWarehouse || 'Main Warehouse', defaultBin: d.defaultBin || 'MAIN', defaultLanguage: d.defaultLanguage || 'EN', timeZone: d.timeZone || 'Asia/Kolkata' };
        this.integrations = { whatsapp: res.integrations?.whatsapp ?? true, smtp: res.integrations?.smtp ?? true, ocr: res.integrations?.ocr ?? false, apiEndpoint: res.integrations?.apiEndpoint || '', apiKey: res.integrations?.apiKey || '' };
        this.adminUser = { username: res.initialAdminUser?.username || '', email: res.initialAdminUser?.email || '', password: '', departmentId: res.initialAdminUser?.departmentId || 1, locationId: res.initialAdminUser?.locationId || 1 };
        this.numberSeries = res.numberSeries?.length ? res.numberSeries : defaultNumberSeries();
        this.logoPreview = res.logoBase64 || null;
        this.selectedOrganizationId = res.organizationId || 0;
        this.selectedOrgGuid = res.orgGuid || '';
        this.isNewOrganization = false;
        this.lastUpdatedBy = res.lastUpdatedBy || '—';
        this.lastUpdatedAt = res.lastUpdatedAt || '—';
        this.auditTrail = res.auditTrail || [];
      },
      error: () => { this.loading = false; this.message = 'Failed to load company.'; this.isError = true; }
    });
  }

  loadDropdowns(): void {
    this.masterSvc.getCurrencies().subscribe({ next: (r: any) => { this.currencies = r?.data || r || []; }, error: () => {} });
    this.masterSvc.getCountries().subscribe({ next: (r: any) => { this.countries = r?.data || r || []; }, error: () => {} });
    this.masterSvc.getOrganizationsLookup().subscribe({ next: (r: any) => { this.organizations = r?.data || r || []; }, error: () => {} });
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }

  setTab(tab: CompanyTab): void { this.activeTab = tab; }
  isFirstTab(): boolean { return this.tabsOrder.indexOf(this.activeTab) === 0; }
  isLastTab(): boolean { return this.tabsOrder.indexOf(this.activeTab) === this.tabsOrder.length - 1; }
  goPrev(): void { const i = this.tabsOrder.indexOf(this.activeTab); if (i > 0) this.setTab(this.tabsOrder[i - 1]); }
  goNext(): void { const i = this.tabsOrder.indexOf(this.activeTab); if (i < this.tabsOrder.length - 1) this.setTab(this.tabsOrder[i + 1]); }

  onLogoPicked(evt: Event): void {
    const file = (evt.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.logoPreview = String(reader.result || ''); };
    reader.readAsDataURL(file);
  }
  removeLogo(): void { this.logoPreview = null; }

  addNumberRow(): void { this.numberSeries.push({ document: '', prefix: '', nextNo: 1, reset: false }); }
  removeNumberRow(i: number): void { this.numberSeries.splice(i, 1); }

  onOrgModeChange(isNew: boolean): void {
    this.isNewOrganization = isNew;
    if (isNew) { this.selectedOrganizationId = 0; this.selectedOrgGuid = ''; }
  }

  onOrgSelected(id: any): void {
    this.selectedOrganizationId = Number(id || 0);
    const org = this.organizations.find((x: any) => x.id === this.selectedOrganizationId);
    this.selectedOrgGuid = org?.orgGuid || '';
  }

  save(): void {
    if (!this.general.name?.trim()) { this.message = 'Company Name is required.'; this.isError = true; this.activeTab = 'general'; return; }
    if (!this.general.code?.trim()) { this.message = 'Company Code is required.'; this.isError = true; this.activeTab = 'general'; return; }

    const userId = Number(localStorage.getItem('id') || 0);
    const payload: any = {
      isNewOrganization: this.isEditMode ? false : this.isNewOrganization,
      organizationId: this.isEditMode ? (this.selectedOrganizationId || null) : (this.isNewOrganization ? null : this.selectedOrganizationId),
      orgGuid: this.isEditMode ? (this.selectedOrgGuid || null) : (this.isNewOrganization ? null : this.selectedOrgGuid),
      general: { ...this.general, createdBy: userId },
      financeTax: { ...this.financeTax },
      defaults: { ...this.defaults },
      numberSeries: this.numberSeries.map(x => ({ document: (x.document || '').trim(), prefix: (x.prefix || '').trim(), nextNo: Number(x.nextNo || 1), reset: !!x.reset })),
      integrations: { ...this.integrations },
      initialAdminUser: { ...this.adminUser, password: (this.isEditMode && !this.adminUser.password) ? null : this.adminUser.password },
      logoBase64: this.logoPreview
    };

    this.saving = true; this.message = ''; this.isError = false;
    let req$ = this.isEditMode
      ? this.masterSvc.updateCompany(this.selectedId, payload)
      : (this.isNewOrganization ? this.masterSvc.createCompanySetup(payload) : this.masterSvc.createCompanyUnderOrg(payload));

    req$.subscribe({
      next: (res: any) => {
        this.saving = false;
        this.message = res?.message || (this.isEditMode ? 'Company updated.' : 'Company created.');
        this.isError = false;
        this.auditTrail.unshift({ date: new Date().toLocaleString(), user: String(userId), change: this.isEditMode ? 'Company updated' : 'Company created' });
        this.activeTab = 'audit';
        setTimeout(() => { this.cancel(); this.load(); }, 1500);
      },
      error: (err: any) => { this.saving = false; this.message = err?.error?.message || 'Save failed.'; this.isError = true; }
    });
  }

  openDelete(company: any): void { this.itemToDelete = company; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteCompany(this.itemToDelete.id).subscribe({
      next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } },
      error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; }
    });
  }

  loadPermission(): void {
    if (!this.userId || this.userId <= 0) {
      this.permission = this.permissionService.getEmptyPermission(this.functionId);
      this.isPermissionLoaded = true;
      return;
    }
    this.permissionService.getFunctionPermission(this.userId, this.functionId).subscribe({
      next: (res: FunctionPermission) => {
        this.permission = res || this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
        this.load();
      },
      error: () => {
        this.permission = this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
        this.load();
      }
    });
  }
  canCreate(): boolean { return this.permissionService.hasCreate(this.permission); }
  canEdit(): boolean { return this.permissionService.hasEdit(this.permission); }
  canDelete(): boolean { return this.permissionService.hasDelete(this.permission); }
}
