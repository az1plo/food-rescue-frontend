import { Injectable } from '@angular/core';
import {
  LOCATION_REQUEST_TIMEOUT_MS,
  ViewerLocation,
} from '../browse-offers.models';

const VIEWER_LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: LOCATION_REQUEST_TIMEOUT_MS,
  maximumAge: 5 * 60 * 1000,
};

@Injectable({
  providedIn: 'root',
})
export class BrowseOffersGeolocationService {
  supportsGeolocation(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  requestViewerLocation(): Promise<ViewerLocation> {
    if (!this.supportsGeolocation()) {
      return Promise.reject(new Error('Geolocation is not supported.'));
    }

    return new Promise<ViewerLocation>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        () => reject(new Error('Geolocation is unavailable.')),
        VIEWER_LOCATION_OPTIONS,
      );
    });
  }
}
