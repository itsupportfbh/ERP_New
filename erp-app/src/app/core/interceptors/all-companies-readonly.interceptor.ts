import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { throwError } from 'rxjs';
import Swal from 'sweetalert2';

/**
 * "All companies" mode is a cross-company reporting view and is read-only for
 * every user, including administrators. To maintain data, the user must select
 * the owning company first so the API receives an unambiguous company context.
 *
 * All non-read HTTP verbs are blocked by default. A small explicit allow-list is
 * used for POST endpoints that only calculate/preview data; this is safer than
 * guessing from mutation endpoint names and covers legacy endpoints named simply
 * `insert`, `lock`, `sync`, etc. Auth endpoints are never touched.
 */
const SKIP_PATHS = ['/user/login', '/auth/', '/user/forgotpassword', '/user/resetpassword', '/user/changepassword'];

// These POSTs do not persist business data; they only return a preview, scan, or
// derived lookup result needed by view/report flows.
const READ_ONLY_POST_PATHS = [
  '/salesorder/preview-allocation',
  '/picking/codes',
  '/quotation/item-flags/bulk',
  '/ocr/extract-groq-si',
  '/ocr/extract-groq-multi'
];

function isAllCompaniesMode(): boolean {
  return (localStorage.getItem('companyId') || '') === '0';
}

function isBlockedWrite(method: string, url: string): boolean {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  const path = (url.split('?')[0] || '').toLowerCase();
  if (m === 'POST' && READ_ONLY_POST_PATHS.some(p => path.endsWith(p))) return false;
  return true;
}

export const allCompaniesReadonlyInterceptor: HttpInterceptorFn = (req, next) => {
  const normalizedUrl = req.url.toLowerCase();
  const isSkipped = SKIP_PATHS.some(p => normalizedUrl.includes(p));

  if (!isSkipped && isAllCompaniesMode() && isBlockedWrite(req.method, req.url)) {
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
