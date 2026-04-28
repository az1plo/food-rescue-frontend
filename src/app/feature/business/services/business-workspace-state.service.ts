import { DestroyRef, computed, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, tap } from 'rxjs';
import { UserRoleEnum } from '../../../core/models/user-role-enum';
import { UserModel } from '../../../core/models/user-model';
import { UserService } from '../../../core/services/user.service';
import { BusinessModel, BusinessWorkspaceListItem } from '../models/business.model';
import { BusinessApiService } from './business-api.service';

@Injectable({
  providedIn: 'root',
})
export class BusinessWorkspaceStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly userService = inject(UserService);
  private readonly businessApi = inject(BusinessApiService);
  private readonly currentUser = this.userService.getUser();
  private readonly activeBusinessId = signal<number | null>(null);
  private readonly knownBusinessesState = signal<BusinessWorkspaceListItem[]>([]);
  private readonly loadingState = signal(false);
  private readonly loadedState = signal(false);

  readonly businessId = this.activeBusinessId.asReadonly();
  readonly knownBusinesses = this.knownBusinessesState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly hasBusinesses = computed(() => this.knownBusinessesState().length > 0);
  readonly selectedBusiness = computed(
    () => this.knownBusinessesState().find((business) => business.id === this.activeBusinessId()) ?? null,
  );

  constructor() {
    effect(
      () => {
        const user = this.currentUser();
        if (!user) {
          this.activeBusinessId.set(null);
          this.knownBusinessesState.set([]);
          this.loadingState.set(false);
          this.loadedState.set(false);
          return;
        }

        this.activeBusinessId.set(this.readStoredBusinessId(user));
        if (user.role === UserRoleEnum.ADMIN) {
          this.knownBusinessesState.set([]);
          this.loadingState.set(false);
          this.loadedState.set(true);
          return;
        }

        if (!this.loadedState() && !this.loadingState()) {
          this.refreshBusinesses()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              error: () => {
                this.knownBusinessesState.set([]);
              },
            });
        }
      },
      { allowSignalWrites: true },
    );
  }

  refreshBusinesses() {
    this.loadingState.set(true);

    return this.businessApi.getBusinesses().pipe(
      finalize(() => {
        this.loadingState.set(false);
        this.loadedState.set(true);
      }),
      tap((businesses) => {
        const normalizedBusinesses = this.normalizeKnownBusinesses(businesses);
        this.knownBusinessesState.set(normalizedBusinesses);

        const activeBusinessId = this.activeBusinessId();
        if (activeBusinessId && normalizedBusinesses.some((business) => business.id === activeBusinessId)) {
          return;
        }

        const nextBusinessId = normalizedBusinesses[0]?.id ?? null;
        if (nextBusinessId) {
          this.rememberBusinessId(nextBusinessId);
          return;
        }

        this.clearRememberedBusinessId();
      }),
    );
  }

  rememberBusinessId(id: number): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }

    localStorage.setItem(this.storageKey(user), id.toString());
    this.activeBusinessId.set(id);
    this.knownBusinessesState.update((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              lastViewedAt: Date.now(),
            }
          : item,
      ),
    );
  }

  clearRememberedBusinessId(): void {
    const user = this.currentUser();

    if (user) {
      localStorage.removeItem(this.storageKey(user));
    }

    this.activeBusinessId.set(null);
  }

  rememberBusinessSummary(business: Pick<BusinessModel, 'id' | 'name' | 'status' | 'address' | 'createdAt'>): void {
    const existingIndex = this.knownBusinessesState().findIndex((item) => item.id === business.id);

    if (existingIndex === -1) {
      this.knownBusinessesState.set(
        this.normalizeKnownBusinesses([
          ...this.knownBusinessesState(),
          {
            id: business.id,
            name: business.name,
            status: business.status,
            address: business.address,
            createdAt: business.createdAt,
            lastViewedAt: Number.isFinite(Date.parse(business.createdAt)) ? Date.parse(business.createdAt) : Date.now(),
          },
        ]),
      );
      return;
    }

    this.knownBusinessesState.update((items) =>
      items.map((item) =>
        item.id === business.id
          ? {
              ...item,
              name: business.name,
              status: business.status,
              address: business.address,
              createdAt: business.createdAt,
              lastViewedAt: item.id === business.id ? Date.now() : item.lastViewedAt,
            }
          : item,
      ),
    );
  }

  private readStoredBusinessId(user: UserModel): number | null {
    const rawValue = localStorage.getItem(this.storageKey(user));
    if (!rawValue) {
      return null;
    }

    const parsedValue = Number(rawValue);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
  }

  private normalizeKnownBusinesses(items: BusinessWorkspaceListItem[]): BusinessWorkspaceListItem[] {
    const seenIds = new Set<number>();
    const existingById = new Map(this.knownBusinessesState().map((item) => [item.id, item]));

    return items.filter((item) => {
      if (seenIds.has(item.id)) {
        return false;
      }

      seenIds.add(item.id);
      return true;
    }).map((item) => ({
      ...item,
      lastViewedAt: existingById.get(item.id)?.lastViewedAt ?? item.lastViewedAt,
    })).slice(0, 12);
  }

  private storageKey(user: UserModel): string {
    const identity = user.email ?? user.subject ?? user.name;
    return `food-rescue:workspace:${identity}`;
  }
}
