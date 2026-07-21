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
          this.companies = res.data.companies;
          if (this.isHqAdmin(res.data)) {
            this.chooseAllCompanies();
            this.selectCompany();
            return;
          }
          this.selectedCompanyId = null;
          this.pendingOrgGuid = '';
          this.selectedAllCompanies = false;
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

  chooseCompany(company: any): void {
    this.selectedCompanyId = Number(company?.id ?? company?.Id) || null;
    this.pendingOrgGuid = company?.orgGuid ?? company?.OrgGuid ?? '';
    this.selectedAllCompanies = false;
    this.error = '';
  }

  chooseAllCompanies(): void {
    const first = this.companies[0];
    this.selectedCompanyId = Number(first?.id ?? first?.Id) || null;
    this.pendingOrgGuid = first?.orgGuid ?? first?.OrgGuid ?? '';
    this.selectedAllCompanies = true;
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

  private isHqAdmin(data: any): boolean {
    const roles = Array.isArray(data?.approvalLevelNames) ? data.approvalLevelNames : [];
    const adminRoles = new Set(['superadmin', 'master', 'systemadministrator', 'admin', 'orgadmin', 'owner', 'orgowner']);
    const hasAdminRole = roles.some((role: any) =>
      adminRoles.has(String(role || '').toLowerCase().replace(/[\s_-]/g, ''))
    );
    return hasAdminRole && Number(data?.companyId ?? 0) === 1;
  }
}
