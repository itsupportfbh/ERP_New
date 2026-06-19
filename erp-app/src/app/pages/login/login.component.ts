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
  private pendingOrgGuid = '';

  constructor(private auth: AuthService, private router: Router) {
    if (this.auth.isLoggedIn()) this.router.navigate(['/app/dashboard']);
  }

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
          this.pendingOrgGuid = res.data.orgGuid;
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

  selectCompany(): void {
    if (!this.selectedCompanyId) { this.error = 'Please select a company.'; return; }
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
