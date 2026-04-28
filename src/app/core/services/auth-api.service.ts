import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { RegisterUserPayload } from '../models/auth.model';

@Injectable({
  providedIn: 'root',
})
export class AuthApiService {
  private readonly http = inject(HttpClient);

  register(payload: RegisterUserPayload) {
    return this.http.post<void>(`${environment.beUrl}/users/register`, payload, { observe: 'response' });
  }
}
