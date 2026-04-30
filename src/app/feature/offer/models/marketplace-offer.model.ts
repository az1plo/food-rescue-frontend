import { AddressModel } from '../../business/models/business.model';
import { OfferStatus, PickupLocationModel, PickupTimeWindowModel } from './offer.model';

export type MarketplaceOfferSort = 'DISTANCE' | 'PICKUP_SOONEST' | 'PRICE_ASC' | 'NEWEST';
export type MarketplaceViewMode = 'LIST' | 'MAP';

export interface MarketplaceBusinessSummaryModel {
  id: number;
  name: string;
  description: string | null;
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
