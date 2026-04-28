import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { CreateOfferPayload, OfferModel, OfferPayload } from '../models/offer.model';

@Injectable({
  providedIn: 'root',
})
export class OfferApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.beUrl}/offers`;

  getOffers(businessId?: number) {
    const params = businessId ? new HttpParams().set('businessId', businessId) : undefined;
    return this.http.get<OfferModel[]>(this.baseUrl, { params });
  }

  getOffer(id: number) {
    return this.http.get<OfferModel>(`${this.baseUrl}/${id}`);
  }

  createOffer(payload: CreateOfferPayload) {
    return this.http.post<void>(this.baseUrl, payload, { observe: 'response' });
  }

  updateOffer(id: number, payload: OfferPayload) {
    return this.http.put<OfferModel>(`${this.baseUrl}/${id}`, payload);
  }

  deleteOffer(id: number) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
