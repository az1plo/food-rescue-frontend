import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { CreateReservationPayload } from '../models/offer.model';
import { ReservationModel } from '../models/reservation.model';

@Injectable({
  providedIn: 'root',
})
export class ReservationApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.beUrl}/reservations`;

  getReservations(offerId?: number) {
    const params = offerId ? new HttpParams().set('offerId', offerId) : undefined;
    return this.http.get<ReservationModel[]>(this.baseUrl, { params });
  }

  createReservation(payload: CreateReservationPayload) {
    return this.http.post<void>(this.baseUrl, payload, { observe: 'response' });
  }

  getReservation(id: number) {
    return this.http.get<ReservationModel>(`${this.baseUrl}/${id}`);
  }

  cancelReservation(id: number) {
    return this.http.post<ReservationModel>(`${this.baseUrl}/${id}/cancel`, null);
  }

  confirmPickup(id: number) {
    return this.http.post<ReservationModel>(`${this.baseUrl}/${id}/pickup`, null);
  }
}
