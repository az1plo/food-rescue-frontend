import { effect, inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { UserModel } from '../../../core/models/user-model';
import { UserService } from '../../../core/services/user.service';
import { BusinessModel, BusinessWorkspaceListItem } from '../models/business.model';
import { BusinessApiService } from './business-api.service';

@Injectable({
  providedIn: 'root',
})
export class BusinessWorkspaceStateService {
  private readonly userService = inject(UserService);
  private readonly businessApi = inject(BusinessApiService);
  private readonly currentUser = this.userService.getUser();
  private readonly activeBusinessId = signal<number | null>(null);
  private readonly knownBusinessesState = signal<BusinessWorkspaceListItem[]>([]);

  readonly businessId = this.activeBusinessId.asReadonly();
  readonly knownBusinesses = this.knownBusinessesState.asReadonly();

  constructor() {
    effect(
      () => {
        const user = this.currentUser();
        if (!user) {
          this.activeBusinessId.set(null);
          this.knownBusinessesState.set([]);
          return;
        }

        this.activeBusinessId.set(this.readStoredBusinessId(user));
      },
      { allowSignalWrites: true },
    );
  }

  refreshBusinesses() {
    return this.businessApi.getBusinesses().pipe(
      tap((businesses) => {
        this.knownBusinessesState.set(this.normalizeKnownBusinesses(businesses));
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
  }

  clearRememberedBusinessId(): void {
    const user = this.currentUser();

    if (user) {
      localStorage.removeItem(this.storageKey(user));
    }

    this.activeBusinessId.set(null);
  }

  rememberBusinessSummary(business: Pick<BusinessModel, 'id' | 'name' | 'status'>): void {
    const existingIndex = this.knownBusinessesState().findIndex((item) => item.id === business.id);

    if (existingIndex === -1) {
      this.knownBusinessesState.set(
        this.normalizeKnownBusinesses([
          ...this.knownBusinessesState(),
          {
            id: business.id,
            name: business.name,
            status: business.status,
            lastViewedAt: Date.now(),
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

    return items.filter((item) => {
      if (seenIds.has(item.id)) {
        return false;
      }

      seenIds.add(item.id);
      return true;
    }).slice(0, 12);
  }

  private storageKey(user: UserModel): string {
    const identity = user.email ?? user.subject ?? user.name;
    return `food-rescue:workspace:${identity}`;
  }
}
