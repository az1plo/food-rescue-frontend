import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { OAuthService } from 'angular-oauth2-oidc';
import { environment } from '../../environments/environment';

const normalizedApiBaseUrl = environment.beUrl.replace(/\/+$/, '').toLowerCase();

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const requestUrl = req.url.toLowerCase();
  const isApiRequest = requestUrl === normalizedApiBaseUrl || requestUrl.startsWith(`${normalizedApiBaseUrl}/`);

  if (!isApiRequest || req.headers.has('Authorization')) {
    return next(req);
  }

  const accessToken = inject(OAuthService).getAccessToken();
  if (!accessToken) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  );
};
