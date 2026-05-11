import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { OfferImageUploadPayload, OfferImageUploadResponseModel } from '../models/offer-assistant.model';

@Injectable({
  providedIn: 'root',
})
export class OfferImageApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.beUrl}/offer-images`;

  uploadOfferImage(payload: OfferImageUploadPayload) {
    return this.http.post<OfferImageUploadResponseModel>(this.baseUrl, payload);
  }
}
