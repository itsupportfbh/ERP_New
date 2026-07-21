import { HttpInterceptorFn } from '@angular/common/http';

const SKIP_PATHS = ['/user/login', '/user/register', '/auth/'];

// localStorage can hold the literal strings "null"/"undefined" (e.g. a super admin with
// no company selected). Number("null") is NaN, and JSON.stringify turns NaN into null —
// which the backend rejects with "The JSON value could not be converted to System.Int32".
// Always coerce to a finite integer, defaulting to 0.
function readInt(key: string): number {
  const parsed = Number(localStorage.getItem(key));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export const payloadInterceptor: HttpInterceptorFn = (req, next) => {
  const isWriteMethod = req.method === 'POST' || req.method === 'PUT';
  const isSkipped = SKIP_PATHS.some(p => req.url.includes(p));

 if (isWriteMethod && !isSkipped && req.body && typeof req.body === 'object' && !Array.isArray(req.body) && !(req.body instanceof FormData)) {
    const userId = readInt('id');
    const contextCompanyId = readInt('companyId');
    const now = new Date().toISOString();
    const body = req.body as Record<string, any>;
    // The company selected in the header dropdown is authoritative. Never let a
    // stale form value or a record copied from another company override it.
    // All Companies writes are rejected by allCompaniesReadonlyInterceptor; the
    // fallback only supports account/auth requests that are explicitly exempt.
    const companyId = contextCompanyId || readInt('loginCompanyId');

    const enriched: Record<string, any> = {
      ...body,
      // Use existing isActive only if it's explicitly true/false; null/undefined → default true
      isActive: body['isActive'] != null ? body['isActive'] : true,
      createdBy: userId,
      updatedBy: userId,
      createdDate: now,
      updatedDate: now,
      companyId
    };

    // Some legacy DTOs use PascalCase. Keep it synchronized when present so the
    // serialized payload can never contain two conflicting company identities.
    if (Object.prototype.hasOwnProperty.call(body, 'CompanyId')) {
      enriched['CompanyId'] = companyId;
    }

    // For PUT with /{id} at end of URL, inject id into body to satisfy backend route-body id match
    if (req.method === 'PUT') {
      const urlPath = req.url.split('?')[0];
      const idMatch = urlPath.match(/\/(\d+)$/);
      if (idMatch) {
        enriched['id'] = Number(idMatch[1]);
      }
    }

    req = req.clone({ body: enriched });
  }

  return next(req);
};
