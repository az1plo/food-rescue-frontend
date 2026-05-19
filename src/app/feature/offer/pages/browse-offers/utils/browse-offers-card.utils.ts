import { OfferCardModel } from '../../../../../shared/ui/offer-card/offer-card.models';
import {
  buildOfferBusinessMark,
  createMarketplaceOfferCardModel,
  formatOfferAvailabilityLabel,
  formatOfferDistance,
  formatOfferPickupWindow,
  formatOfferRatingValue,
} from '../../../../../shared/ui/offer-card/offer-card.utils';
import { MarketplaceOfferModel } from '../../../models/marketplace-offer.model';
import { MapReferencePoint, MarketplaceBusinessCluster } from '../browse-offers.models';
import { formatOriginalPrice, formatPrice, resolveDistanceMeters } from './browse-offers.utils';

interface BuildBrowseOfferCardOptions {
  selectedCity: string | null;
  selectedOfferId: number | null;
  ownBusinessOffer: boolean;
  inCart: boolean;
  distanceMeters: number | null;
}

export function hasOfferDiscount(offer: MarketplaceOfferModel): boolean {
  return typeof offer.originalPrice === 'number' && offer.originalPrice > offer.price;
}

export function resolveOfferBusinessAreaLabel(
  offer: MarketplaceOfferModel,
  selectedCity: string | null,
): string | null {
  const pickupStreet = offer.pickupLocation.address.street?.trim() || null;
  const businessStreet = offer.business.address.street?.trim() || null;

  if (selectedCity) {
    return (
      pickupStreet ||
      businessStreet ||
      offer.pickupLocation.address.city?.trim() ||
      offer.business.address.city?.trim() ||
      null
    );
  }

  return (
    offer.pickupLocation.address.city?.trim() ||
    offer.business.address.city?.trim() ||
    pickupStreet ||
    businessStreet ||
    null
  );
}

export function resolveOfferDistanceMeters(
  offer: MarketplaceOfferModel,
  referencePoint: MapReferencePoint | null,
): number | null {
  if (offer.distanceMeters !== null) {
    return offer.distanceMeters;
  }

  if (referencePoint === null) {
    return null;
  }

  return resolveDistanceMeters(
    referencePoint.latitude,
    referencePoint.longitude,
    offer.pickupLocation.address.latitude ?? offer.business.address.latitude ?? null,
    offer.pickupLocation.address.longitude ?? offer.business.address.longitude ?? null,
  );
}

export function resolveClusterDistanceMeters(
  cluster: MarketplaceBusinessCluster,
  referencePoint: MapReferencePoint | null,
): number | null {
  if (cluster.distanceMeters !== null) {
    return cluster.distanceMeters;
  }

  if (referencePoint === null) {
    return null;
  }

  return resolveDistanceMeters(
    referencePoint.latitude,
    referencePoint.longitude,
    cluster.latitude,
    cluster.longitude,
  );
}

export function resolveClusterPreviewOffer(
  cluster: MarketplaceBusinessCluster,
  selectedOffer: MarketplaceOfferModel | null,
): MarketplaceOfferModel | null {
  if (selectedOffer && selectedOffer.business.id === cluster.business.id) {
    return selectedOffer;
  }

  return cluster.offers[0] ?? null;
}

export function buildBrowseOfferCard(
  offer: MarketplaceOfferModel,
  options: BuildBrowseOfferCardOptions,
): OfferCardModel {
  const businessArea = resolveOfferBusinessAreaLabel(offer, options.selectedCity);

  return createMarketplaceOfferCardModel(offer, {
    price: formatPrice(offer.price),
    originalPrice: hasOfferDiscount(offer) ? formatOriginalPrice(offer.originalPrice) : null,
    rating: formatOfferRatingValue(offer.business.ratingAverage, offer.business.ratingCount),
    pickup: formatOfferPickupWindow(offer.pickupTimeWindow),
    distance: options.distanceMeters === null ? null : formatOfferDistance(options.distanceMeters),
    availabilityLabel: options.ownBusinessOffer
      ? 'Your offer'
      : formatOfferAvailabilityLabel(offer.quantityAvailable, offer.status),
    inCart: options.inCart,
    selected: options.selectedOfferId === offer.id,
    brandMark: buildOfferBusinessMark(offer.business.name),
    businessArea,
  });
}
