import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { throwError } from 'rxjs';
import Swal from 'sweetalert2';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * "All companies" mode stays read-only for ordinary users. HQ company-1 admins
 * are allowed to maintain records across companies; payloadInterceptor preserves
 * the target record's companyId so their writes never persist against company 0.
 *
 * PUT/DELETE/PATCH are always writes and are blocked outright. POST is used both
 * for writes and for a handful of report/preview reads (e.g. preview-allocation,
 * finance report bodies, trial-balance), so a POST is blocked only when its URL
 * looks like a mutation - see WRITE_POST_HINTS. Auth endpoints are never touched.
 */
const SKIP_PATHS = ['/user/login', '/user/register', '/auth/', '/user/forgotPassword', '/user/resetPassword'];

// URL fragments that mark a POST as a write. Matched case-insensitively against
// the path. Reads (preview/report/search/list/...) fall through and are allowed.
const WRITE_POST_HINTS = [
  'create', 'insert', 'update', 'save', 'submit', 'confirm', 'approve',
  'register', 'delete', 'remove', 'deactivate', 'cancel', 'void', 'reverse',
  'post', 'run-', 'reval', 'depreciation', 'adjust', 'markas', 'mark-', 'close',
  'generate', 'raise', 'from-mr', 'createfrom', 'transfer', 'receive', 'issue'
];

function isAllCompaniesMode(): boolean {
  return (localStorage.getItem('companyId') || '') === '0';
}

function isBlockedWrite(method: string, url: string): boolean {
  const m = method.toUpperCase();
  if (m === 'PUT' || m === 'DELETE' || m === 'PATCH') return true;
  if (m === 'POST') {
    const path = (url.split('?')[0] || '').toLowerCase();
    return WRITE_POST_HINTS.some(h => path.includes(h));
  }
  return false;
}

export const allCompaniesReadonlyInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isSkipped = SKIP_PATHS.some(p => req.url.includes(p));

  if (!isSkipped && isAllCompaniesMode() && !auth.isSuperAdmin() && isBlockedWrite(req.method, req.url)) {
    Swal.fire({
      icon: 'info',
      title: 'Read-only in All Companies',
      text: 'Select a specific company before creating or editing records.',
      confirmButtonColor: '#116e73'
    });

    return throwError(() => new HttpErrorResponse({
      error: { isSuccess: false, message: 'Editing is disabled in All Companies mode. Select a company first.' },
      status: 403,
      statusText: 'Forbidden (All Companies read-only)',
      url: req.url
    }));
  }

  return next(req);
};
