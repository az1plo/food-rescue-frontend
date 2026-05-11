import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { CreateOrderPayload, CreateOrderReviewPayload, OrderModel, OrderPickupPassModel } from '../models/order.model';

@Injectable({
  providedIn: 'root',
})
export class OrderApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.beUrl}/orders`;

  getOrders(businessId?: number) {
    const params = businessId ? { businessId } : undefined;
    return this.http.get<OrderModel[]>(this.baseUrl, { params });
  }

  createOrder(payload: CreateOrderPayload) {
    return this.http.post<OrderModel>(this.baseUrl, payload);
  }

  getOrder(id: number) {
    return this.http.get<OrderModel>(`${this.baseUrl}/${id}`);
  }

  getPickupPass(id: number) {
    return this.http.get<OrderPickupPassModel>(`${this.baseUrl}/${id}/pickup-pass`);
  }

  confirmPickup(id: number, pickupToken: string) {
    return this.http.post<OrderModel>(`${this.baseUrl}/${id}/pickup`, { pickupToken });
  }

  submitReview(id: number, payload: CreateOrderReviewPayload) {
    return this.http.post<OrderModel>(`${this.baseUrl}/${id}/review`, payload);
  }
}
