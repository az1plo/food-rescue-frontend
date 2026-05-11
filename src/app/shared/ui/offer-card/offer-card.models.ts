import { OfferStatus } from '../../../feature/offer/models/offer.model';

export type OfferCardVariant = 'home' | 'list' | 'detail' | 'map';

export interface OfferCardModel {
  title: string;
  businessName: string;
  image: string;
  price: string;
  businessArea?: string | null;
  brandImageUrl?: string | null;
  brandMark?: string | null;
  originalPrice?: string | null;
  rating?: string | null;
  pickup?: string | null;
  distance?: string | null;
  availabilityLabel?: string | null;
  inCart?: boolean;
  selected?: boolean;
  status?: OfferStatus | null;
  description?: string | null;
}

export interface MarketplaceOfferCardOverrides {
  price: string;
  originalPrice?: string | null;
  rating?: string | null;
  pickup?: string | null;
  distance?: string | null;
  image?: string;
  availabilityLabel?: string | null;
  inCart?: boolean;
  selected?: boolean;
  description?: string | null;
  brandImageUrl?: string | null;
  brandMark?: string | null;
  businessArea?: string | null;
}
