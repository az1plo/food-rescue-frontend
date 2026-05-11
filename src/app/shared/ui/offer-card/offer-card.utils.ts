import { buildBusinessMark, resolveBusinessIconUrl } from '../../../feature/business/models/business.model';
import { MarketplaceOfferModel } from '../../../feature/offer/models/marketplace-offer.model';
import { OfferStatus, PickupTimeWindowModel, resolveOfferImage } from '../../../feature/offer/models/offer.model';
import { MarketplaceOfferCardOverrides, OfferCardModel } from './offer-card.models';

export function buildOfferBusinessMark(businessName: string): string {
  return buildBusinessMark(businessName);
}

export function formatOfferStatusLabel(status: OfferStatus): string {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatOfferAvailabilityLabel(quantityAvailable: number, status: OfferStatus): string {
  if (status !== 'AVAILABLE') {
    return formatOfferStatusLabel(status);
  }

  return `${quantityAvailable} left`;
}

export function formatOfferPickupWindow(pickupTimeWindow: PickupTimeWindowModel, now = new Date()): string {
  const from = new Date(pickupTimeWindow.from);
  const to = new Date(pickupTimeWindow.to);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return 'Pickup window unavailable';
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  });

  const timeRange = `${timeFormatter.format(from)} - ${timeFormatter.format(to)}`;
  if (isSameCalendarDay(from, now)) {
    return `Today ${timeRange}`;
  }

  if (isSameCalendarDay(from, tomorrow)) {
    return `Tomorrow ${timeRange}`;
  }

  return `${dateFormatter.format(from)} ${timeRange}`;
}

export function formatOfferDistance(distanceMeters: number | null): string {
  if (distanceMeters === null) {
    return 'Distance unavailable';
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m away`;
  }

  return `${(distanceMeters / 1000).toFixed(distanceMeters < 10_000 ? 1 : 0)} km away`;
}

export function formatOfferRatingValue(
  ratingAverage: number | null,
  ratingCount: number,
  fallback: string | null = null,
): string | null {
  if (ratingAverage === null || ratingCount <= 0) {
    return fallback;
  }

  return ratingAverage.toFixed(1);
}

export function marketplaceOfferBusinessArea(offer: MarketplaceOfferModel): string | null {
  return offer.pickupLocation.address.city?.trim()
    || offer.business.address.city?.trim()
    || offer.business.address.country?.trim()
    || null;
}

export function marketplaceOfferLocationLabel(offer: MarketplaceOfferModel): string {
  return marketplaceOfferBusinessArea(offer) ?? 'Location unavailable';
}

export function createMarketplaceOfferCardModel(
  offer: MarketplaceOfferModel,
  overrides: MarketplaceOfferCardOverrides,
): OfferCardModel {
  return {
    title: offer.title,
    businessName: offer.business.name,
    businessArea: overrides.businessArea ?? marketplaceOfferBusinessArea(offer),
    brandImageUrl: overrides.brandImageUrl ?? resolveBusinessIconUrl(offer.business.iconUrl),
    brandMark: overrides.brandMark ?? buildOfferBusinessMark(offer.business.name),
    price: overrides.price,
    originalPrice: overrides.originalPrice ?? null,
    rating: overrides.rating ?? null,
    pickup: overrides.pickup ?? null,
    distance: overrides.distance ?? null,
    image: overrides.image ?? resolveOfferImage(offer.imageUrl, offer.id),
    availabilityLabel: overrides.availabilityLabel ?? formatOfferAvailabilityLabel(offer.quantityAvailable, offer.status),
    inCart: overrides.inCart ?? false,
    selected: overrides.selected ?? false,
    status: offer.status,
    description: overrides.description ?? offer.description?.trim() ?? null,
  };
}

function isSameCalendarDay(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}
