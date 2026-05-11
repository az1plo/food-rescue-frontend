import { AllergenCode, OfferCategory } from './offer.model';

export interface OfferDraftFromImagePayload {
  businessId: number;
  fileName: string;
  contentType: string;
  imageBase64: string;
}

export interface OfferDraftSuggestionModel {
  detectedItems: string[];
  suggestedTitle: string;
  suggestedDescription: string | null;
  suggestedCategory: OfferCategory;
}

export interface OfferIllustrativeCoverPayload {
  businessId: number;
  title: string;
  description: string | null;
  category: OfferCategory;
  detectedItems: string[];
}

export interface GeneratedOfferImageModel {
  fileName: string;
  contentType: string;
  imageBase64: string;
  illustrativeOnly: boolean;
}

export interface OfferImageUploadPayload {
  businessId: number;
  fileName: string;
  contentType: string;
  imageBase64: string;
  illustrativeImage: boolean;
}

export interface OfferImageUploadResponseModel {
  imageId: string;
  imageUrl: string;
  contentType: string;
  illustrativeImage: boolean;
}

export interface OfferAllergenSelection {
  containsAllergens: AllergenCode[];
  mayContainAllergens: AllergenCode[];
  otherAllergenNote: string | null;
}
