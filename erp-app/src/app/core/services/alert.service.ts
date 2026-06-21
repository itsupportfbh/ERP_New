import { Injectable } from '@angular/core';
import Swal, { SweetAlertResult } from 'sweetalert2';

@Injectable({ providedIn: 'root' })
export class AlertService {

  success(title: string, message?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'success',
      title,
      text: message,
      confirmButtonColor: '#1a5c6e',
      confirmButtonText: 'OK',
      timer: message ? undefined : 2000,
      showConfirmButton: !!message,
    });
  }

  error(title: string, message?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'error',
      title,
      text: message,
      confirmButtonColor: '#1a5c6e',
      confirmButtonText: 'OK',
    });
  }

  warning(title: string, message?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'warning',
      title,
      text: message,
      confirmButtonColor: '#1a5c6e',
      confirmButtonText: 'OK',
    });
  }

  info(title: string, message?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'info',
      title,
      text: message,
      confirmButtonColor: '#1a5c6e',
      confirmButtonText: 'OK',
    });
  }

  confirm(
    title: string,
    text: string = 'This action cannot be undone.',
    confirmText = 'Yes, proceed',
    cancelText = 'Cancel'
  ): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'warning',
      title,
      text,
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#2d8a9e',
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
    });
  }

  toast(
    message: string,
    icon: 'success' | 'error' | 'warning' | 'info' = 'success',
    timer = 3000
  ): Promise<SweetAlertResult> {
    return Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer,
      timerProgressBar: true,
    }).fire({ icon, title: message });
  }
}
