import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'erp-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  rememberMe = false;
  showPassword = false;
  error = '';
  loading = false;
  uFocus = false;
  pFocus = false;

  // Company selection
  showCompanySelect = false;
  companies: any[] = [];
  selectedCompanyId: number | null = null;
  pendingOrgGuid = '';
  selectedAllCompanies = false;
  companyChoice = '';

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    const saved = this.auth.getRememberedUser();
    if (saved) { this.email = saved; this.rememberMe = true; }
  }

  onLogin(): void {
    this.error = '';
    if (!this.email.trim()) { this.error = 'Please enter your email.'; return; }
    if (!this.password)     { this.error = 'Please enter your password.'; return; }

    this.loading = true;
    this.auth.login({ email: this.email.trim(), password: this.password }).subscribe({
      next: (res) => {
        this.loading = false;
        if (!res.success) { this.error = 'Invalid credentials.'; return; }

        if (res.data.requiresCompanySelection && res.data.companies?.length > 1) {
          // Everyone picks their own company, admins included. Silently opening
          // an admin in "All companies" made the whole session read-only - that
          // mode is a cross-company overview, so a company admin lost the
          // Create / Edit / Delete their RolesJSON actually grants and had no
          // way back except changing the company in the topbar.
          this.companies = res.data.companies;
          this.selectedCompanyId = null;
          this.pendingOrgGuid = '';
          this.selectedAllCompanies = false;
          this.companyChoice = '';
          this.showCompanySelect = true;
        } else {
          this.afterLogin();
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err.message || 'Login failed. Please try again.';
      }
    });
  }

  /** Company id alone is not unique across organizations, so the dropdown is
   *  keyed by org + id - the same pair selectCompany() resolves against. */
  companyOptionKey(company: any): string {
    return `${company?.orgGuid ?? company?.OrgGuid ?? ''}|${Number(company?.id ?? company?.Id) || 0}`;
  }

  onCompanyChoice(key: string): void {
    this.companyChoice = key;
    if (key === 'ALL') { this.chooseAllCompanies(); return; }
    const match = this.companies.find(c => this.companyOptionKey(c) === key);
    if (match) this.chooseCompany(match);
  }

  /** Tenant database of the current pick, shown under the dropdown - the card
   *  layout used to surface it and it is how users tell look-alike names apart. */
  get selectedCompanyDatabase(): string {
    if (!this.companyChoice || this.selectedAllCompanies) return '';
    const match = this.companies.find(c => this.companyOptionKey(c) === this.companyChoice);
    return match?.databaseName ?? match?.DatabaseName ?? '';
  }

  chooseCompany(company: any): void {
    this.selectedCompanyId = Number(company?.id ?? company?.Id) || null;
    this.pendingOrgGuid = company?.orgGuid ?? company?.OrgGuid ?? '';
    this.selectedAllCompanies = false;
    this.companyChoice = this.companyOptionKey(company);
    this.error = '';
  }

  chooseAllCompanies(): void {
    const first = this.companies[0];
    this.selectedCompanyId = Number(first?.id ?? first?.Id) || null;
    this.pendingOrgGuid = first?.orgGuid ?? first?.OrgGuid ?? '';
    this.selectedAllCompanies = true;
    this.companyChoice = 'ALL';
    this.error = '';
  }

  selectCompany(): void {
    if (!this.selectedCompanyId) { this.error = 'Please select a company.'; return; }
    const selected = this.companies.find(c =>
      Number(c.id ?? c.Id) === Number(this.selectedCompanyId) &&
      (!this.pendingOrgGuid || (c.orgGuid ?? c.OrgGuid) === this.pendingOrgGuid)
    );
    this.pendingOrgGuid = selected?.orgGuid ?? selected?.OrgGuid ?? '';

    this.loading = true;
    this.auth.login({
      email: this.email.trim(),
      password: this.password,
      selectedCompanyId: this.selectedCompanyId,
      selectedOrgGuid: this.pendingOrgGuid
    }).subscribe({
      next: () => {
        this.loading = false;
        this.showCompanySelect = false;
        if (this.selectedAllCompanies) {
          localStorage.setItem('companyId', '0');
          localStorage.setItem('companyName', 'All companies');
          localStorage.setItem('selectedCompanyKey', 'ALL_COMPANIES');
        }
        this.afterLogin();
      },
      error: (err) => {
        this.loading = false;
        this.error = err.message || 'Company selection failed.';
      }
    });
  }

  private afterLogin(): void {
    this.rememberMe
      ? this.auth.setRememberedUser(this.email.trim())
      : this.auth.clearRememberedUser();
    this.router.navigate(['/app/dashboard']);
  }
}
