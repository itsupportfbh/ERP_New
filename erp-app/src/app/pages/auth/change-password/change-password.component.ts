import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'erp-change-password',
  standalone: false,
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss']
})
export class ChangePasswordComponent {
  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  showCurrent = false;
  showNew = false;
  showConfirm = false;
  loading = false;
  submitted = false;
  userEmail = localStorage.getItem('email') || '';

  readonly passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

  constructor(private auth: AuthService, private router: Router) {}

  get passwordInvalid(): boolean {
    return !!this.newPassword && !this.passwordPattern.test(this.newPassword);
  }

  get passwordMismatch(): boolean {
    return !!this.confirmNewPassword && this.confirmNewPassword !== this.newPassword;
  }

  onSubmit(): void {
    this.submitted = true;
    if (!this.currentPassword || !this.newPassword || !this.confirmNewPassword) return;
    if (this.passwordInvalid || this.passwordMismatch) return;

    this.loading = true;
    this.auth.changePassword({
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
      confirmNewPassword: this.confirmNewPassword
    }).subscribe({
      next: () => {
        this.loading = false;
        Swal.fire({
          icon: 'success',
          title: 'Password Changed!',
          text: 'Your password has been updated successfully.',
          confirmButtonColor: '#2E5F73',
          showConfirmButton: false,
          timer: 2000
        });
        setTimeout(() => this.auth.logout(), 1500);
      },
      error: (err) => {
        this.loading = false;
        const msg = err.error?.message || (typeof err.error === 'string' ? err.error : 'Something went wrong.');
        Swal.fire({ icon: 'error', title: 'Error', text: msg, confirmButtonColor: '#d33' });
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/app/dashboard']);
  }
}
