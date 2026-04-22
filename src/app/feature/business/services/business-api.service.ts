import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BusinessModel, BusinessPayload, BusinessWorkspaceListItem } from '../models/business.model';

@Injectable({
  providedIn: 'root',
})
export class BusinessApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.beUrl}/businesses`;

  getBusinesses() {
    return this.http.get<BusinessModel[]>(this.baseUrl).pipe(map((businesses) => businesses.map((business) => this.toWorkspaceListItem(business))));
  }

  getBusiness(id: number) {
    return this.http.get<BusinessModel>(`${this.baseUrl}/${id}`);
  }

  createBusiness(payload: BusinessPayload) {
    return this.http.post<void>(this.baseUrl, payload, { observe: 'response' });
  }

  updateBusiness(id: number, payload: BusinessPayload) {
    return this.http.put<BusinessModel>(`${this.baseUrl}/${id}`, payload);
  }

  deleteBusiness(id: number) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  private toWorkspaceListItem(business: BusinessModel): BusinessWorkspaceListItem {
    return {
      id: business.id,
      name: business.name,
      status: business.status,
      address: business.address,
      createdAt: business.createdAt,
      lastViewedAt: Number.isFinite(Date.parse(business.createdAt)) ? Date.parse(business.createdAt) : 0,
    };
  }
}
