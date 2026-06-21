import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'erp-reset-password',
  standalone: false,
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {
  newPassword = '';
  confirmPassword = '';
  showNew = false;
  showConfirm = false;
  loading = false;
  submitted = false;
  token = '';
  email = '';

  readonly passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.token = decodeURIComponent(this.route.snapshot.queryParamMap.get('token') || '');
    this.email = this.route.snapshot.queryParamMap.get('email') || '';
  }

  get passwordMismatch(): boolean {
    return !!this.confirmPassword && this.confirmPassword !== this.newPassword;
  }

  get passwordInvalid(): boolean {
    return !!this.newPassword && !this.passwordPattern.test(this.newPassword);
  }

  onSubmit(): void {
    this.submitted = true;
    if (!this.newPassword || !this.confirmPassword) return;
    if (this.passwordInvalid || this.passwordMismatch) return;

    this.loading = true;
    this.auth.resetPassword({ token: this.token, email: this.email, newPassword: this.newPassword }).subscribe({
      next: () => {
        this.loading = false;
        Swal.fire({
          icon: 'success',
          title: 'Password Reset!',
          text: 'Your password has been reset successfully.',
          confirmButtonColor: '#2E5F73',
          showConfirmButton: false,
          timer: 2500
        });
        setTimeout(() => this.router.navigate(['/login']), 1000);
      },
      error: (err) => {
        this.loading = false;
        const msg = err.error?.message || (typeof err.error === 'string' ? err.error : 'Something went wrong.');
        Swal.fire({ icon: 'error', title: 'Error', text: msg, confirmButtonColor: '#d33' });
      }
    });
  }
}
