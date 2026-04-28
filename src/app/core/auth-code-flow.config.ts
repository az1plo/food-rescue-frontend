import { AuthConfig } from 'angular-oauth2-oidc';
import { environment } from '../../environments/environment';

const keycloakRealmUrl = `${environment.keyCloakUrl}/realms/${environment.keyCloakRealm}`;

export const authClientConfig: AuthConfig = {
  issuer: keycloakRealmUrl,
  loginUrl: `${keycloakRealmUrl}/protocol/openid-connect/auth`,
  logoutUrl: `${keycloakRealmUrl}/protocol/openid-connect/logout`,
  tokenEndpoint: environment.beUrl + '/auth/token',
  redirectUri: environment.appUrl + '/auth/callback',
  postLogoutRedirectUri: environment.appUrl + '/',
  clientId: 'fsa-client',
  responseType: 'code',
  scope: 'openid profile email offline_access',
  oidc: false,
  showDebugInformation: false,
  strictDiscoveryDocumentValidation: false,
  requireHttps: false,
};
