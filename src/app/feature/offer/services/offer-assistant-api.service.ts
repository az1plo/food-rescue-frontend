import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import {
  GeneratedOfferImageModel,
  OfferDraftFromImagePayload,
  OfferDraftSuggestionModel,
  OfferIllustrativeCoverPayload,
} from '../models/offer-assistant.model';

@Injectable({
  providedIn: 'root',
})
export class OfferAssistantApiService {
  private readonly http = inject(HttpClient);
  private readonly draftUrl = `${environment.beUrl}/offer-assistant/draft-from-image`;
  private readonly coverUrl = `${environment.beUrl}/offer-assistant/generate-cover`;

  createOfferDraftFromImage(payload: OfferDraftFromImagePayload) {
    return this.http.post<OfferDraftSuggestionModel>(this.draftUrl, payload);
  }

  generateOfferCover(payload: OfferIllustrativeCoverPayload) {
    return this.http.post<GeneratedOfferImageModel>(this.coverUrl, payload);
  }
}
