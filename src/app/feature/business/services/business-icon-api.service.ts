import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { BusinessIconUploadPayload, BusinessModel } from '../models/business.model';

@Injectable({
  providedIn: 'root',
})
export class BusinessIconApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.beUrl}/business-icons`;

  uploadBusinessIcon(payload: BusinessIconUploadPayload) {
    return this.http.post<BusinessModel>(this.baseUrl, payload);
  }
}
