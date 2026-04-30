import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { MarketplaceOfferModel, MarketplaceOfferQuery } from '../models/marketplace-offer.model';

@Injectable({
  providedIn: 'root',
})
export class MarketplaceOfferApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.beUrl}/marketplace/offers`;

  getMarketplaceOffers(query: MarketplaceOfferQuery) {
    let params = new HttpParams();

    if (query.q?.trim()) {
      params = params.set('q', query.q.trim());
    }

    if (typeof query.viewerLat === 'number') {
      params = params.set('viewerLat', query.viewerLat);
    }

    if (typeof query.viewerLng === 'number') {
      params = params.set('viewerLng', query.viewerLng);
    }

    if (typeof query.radiusKm === 'number') {
      params = params.set('radiusKm', query.radiusKm);
    }

    if (query.sort) {
      params = params.set('sort', query.sort);
    }

    if (typeof query.includeUnavailable === 'boolean') {
      params = params.set('includeUnavailable', query.includeUnavailable);
    }

    return this.http.get<MarketplaceOfferModel[]>(this.baseUrl, { params });
  }
}
