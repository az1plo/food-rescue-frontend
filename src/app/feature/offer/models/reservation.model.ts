export type ReservationStatus = 'ACTIVE' | 'CANCELLED' | 'PICKED_UP' | 'NO_SHOW';

export interface PickupConfirmationModel {
  confirmedByUserId: number;
  confirmedAt: string;
}

export interface ReservationModel {
  id: number;
  offerId: number;
  userId: number;
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
  pickupConfirmation: PickupConfirmationModel | null;
}

export interface ReservationStatusMeta {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'default';
  cancelable: boolean;
}

export const RESERVATION_STATUS_META: Record<ReservationStatus, ReservationStatusMeta> = {
  ACTIVE: {
    label: 'Active',
    tone: 'success',
    cancelable: true,
  },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'danger',
    cancelable: false,
  },
  PICKED_UP: {
    label: 'Picked up',
    tone: 'default',
    cancelable: false,
  },
  NO_SHOW: {
    label: 'No show',
    tone: 'warning',
    cancelable: false,
  },
};
