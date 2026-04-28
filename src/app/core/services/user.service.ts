import { computed, inject, Injectable, Signal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { OAuthService } from 'angular-oauth2-oidc';
import { UserModel } from '../models/user-model';
import { UserRoleEnum } from '../models/user-role-enum';
import { authClientConfig } from '../auth-code-flow.config';

export type SocialIdentityProvider = 'google';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private static readonly postIdentityLoginReturnUrlStorageKey = 'food-rescue.post-identity-login-return-url';

  private readonly oauthService = inject(OAuthService);
  private readonly router = inject(Router);
  private readonly user = signal<UserModel | null>(null);
  private readonly ready = signal(false);

  private loginAttempt: Promise<UserModel | null> | null = null;

  readonly isAuthenticated = computed(() => this.user() !== null);

  constructor() {
    this.oauthService.configure(authClientConfig);
    this.oauthService.setupAutomaticSilentRefresh();
    this.oauthService.events.subscribe((event) => {
      if (event.type === 'token_received' || event.type === 'token_refreshed') {
        this.syncUserFromTokens();
      }
    });
    void this.tryLogin();
  }

  getUser(): Signal<UserModel | null> {
    return this.user.asReadonly();
  }

  getReady(): Signal<boolean> {
    return this.ready.asReadonly();
  }

  async login(returnUrl: string = this.router.url): Promise<void> {
    const targetUrl = this.normalizeReturnUrl(returnUrl);
    await this.router.navigate(['/login'], {
      queryParams: {
        returnUrl: targetUrl,
      },
    });
  }

  async loginWithCredentials(email: string, password: string, returnUrl: string = '/'): Promise<UserModel | null> {
    await this.oauthService.fetchTokenUsingPasswordFlow(email.trim(), password);
    const user = this.syncUserFromTokens();

    if (user) {
      await this.router.navigateByUrl(this.normalizeReturnUrl(returnUrl));
    }

    return user;
  }

  loginWithIdentityProvider(provider: SocialIdentityProvider, returnUrl: string = '/'): void {
    const targetUrl = this.normalizeReturnUrl(returnUrl);
    sessionStorage.setItem(UserService.postIdentityLoginReturnUrlStorageKey, targetUrl);
    this.oauthService.initCodeFlow('', {
      kc_idp_hint: provider,
      prompt: 'select_account',
    });
  }

  async completeIdentityProviderLogin(): Promise<UserModel | null> {
    await this.oauthService.tryLoginCodeFlow();
    const user = this.syncUserFromTokens();

    if (user) {
      await this.router.navigateByUrl(this.consumeIdentityProviderReturnUrl());
    }

    return user;
  }

  logout(): void {
    sessionStorage.removeItem(UserService.postIdentityLoginReturnUrlStorageKey);
    this.user.set(null);
    this.ready.set(true);
    this.oauthService.logOut({
      client_id: authClientConfig.clientId,
    });
  }

  async tryLogin(): Promise<UserModel | null> {
    if (!this.loginAttempt) {
      this.loginAttempt = this.tryLoginInternal().finally(() => {
        this.loginAttempt = null;
      });
    }

    return this.loginAttempt;
  }

  private async tryLoginInternal(): Promise<UserModel | null> {
    if (this.oauthService.hasValidAccessToken()) {
      return this.syncUserFromTokens();
    }

    if (this.oauthService.getRefreshToken()) {
      try {
        await this.oauthService.refreshToken();
        return this.syncUserFromTokens();
      } catch {
        this.oauthService.logOut();
      }
    }

    this.user.set(null);
    this.ready.set(true);
    return null;
  }

  private syncUserFromTokens(): UserModel | null {
    if (!this.oauthService.hasValidAccessToken()) {
      this.user.set(null);
      this.ready.set(true);
      return null;
    }

    const claims = this.readStoredClaims();
    const user = claims ? this.mapUserClaims(claims) : null;

    this.user.set(user);
    this.ready.set(true);

    return user;
  }

  private mapUserClaims(claims: Record<string, unknown>): UserModel {
    const firstName = this.readStringClaim(claims, 'given_name');
    const lastName = this.readStringClaim(claims, 'family_name');
    const composedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const fallbackName =
      composedName ||
      this.readStringClaim(claims, 'name') ||
      this.readStringClaim(claims, 'preferred_username') ||
      this.readStringClaim(claims, 'email') ||
      'Account';

    return {
      subject: this.readStringClaim(claims, 'sub') ?? undefined,
      email: this.readStringClaim(claims, 'email') ?? undefined,
      name: fallbackName,
      role: this.resolveRole(claims),
    };
  }

  private resolveRole(claims: Record<string, unknown>): UserRoleEnum | undefined {
    const realmAccess = claims['realm_access'];
    if (this.isRecord(realmAccess)) {
      const roles = realmAccess['roles'];
      if (Array.isArray(roles)) {
        const normalizedRoles = roles.filter((role): role is string => typeof role === 'string').map((role) => role.toUpperCase());

        if (normalizedRoles.includes(UserRoleEnum.ADMIN)) {
          return UserRoleEnum.ADMIN;
        }

        if (normalizedRoles.includes(UserRoleEnum.USER)) {
          return UserRoleEnum.USER;
        }
      }
    }

    const subject = this.readStringClaim(claims, 'sub');
    const email = this.readStringClaim(claims, 'email');
    return subject || email ? UserRoleEnum.USER : undefined;
  }

  private readStringClaim(claims: Record<string, unknown>, key: string): string | null {
    const value = claims[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private readStoredClaims(): Record<string, unknown> | null {
    const identityClaims = this.oauthService.getIdentityClaims() as Record<string, unknown> | null;
    if (identityClaims) {
      return identityClaims;
    }

    return this.decodeJwtPayload(this.oauthService.getAccessToken());
  }

  private normalizeReturnUrl(returnUrl: string): string {
    if (!returnUrl.startsWith('/') || returnUrl.startsWith('/login') || returnUrl.startsWith('/register')) {
      return '/';
    }

    return returnUrl;
  }

  private consumeIdentityProviderReturnUrl(): string {
    const storedValue = sessionStorage.getItem(UserService.postIdentityLoginReturnUrlStorageKey);
    sessionStorage.removeItem(UserService.postIdentityLoginReturnUrlStorageKey);
    return storedValue ? this.normalizeReturnUrl(storedValue) : '/';
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    if (!token) {
      return null;
    }

    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const normalizedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const json = atob(normalizedBase64);
      const payload = JSON.parse(json);
      return this.isRecord(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
  }
}
