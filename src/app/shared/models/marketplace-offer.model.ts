import { AddressModel, PickupLocationModel, PickupTimeWindowModel } from './location.model';
import { AllergenCode, OfferCategory, OfferStatus } from './offer.model';

export type MarketplaceOfferSort = 'DISTANCE' | 'PICKUP_SOONEST' | 'PRICE_ASC' | 'NEWEST';
export type MarketplaceViewMode = 'LIST' | 'MAP';

export interface MarketplaceBusinessSummaryModel {
  id: number;
  name: string;
  description: string | null;
  iconUrl: string | null;
  address: AddressModel;
  ratingAverage: number | null;
  ratingCount: number;
  availableOfferCount: number;
  unavailableOfferCount: number;
}

export interface MarketplaceOfferModel {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: OfferCategory;
  illustrativeImage: boolean;
  containsAllergens: AllergenCode[];
  mayContainAllergens: AllergenCode[];
  otherAllergenNote: string | null;
  price: number;
  originalPrice: number | null;
  quantityAvailable: number;
  status: OfferStatus;
  badgeText: string | null;
  distanceMeters: number | null;
  canReserve: boolean;
  pickupLocation: PickupLocationModel;
  pickupTimeWindow: PickupTimeWindowModel;
  business: MarketplaceBusinessSummaryModel;
}

export interface MarketplaceOfferQuery {
  q?: string;
  viewerLat?: number | null;
  viewerLng?: number | null;
  radiusKm?: number | null;
  sort?: MarketplaceOfferSort;
  includeUnavailable?: boolean;
}
