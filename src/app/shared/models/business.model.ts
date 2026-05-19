import { AddressModel } from './location.model';

export type BusinessStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'REJECTED';

export interface BusinessModel {
  id: number;
  ownerId: number;
  name: string;
  description: string | null;
  iconUrl: string | null;
  status: BusinessStatus;
  address: AddressModel;
  ratingAverage: number | null;
  ratingCount: number;
  createdAt: string;
}

export interface BusinessWorkspaceListItem {
  id: number;
  name: string;
  status: BusinessStatus;
  iconUrl: string | null;
  address: AddressModel;
  createdAt: string;
  lastViewedAt: number;
}

export interface BusinessPayload {
  name: string;
  description: string | null;
  address: AddressModel;
}

export interface BusinessIconUploadPayload {
  businessId: number;
  fileName: string;
  contentType: string;
  imageBase64: string;
}

export interface BusinessStatusMeta {
  label: string;
  description: string;
  tone: 'pending' | 'success' | 'warning' | 'danger';
  offerCreationAllowed: boolean;
}

export const BUSINESS_STATUS_META: Record<BusinessStatus, BusinessStatusMeta> = {
  PENDING: {
    label: 'Pending approval',
    description: 'This business is waiting for approval. Offer publishing stays locked until it becomes active.',
    tone: 'pending',
    offerCreationAllowed: false,
  },
  ACTIVE: {
    label: 'Active',
    description: 'This business is approved and ready for normal day-to-day management.',
    tone: 'success',
    offerCreationAllowed: true,
  },
  BLOCKED: {
    label: 'Blocked',
    description: 'This workspace is restricted right now. New offers should stay paused until the restriction is lifted.',
    tone: 'danger',
    offerCreationAllowed: false,
  },
  REJECTED: {
    label: 'Rejected',
    description: 'Changes are required before this business can be approved and start publishing offers.',
    tone: 'warning',
    offerCreationAllowed: false,
  },
};

export function buildBusinessMark(name: string | null | undefined): string {
  const significantWords = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !['the', 'and', '&'].includes(word.toLowerCase()));

  if (!significantWords.length) {
    return '?';
  }

  return significantWords
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function resolveBusinessIconUrl(iconUrl: string | null | undefined): string | null {
  const normalizedIconUrl = iconUrl?.trim();
  return normalizedIconUrl || null;
}
