import { PickupLocationModel, PickupTimeWindowModel } from './location.model';

export type OfferStatus = 'DRAFT' | 'AVAILABLE' | 'RESERVED' | 'PICKED_UP' | 'SOLD_OUT' | 'EXPIRED' | 'CANCELLED';
export type OfferCategory = 'BAKERY' | 'READY_MEAL' | 'PRODUCE' | 'GROCERY' | 'DESSERT' | 'BEVERAGE' | 'MIXED' | 'OTHER';
export type AllergenCode =
  | 'GLUTEN'
  | 'CRUSTACEANS'
  | 'EGGS'
  | 'FISH'
  | 'PEANUTS'
  | 'SOYBEANS'
  | 'MILK'
  | 'TREE_NUTS'
  | 'CELERY'
  | 'MUSTARD'
  | 'SESAME'
  | 'SULPHUR_DIOXIDE_AND_SULPHITES'
  | 'LUPIN'
  | 'MOLLUSCS'
  | 'OTHER'
  | 'UNKNOWN';

export interface OfferItemModel {
  name: string;
  quantity: number;
}

export interface OfferModel {
  id: number;
  businessId: number;
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
  items: OfferItemModel[];
  pickupLocation: PickupLocationModel;
  pickupTimeWindow: PickupTimeWindowModel;
  createdAt: string;
}

export interface OfferPayload {
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
  items: OfferItemModel[];
  pickupLocation: PickupLocationModel;
  pickupTimeWindow: PickupTimeWindowModel;
}

export interface CreateOfferPayload extends OfferPayload {
  businessId: number;
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

export interface OfferCategoryOption {
  value: OfferCategory;
  label: string;
}

export interface AllergenOption {
  value: AllergenCode;
  label: string;
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

export const OFFER_CATEGORY_OPTIONS: OfferCategoryOption[] = [
  { value: 'BAKERY', label: 'Bakery' },
  { value: 'READY_MEAL', label: 'Ready meal' },
  { value: 'PRODUCE', label: 'Produce' },
  { value: 'GROCERY', label: 'Grocery' },
  { value: 'DESSERT', label: 'Dessert' },
  { value: 'BEVERAGE', label: 'Beverage' },
  { value: 'MIXED', label: 'Mixed' },
  { value: 'OTHER', label: 'Other' },
];

export const ALLERGEN_OPTIONS: AllergenOption[] = [
  { value: 'GLUTEN', label: 'Gluten' },
  { value: 'CRUSTACEANS', label: 'Crustaceans' },
  { value: 'EGGS', label: 'Eggs' },
  { value: 'FISH', label: 'Fish' },
  { value: 'PEANUTS', label: 'Peanuts' },
  { value: 'SOYBEANS', label: 'Soybeans' },
  { value: 'MILK', label: 'Milk' },
  { value: 'TREE_NUTS', label: 'Tree nuts' },
  { value: 'CELERY', label: 'Celery' },
  { value: 'MUSTARD', label: 'Mustard' },
  { value: 'SESAME', label: 'Sesame' },
  { value: 'SULPHUR_DIOXIDE_AND_SULPHITES', label: 'Sulphur dioxide and sulphites' },
  { value: 'LUPIN', label: 'Lupin' },
  { value: 'MOLLUSCS', label: 'Molluscs' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

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

export function formatAllergenLabel(code: AllergenCode): string {
  return ALLERGEN_OPTIONS.find((option) => option.value === code)?.label ?? code;
}
