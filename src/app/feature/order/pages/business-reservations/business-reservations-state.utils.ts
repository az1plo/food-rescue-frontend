import { OrderModel, ORDER_STATUS_META } from '../../models/order.model';
import {
  BusinessOrderCardViewModel,
  BusinessOrdersSummary,
  BusinessOrdersTab,
} from './business-reservations.models';

export function buildBusinessOrderCards(orders: readonly OrderModel[]): BusinessOrderCardViewModel[] {
  return [...orders]
    .sort((first, second) => toTimestamp(second.createdAt) - toTimestamp(first.createdAt))
    .map((order) => ({
      order,
      statusMeta: ORDER_STATUS_META[order.status],
    }));
}

export function buildBusinessOrdersSummary(
  cards: readonly BusinessOrderCardViewModel[],
  currentTimestamp: number,
): BusinessOrdersSummary {
  return {
    total: cards.length,
    active: cards.filter((card) => isUpcomingActiveOrder(card.order, currentTimestamp)).length,
    completed: cards.filter((card) => card.order.status === 'PICKED_UP').length,
    cancelled: cards.filter((card) => isPastPickupOrder(card.order, currentTimestamp)).length,
  };
}

export function filterBusinessOrderCards(
  cards: readonly BusinessOrderCardViewModel[],
  tab: BusinessOrdersTab,
  currentTimestamp: number,
): BusinessOrderCardViewModel[] {
  return cards.filter((card) => {
    if (tab === 'all') {
      return true;
    }

    if (tab === 'active') {
      return isUpcomingActiveOrder(card.order, currentTimestamp);
    }

    if (tab === 'completed') {
      return card.order.status === 'PICKED_UP';
    }

    return isPastPickupOrder(card.order, currentTimestamp);
  });
}

export function canVerifyBusinessPickup(
  card: BusinessOrderCardViewModel,
  currentTimestamp: number,
): boolean {
  return card.order.status === 'ACTIVE'
    && !isPickupWindowExpired(card.order, currentTimestamp)
    && !!card.order.payment;
}

export function isExpiredUnconfirmedBusinessOrder(order: OrderModel, currentTimestamp: number): boolean {
  return isPickupWindowExpired(order, currentTimestamp);
}

function isCancelledOrder(status: OrderModel['status']): boolean {
  return status === 'CANCELLED' || status === 'NO_SHOW';
}

function isUpcomingActiveOrder(order: OrderModel, currentTimestamp: number): boolean {
  return order.status === 'ACTIVE' && !isPickupWindowExpired(order, currentTimestamp);
}

function isPastPickupOrder(order: OrderModel, currentTimestamp: number): boolean {
  return isCancelledOrder(order.status) || isPickupWindowExpired(order, currentTimestamp);
}

function isPickupWindowExpired(order: OrderModel, currentTimestamp: number): boolean {
  if (order.status !== 'ACTIVE') {
    return false;
  }

  const pickupWindowEnd = new Date(order.pickupTimeWindow.to);
  if (Number.isNaN(pickupWindowEnd.getTime())) {
    return false;
  }

  return pickupWindowEnd.getTime() <= currentTimestamp;
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
