export type BackendNotificationType =
  | 'BUSINESS_STATUS_CHANGED'
  | 'OFFER_PUBLISHED'
  | 'OFFER_RESERVED'
  | 'OFFER_CANCELLED'
  | 'RESERVATION_STATUS_CHANGED'
  | 'SYSTEM';

export type BackendNotificationTone = 'success' | 'error' | 'info';

export interface BackendNotificationModel {
  id: number;
  userId: number;
  type: BackendNotificationType;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  tone: BackendNotificationTone;
}

export const BACKEND_NOTIFICATION_TONE: Record<BackendNotificationType, BackendNotificationTone> = {
  BUSINESS_STATUS_CHANGED: 'info',
  OFFER_PUBLISHED: 'info',
  OFFER_RESERVED: 'success',
  OFFER_CANCELLED: 'error',
  RESERVATION_STATUS_CHANGED: 'info',
  SYSTEM: 'info',
};

export function toBackendNotificationTone(type: BackendNotificationType): BackendNotificationTone {
  return BACKEND_NOTIFICATION_TONE[type] ?? 'info';
}
