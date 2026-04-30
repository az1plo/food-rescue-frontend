import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { SupportChatRequestPayload, SupportChatResponseModel } from '../models/support-chat.model';

@Injectable({
  providedIn: 'root',
})
export class SupportChatApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.beUrl}/support/chat/messages`;

  sendMessage(payload: SupportChatRequestPayload) {
    return this.http.post<SupportChatResponseModel>(this.baseUrl, payload);
  }
}
