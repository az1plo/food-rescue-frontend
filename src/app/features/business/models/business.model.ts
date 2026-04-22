export type BusinessStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'REJECTED';

export interface AddressModel {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface BusinessModel {
  id: number;
  ownerId: number;
  name: string;
  description: string | null;
  status: BusinessStatus;
  address: AddressModel;
  createdAt: string;
}

export interface BusinessWorkspaceListItem {
  id: number;
  name: string;
  status: BusinessStatus;
  lastViewedAt: number;
}

export interface BusinessPayload {
  name: string;
  description: string | null;
  address: AddressModel;
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
