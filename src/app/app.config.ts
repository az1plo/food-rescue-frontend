import {
  ApplicationConfig,
  DEFAULT_CURRENCY_CODE,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeSk from '@angular/common/locales/sk';
import { registerLocaleData } from '@angular/common';
import { MemoryStorage, OAuthStorage, provideOAuthClient } from 'angular-oauth2-oidc';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { authInterceptor } from './core/auth-interceptor';

registerLocaleData(localeSk, 'sk');

function oAuthStorageFactory(): OAuthStorage {
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }

  return new MemoryStorage();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
      }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: 'sk' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'EUR' },
    provideOAuthClient(),
    { provide: OAuthStorage, useFactory: oAuthStorageFactory },
    provideTranslateService({
      defaultLanguage: 'sk',
      lang: 'sk',
      fallbackLang: 'en',
      loader: provideTranslateHttpLoader({
        prefix: '/i18n/',
        suffix: '.json',
      }),
    }),
  ],
};
