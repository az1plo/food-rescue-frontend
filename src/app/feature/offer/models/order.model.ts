import { PickupLocationModel, PickupTimeWindowModel } from './offer.model';

export type OrderStatus = 'ACTIVE' | 'CANCELLED' | 'PICKED_UP' | 'NO_SHOW';

export interface PickupConfirmationModel {
  confirmedByUserId: number;
  confirmedAt: string;
}

export interface OrderItemModel {
  offerId: number;
  quantity: number;
  title: string;
  imageUrl: string | null;
  unitPrice: number;
}

export interface OrderPaymentModel {
  paidByUserId: number;
  amount: number;
  currency: string;
  cardHolderName: string;
  cardLast4: string;
  providerReference: string;
  pickupToken: string;
  paidAt: string;
  transferredToBusinessAt: string | null;
  transferReference: string | null;
}

export interface OrderPickupPassModel {
  orderId: number;
  businessId: number;
  pickupToken: string;
  qrPayload: string;
  amount: number;
  currency: string;
  issuedAt: string;
  paidAt: string;
  providerReference: string;
}

export interface OrderReviewModel {
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface CreateOrderPayload {
  offerId: number;
  quantity: number;
  cardHolderName: string;
  cardLast4: string;
}

export interface CreateOrderReviewPayload {
  rating: number;
  comment?: string | null;
}

export interface OrderModel {
  id: number;
  businessId: number;
  userId: number;
  businessName: string;
  item: OrderItemModel;
  pickupLocation: PickupLocationModel;
  pickupTimeWindow: PickupTimeWindowModel;
  status: OrderStatus;
  createdAt: string;
  cancelledAt: string | null;
  pickupConfirmation: PickupConfirmationModel | null;
  payment: OrderPaymentModel | null;
  review: OrderReviewModel | null;
}

export interface OrderStatusMeta {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'default';
}

export const ORDER_STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
  ACTIVE: {
    label: 'Awaiting pickup',
    tone: 'success',
  },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'danger',
  },
  PICKED_UP: {
    label: 'Picked up',
    tone: 'default',
  },
  NO_SHOW: {
    label: 'No show',
    tone: 'warning',
  },
};
