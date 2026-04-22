import { computed, inject, Injectable, Signal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { OAuthService } from 'angular-oauth2-oidc';
import { UserModel } from '../models/user-model';
import { UserRoleEnum } from '../models/user-role-enum';
import { authCodeFlowConfig } from '../auth-code-flow.config';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly oauthService = inject(OAuthService);
  private readonly router = inject(Router);
  private readonly user = signal<UserModel | null>(null);
  private readonly ready = signal(false);

  private loginAttempt: Promise<UserModel | null> | null = null;
  private handledState: string | null = null;

  readonly isAuthenticated = computed(() => this.user() !== null);

  constructor() {
    this.oauthService.configure(authCodeFlowConfig);
    this.oauthService.setupAutomaticSilentRefresh();
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
    await this.oauthService.loadDiscoveryDocumentAndLogin({ state: targetUrl });
    this.syncUserFromClaims();
  }

  logout(): void {
    this.oauthService.logOut();
    this.user.set(null);
    this.ready.set(true);
    void this.router.navigateByUrl('/');
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
    await this.oauthService.loadDiscoveryDocumentAndTryLogin();
    return this.syncUserFromClaims();
  }

  private syncUserFromClaims(): UserModel | null {
    if (!this.oauthService.hasValidIdToken()) {
      this.user.set(null);
      this.ready.set(true);
      return null;
    }

    const claims = this.oauthService.getIdentityClaims() as Record<string, unknown> | null;
    const user = claims ? this.mapUserClaims(claims) : null;

    this.user.set(user);
    this.ready.set(true);
    this.restoreRequestedRoute();

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

    return undefined;
  }

  private readStringClaim(claims: Record<string, unknown>, key: string): string | null {
    const value = claims[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private restoreRequestedRoute(): void {
    const state = this.oauthService.state;

    if (!state || state === this.handledState || !state.startsWith('/')) {
      return;
    }

    this.handledState = state;

    queueMicrotask(() => {
      if (this.router.url !== state) {
        void this.router.navigateByUrl(state);
      }
    });
  }

  private normalizeReturnUrl(returnUrl: string): string {
    return returnUrl.startsWith('/') ? returnUrl : '/';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
  }
}
