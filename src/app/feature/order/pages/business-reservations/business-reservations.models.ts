import { OrderModel, OrderStatusMeta } from '../../models/order.model';

export interface BusinessOrderCardViewModel {
  order: OrderModel;
  statusMeta: OrderStatusMeta;
}

export type BusinessOrdersTab = 'all' | 'active' | 'completed' | 'cancelled';

export interface BusinessOrdersSummary {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
}
