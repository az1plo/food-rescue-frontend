import { resolveOfferImage } from '../../../../shared/models/offer.model';
import { ORDER_STATUS_META } from '../../models/order.model';
import { BusinessOrderCardViewModel, BusinessOrdersSummary, BusinessOrdersTab } from './business-reservations.models';

export function getBusinessOrdersTabLabel(tab: BusinessOrdersTab): string {
  switch (tab) {
    case 'all':
      return 'All orders';
    case 'active':
      return 'Awaiting pickup';
    case 'completed':
      return 'Picked up';
    default:
      return 'Cancelled';
  }
}

export function getBusinessOrdersTabCount(summary: BusinessOrdersSummary, tab: BusinessOrdersTab): number {
  switch (tab) {
    case 'all':
      return summary.total;
    case 'active':
      return summary.active;
    case 'completed':
      return summary.completed;
    default:
      return summary.cancelled;
  }
}

export function getBusinessOrdersEmptyStateTitle(tab: BusinessOrdersTab): string {
  switch (tab) {
    case 'all':
      return 'No orders yet';
    case 'active':
      return 'No pickups waiting right now';
    case 'completed':
      return 'No picked up orders yet';
    default:
      return 'No cancelled orders';
  }
}

export function getBusinessOrdersEmptyStateCopy(tab: BusinessOrdersTab): string {
  switch (tab) {
    case 'all':
      return 'This business does not have any customer orders yet. As soon as an offer is paid, it will appear here.';
    case 'active':
      return 'All current paid orders are already processed, or their pickup windows have already ended.';
    case 'completed':
      return 'Completed pickups will appear here after collection is confirmed.';
    default:
      return 'Cancelled and no-show orders will appear here when an order does not reach pickup.';
  }
}

export function formatBusinessOrderPaymentSummary(card: BusinessOrderCardViewModel): string {
  const payment = card.order.payment;
  if (!payment) {
    return 'Payment record unavailable.';
  }

  return `${payment.amount.toFixed(2)} ${payment.currency} captured with card ending ${payment.cardLast4}.`;
}

export function formatBusinessOrderPayoutSummary(
  card: BusinessOrderCardViewModel,
  isExpiredUnconfirmedOrder: boolean,
): string {
  const payment = card.order.payment;
  if (!payment) {
    return 'Payout record unavailable.';
  }

  if (isExpiredUnconfirmedOrder) {
    if (!payment.transferredToBusinessAt) {
      return 'Pickup window ended without confirmation. This payout will be assigned to the business under the no-show policy.';
    }

    return `Pickup window ended without confirmation. Payout was assigned to the business on ${formatBusinessOrderDateTime(payment.transferredToBusinessAt)}.`;
  }

  if (!payment.transferredToBusinessAt) {
    return 'Payout will move into business revenue as soon as pickup is confirmed.';
  }

  return `Payout transferred ${formatBusinessOrderDateTime(payment.transferredToBusinessAt)}.`;
}

export function resolveBusinessOrderImage(card: BusinessOrderCardViewModel): string {
  return resolveOfferImage(card.order.item.imageUrl, card.order.item.offerId);
}

export function formatBusinessOrderItemsSummary(card: BusinessOrderCardViewModel): string {
  return `${card.order.item.quantity}x ${card.order.item.title}`;
}

export function formatBusinessOrderPrice(value: number): string {
  return `${value.toFixed(2)} EUR`;
}

export function formatBusinessOrderSecondaryAddressLine(card: BusinessOrderCardViewModel): string {
  return [
    card.order.pickupLocation.address.city,
    card.order.pickupLocation.address.postalCode,
    card.order.pickupLocation.address.country,
  ]
    .filter(Boolean)
    .join(', ');
}

export function buildBusinessOrderEyebrow(card: BusinessOrderCardViewModel): string {
  return `Order #${card.order.id}`;
}

export function buildBusinessOrderStatusLabel(
  card: BusinessOrderCardViewModel,
  isExpiredUnconfirmedOrder: boolean,
): string {
  if (isExpiredUnconfirmedOrder) {
    return 'Pickup ended';
  }

  if (card.order.status === 'ACTIVE') {
    return 'Awaiting pickup';
  }

  return ORDER_STATUS_META[card.order.status].label;
}

export function resolveBusinessOrderTone(
  card: BusinessOrderCardViewModel,
  isExpiredUnconfirmedOrder: boolean,
): BusinessOrderCardViewModel['statusMeta']['tone'] {
  if (isExpiredUnconfirmedOrder || card.order.status === 'NO_SHOW') {
    return 'warning';
  }

  return card.statusMeta.tone;
}

export function buildBusinessExpiredPickupTitle(card: BusinessOrderCardViewModel): string {
  if (card.order.status === 'NO_SHOW') {
    return 'No-show recorded';
  }

  return 'Pickup window ended';
}

export function buildBusinessExpiredPickupSummary(card: BusinessOrderCardViewModel): string {
  const pickupWindowEnd = formatBusinessOrderDateTime(card.order.pickupTimeWindow.to);
  if (card.order.status === 'NO_SHOW') {
    return `This order was not collected during the pickup window. Pickup ended on ${pickupWindowEnd}.`;
  }

  return `This order was not confirmed before the pickup window ended on ${pickupWindowEnd}.`;
}

export function buildBusinessExpiredPickupResolution(card: BusinessOrderCardViewModel): string {
  const transferredAt = card.order.payment?.transferredToBusinessAt;
  if (transferredAt) {
    return `Payout was assigned to the business on ${formatBusinessOrderDateTime(transferredAt)} under the no-show policy.`;
  }

  return 'This missed pickup will be settled as a no-show, and the payout will be released to the business.';
}

function formatBusinessOrderDateTime(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsedDate);
}
