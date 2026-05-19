export type OfferFinalImageSource = 'manual-url' | 'original-photo' | 'own-upload' | 'ai-cover';

export interface EditorImageAsset {
  fileName: string;
  contentType: string;
  imageBase64: string;
  previewUrl: string;
}
