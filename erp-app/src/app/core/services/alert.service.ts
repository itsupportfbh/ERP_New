import { Injectable } from '@angular/core';

export interface AlertResult {
  isConfirmed: boolean;
  isDismissed?: boolean;
  value?: unknown;
}

@Injectable({ providedIn: 'root' })
export class AlertService {
  success(title: string, message?: string): Promise<AlertResult> {
    window.alert(this.text(title, message));
    return Promise.resolve({ isConfirmed: true });
  }

  error(title: string, message?: string): Promise<AlertResult> {
    window.alert(this.text(title, message));
    return Promise.resolve({ isConfirmed: true });
  }

  warning(title: string, message?: string): Promise<AlertResult> {
    window.alert(this.text(title, message));
    return Promise.resolve({ isConfirmed: true });
  }

  info(title: string, message?: string): Promise<AlertResult> {
    window.alert(this.text(title, message));
    return Promise.resolve({ isConfirmed: true });
  }

  confirm(
    title: string,
    text: string = 'This action cannot be undone.',
    confirmText = 'Yes, proceed',
    cancelText = 'Cancel'
  ): Promise<AlertResult> {
    const ok = window.confirm(`${title}\n\n${text}\n\n${confirmText} / ${cancelText}`);
    return Promise.resolve({ isConfirmed: ok, isDismissed: !ok });
  }

  toast(message: string): Promise<AlertResult> {
    window.alert(message);
    return Promise.resolve({ isConfirmed: true });
  }

  private text(title: string, message?: string): string {
    return message ? `${title}\n\n${message}` : title;
  }
}
