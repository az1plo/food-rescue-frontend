import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { BusinessAnalyticsModel } from '../models/business-analytics.model';

@Injectable({
  providedIn: 'root',
})
export class BusinessAnalyticsApiService {
  private readonly http = inject(HttpClient);

  getBusinessAnalytics(businessId: number) {
    return this.http.get<BusinessAnalyticsModel>(`${environment.beUrl}/businesses/${businessId}/analytics`);
  }
}
