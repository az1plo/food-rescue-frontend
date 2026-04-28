import { AddressModel } from '../../business/models/business.model';

export type OfferStatus = 'DRAFT' | 'AVAILABLE' | 'RESERVED' | 'PICKED_UP' | 'SOLD_OUT' | 'EXPIRED' | 'CANCELLED';

export interface OfferItemModel {
  name: string;
  quantity: number;
}

export interface PickupLocationModel {
  address: AddressModel;
  note: string | null;
}

export interface PickupTimeWindowModel {
  from: string;
  to: string;
}

export interface OfferModel {
  id: number;
  businessId: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  quantityAvailable: number;
  status: OfferStatus;
  items: OfferItemModel[];
  pickupLocation: PickupLocationModel;
  pickupTimeWindow: PickupTimeWindowModel;
  createdAt: string;
}

export interface OfferPayload {
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  quantityAvailable: number;
  items: OfferItemModel[];
  pickupLocation: PickupLocationModel;
  pickupTimeWindow: PickupTimeWindowModel;
}

export interface CreateOfferPayload extends OfferPayload {
  businessId: number;
}

export interface CreateReservationPayload {
  offerId: number;
}

export interface OfferStatusMeta {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'default';
  editable: boolean;
  deletable: boolean;
}

export interface OfferImageOption {
  label: string;
  url: string;
}

export const OFFER_STATUS_META: Record<OfferStatus, OfferStatusMeta> = {
  DRAFT: {
    label: 'Draft',
    tone: 'default',
    editable: true,
    deletable: true,
  },
  AVAILABLE: {
    label: 'Available',
    tone: 'success',
    editable: true,
    deletable: true,
  },
  RESERVED: {
    label: 'Reserved',
    tone: 'warning',
    editable: false,
    deletable: false,
  },
  PICKED_UP: {
    label: 'Picked up',
    tone: 'default',
    editable: false,
    deletable: false,
  },
  SOLD_OUT: {
    label: 'Sold out',
    tone: 'default',
    editable: false,
    deletable: false,
  },
  EXPIRED: {
    label: 'Expired',
    tone: 'danger',
    editable: false,
    deletable: false,
  },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'danger',
    editable: false,
    deletable: false,
  },
};

export const LOCAL_OFFER_IMAGE_OPTIONS: OfferImageOption[] = [
  { label: 'Bakery', url: '/images/offer-bakery.png' },
  { label: 'Sushi', url: '/images/offer-sushi.png' },
  { label: 'Salad', url: '/images/offer-salad.png' },
  { label: 'Bagels', url: '/images/offer-bagels.png' },
];

export function resolveOfferImage(imageUrl: string | null | undefined, seed = 0): string {
  const normalizedImageUrl = imageUrl?.trim();
  if (normalizedImageUrl) {
    return normalizedImageUrl;
  }

  return LOCAL_OFFER_IMAGE_OPTIONS[Math.abs(seed) % LOCAL_OFFER_IMAGE_OPTIONS.length]?.url ?? LOCAL_OFFER_IMAGE_OPTIONS[0].url;
}
