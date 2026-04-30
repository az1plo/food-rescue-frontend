import { computed, Injectable, signal } from '@angular/core';

export interface OfferCartItem {
  offerId: number;
  addedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class OfferCartService {
  private static readonly storageKey = 'savr:offer-cart';
  private static readonly legacyStorageKey = 'food-rescue:offer-cart';
  private static readonly maxItems = 24;

  private readonly state = signal<OfferCartItem[]>(this.readStoredItems());

  readonly items = this.state.asReadonly();
  readonly count = computed(() => this.state().length);

  hasOffer(offerId: number): boolean {
    return this.state().some((item) => item.offerId === offerId);
  }

  addOffer(offerId: number): void {
    if (!Number.isInteger(offerId) || offerId <= 0) {
      return;
    }

    this.updateItems((items) => [
      {
        offerId,
        addedAt: new Date().toISOString(),
      },
      ...items.filter((item) => item.offerId !== offerId),
    ].slice(0, OfferCartService.maxItems));
  }

  removeOffer(offerId: number): void {
    this.updateItems((items) => items.filter((item) => item.offerId !== offerId));
  }

  toggleOffer(offerId: number): boolean {
    if (this.hasOffer(offerId)) {
      this.removeOffer(offerId);
      return false;
    }

    this.addOffer(offerId);
    return true;
  }

  clear(): void {
    this.state.set([]);
    this.persistItems([]);
  }

  private updateItems(project: (items: OfferCartItem[]) => OfferCartItem[]): void {
    const nextItems = project(this.state());
    this.state.set(nextItems);
    this.persistItems(nextItems);
  }

  private readStoredItems(): OfferCartItem[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    const rawValue = localStorage.getItem(OfferCartService.storageKey)
      ?? localStorage.getItem(OfferCartService.legacyStorageKey);
    if (!rawValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(rawValue) as unknown;
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      const items = parsedValue
        .filter((item): item is OfferCartItem =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { offerId?: unknown }).offerId === 'number' &&
          Number.isInteger((item as { offerId: number }).offerId) &&
          (item as { offerId: number }).offerId > 0 &&
          typeof (item as { addedAt?: unknown }).addedAt === 'string',
        )
        .slice(0, OfferCartService.maxItems);

      localStorage.setItem(OfferCartService.storageKey, JSON.stringify(items));
      return items;
    } catch {
      return [];
    }
  }

  private persistItems(items: OfferCartItem[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(OfferCartService.storageKey, JSON.stringify(items));
  }
}
