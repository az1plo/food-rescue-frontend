import { AddressModel } from '../../../../shared/models/location.model';
import { AllergenCode, AllergenOption } from '../../models/offer.model';

export function filterBusinessOfferAllergenOptions(
  allergenOptions: readonly AllergenOption[],
  query: string,
): AllergenOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [...allergenOptions];
  }

  return allergenOptions.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
}

export function sortBusinessOfferAllergens(
  allergenOptions: readonly AllergenOption[],
  values: AllergenCode[],
): AllergenCode[] {
  const orderMap = new Map<AllergenCode, number>(
    allergenOptions.map((option, index) => [option.value, index] satisfies [AllergenCode, number]),
  );

  return [...new Set(values)].sort((left, right) => (orderMap.get(left) ?? 999) - (orderMap.get(right) ?? 999));
}

export function matchesBusinessOfferAddress(address: AddressModel, businessAddress: AddressModel | null): boolean {
  if (!businessAddress) {
    return false;
  }

  return address.street === businessAddress.street
    && address.city === businessAddress.city
    && address.postalCode === businessAddress.postalCode
    && address.country === businessAddress.country;
}
