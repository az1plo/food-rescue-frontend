import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faFacebookF, faInstagram, faTiktok } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { RouterLink } from '@angular/router';
import { UserService } from '../../services/user.service';
import { appIcons } from '../../../shared/icons/app-icons';

interface ViewerLocation {
  latitude: number;
  longitude: number;
}

interface ReverseGeocodeAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  hamlet?: string;
  suburb?: string;
  city_district?: string;
  state_district?: string;
  county?: string;
  country?: string;
  country_code?: string;
}

interface ReverseGeocodeResponse {
  address?: ReverseGeocodeAddress;
}

const LOCATION_STORAGE_KEY = 'savr:browse-viewer-location';
const LEGACY_LOCATION_STORAGE_KEY = 'food-rescue:browse-viewer-location';
const LOCATION_LOOKUP_URL = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1';
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 300000,
};
const LOCATION_UNAVAILABLE_LABEL = 'Location unavailable';
const LOCATION_LOOKING_UP_LABEL = 'Locating...';

@Component({
  selector: 'app-footer',
  imports: [RouterLink, FontAwesomeModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  private readonly userService = inject(UserService);

  protected readonly year = new Date().getFullYear();
  protected readonly user = this.userService.getUser();
  protected readonly currentLocationLabel = signal(this.readStoredLocationLabel());
  protected readonly icons = {
    instagram: faInstagram,
    facebook: faFacebookF,
    tiktok: faTiktok,
    email: faEnvelope,
    location: appIcons.locationDot,
    globe: appIcons.globe,
  } as const;

  constructor() {
    void this.initializeCurrentLocation();
  }

  protected openWorkspace(): void {
    void this.userService.login('/workspace');
  }

  protected createBusinessProfile(): void {
    void this.userService.login('/workspace/my-businesses/new');
  }

  private async initializeCurrentLocation(): Promise<void> {
    const storedLocation = this.readStoredViewerLocation();
    if (storedLocation) {
      void this.resolveStoredLocationLabel(storedLocation);
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      if (!storedLocation) {
        this.currentLocationLabel.set(LOCATION_UNAVAILABLE_LABEL);
      }
      return;
    }

    const shouldRequestLiveLocation = await this.shouldRequestLiveLocation(storedLocation !== null);
    if (!shouldRequestLiveLocation) {
      if (!storedLocation) {
        this.currentLocationLabel.set(LOCATION_UNAVAILABLE_LABEL);
      }
      return;
    }

    const currentLocation = await this.requestCurrentLocation();
    if (!currentLocation) {
      if (!storedLocation) {
        this.currentLocationLabel.set(LOCATION_UNAVAILABLE_LABEL);
      }
      return;
    }

    this.storeViewerLocation(currentLocation);
    this.currentLocationLabel.set(this.formatCoordinates(currentLocation));

    const resolvedLabel = await this.lookupLocationLabel(currentLocation);
    if (resolvedLabel) {
      this.currentLocationLabel.set(resolvedLabel);
    }
  }

  private async shouldRequestLiveLocation(hasStoredLocation: boolean): Promise<boolean> {
    if (!('permissions' in navigator) || typeof navigator.permissions.query !== 'function') {
      return true;
    }

    try {
      const permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return permissionStatus.state === 'granted' || (!hasStoredLocation && permissionStatus.state === 'prompt');
    } catch {
      return true;
    }
  }

  private async requestCurrentLocation(): Promise<ViewerLocation | null> {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        () => resolve(null),
        GEOLOCATION_OPTIONS,
      );
    });
  }

  private async lookupLocationLabel(location: ViewerLocation): Promise<string | null> {
    try {
      const response = await fetch(`${LOCATION_LOOKUP_URL}&lat=${location.latitude}&lon=${location.longitude}`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as ReverseGeocodeResponse;
      return this.composeLocationLabel(payload.address);
    } catch {
      return null;
    }
  }

  private composeLocationLabel(address?: ReverseGeocodeAddress): string | null {
    if (!address) {
      return null;
    }

    const city = address.city
      ?? address.town
      ?? address.village
      ?? address.municipality
      ?? address.hamlet
      ?? address.suburb
      ?? address.city_district
      ?? address.state_district
      ?? address.county;
    const countryCode = address.country_code?.toUpperCase() ?? null;
    const country = address.country ?? null;
    const secondaryLabel = countryCode ?? country;

    if (!city && !secondaryLabel) {
      return null;
    }

    return [city, secondaryLabel].filter((part): part is string => Boolean(part)).join(', ');
  }

  private async resolveStoredLocationLabel(location: ViewerLocation): Promise<void> {
    const resolvedLabel = await this.lookupLocationLabel(location);
    if (resolvedLabel) {
      this.currentLocationLabel.set(resolvedLabel);
    }
  }

  private readStoredLocationLabel(): string {
    const storedLocation = this.readStoredViewerLocation();
    return storedLocation ? this.formatCoordinates(storedLocation) : LOCATION_LOOKING_UP_LABEL;
  }

  private readStoredViewerLocation(): ViewerLocation | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const rawValue = localStorage.getItem(LOCATION_STORAGE_KEY) ?? localStorage.getItem(LEGACY_LOCATION_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    try {
      const parsedValue = JSON.parse(rawValue) as Partial<ViewerLocation>;
      if (typeof parsedValue.latitude !== 'number' || typeof parsedValue.longitude !== 'number') {
        return null;
      }

      return {
        latitude: parsedValue.latitude,
        longitude: parsedValue.longitude,
      };
    } catch {
      return null;
    }
  }

  private storeViewerLocation(location: ViewerLocation): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
    localStorage.removeItem(LEGACY_LOCATION_STORAGE_KEY);
  }

  private formatCoordinates(location: ViewerLocation): string {
    return `${this.formatCoordinate(location.latitude, 'N', 'S')}, ${this.formatCoordinate(location.longitude, 'E', 'W')}`;
  }

  private formatCoordinate(value: number, positiveHemisphere: string, negativeHemisphere: string): string {
    const hemisphere = value >= 0 ? positiveHemisphere : negativeHemisphere;
    return `${Math.abs(value).toFixed(3)} deg ${hemisphere}`;
  }
}
