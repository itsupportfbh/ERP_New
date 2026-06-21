import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'erp-forgot-password',
  standalone: false,
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent {
  email = '';
  loading = false;
  submitted = false;

  constructor(private auth: AuthService, private router: Router) {}

  onSubmit(): void {
    this.submitted = true;
    if (!this.email.trim()) return;

    this.loading = true;
    this.auth.forgotPassword({ email: this.email.trim() }).subscribe({
      next: () => {
        this.loading = false;
        Swal.fire({
          icon: 'success',
          title: 'Email Sent!',
          text: 'A password reset link has been sent to your email.',
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
