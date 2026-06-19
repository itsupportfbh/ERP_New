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
  username = '';
  password = '';
  rememberMe = false;
  showPassword = false;
  error = '';
  loading = false;
  uFocus = false;
  pFocus = false;

  private readonly REMEMBER_KEY = 'erp_remember_user';

  constructor(private auth: AuthService, private router: Router) {
    if (this.auth.isLoggedIn()) this.router.navigate(['/app/dashboard']);
  }

  ngOnInit(): void {
    const saved = localStorage.getItem(this.REMEMBER_KEY);
    if (saved) { this.username = saved; this.rememberMe = true; }
  }

  onLogin(): void {
    this.error = '';
    if (!this.username.trim()) { this.error = 'Please enter your username.'; return; }
    if (!this.password)        { this.error = 'Please enter your password.';  return; }
    this.loading = true;
    setTimeout(() => {
      const ok = this.auth.login(this.username.trim(), this.password);
      this.loading = false;
      if (ok) {
        this.rememberMe
          ? localStorage.setItem(this.REMEMBER_KEY, this.username.trim())
          : localStorage.removeItem(this.REMEMBER_KEY);
        this.router.navigate(['/app/dashboard']);
      } else {
        this.error = 'Invalid username or password.';
      }
    }, 700);
  }
}
