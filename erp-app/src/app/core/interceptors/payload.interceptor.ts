import { HttpInterceptorFn } from '@angular/common/http';

const SKIP_PATHS = ['/user/login', '/user/register', '/auth/'];

export const payloadInterceptor: HttpInterceptorFn = (req, next) => {
  const isWriteMethod = req.method === 'POST' || req.method === 'PUT';
  const isSkipped = SKIP_PATHS.some(p => req.url.includes(p));

  if (isWriteMethod && !isSkipped && req.body && typeof req.body === 'object') {
    const userId = Number(localStorage.getItem('id') || 0);
    const companyId = Number(localStorage.getItem('companyId') || 0);
    const now = new Date().toISOString();
    const body = req.body as Record<string, any>;

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
