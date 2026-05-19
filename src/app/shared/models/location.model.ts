export interface AddressModel {
  street: string;
  city: string;
  postalCode: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface PickupLocationModel {
  address: AddressModel;
  note: string | null;
}

export interface PickupTimeWindowModel {
  from: string;
  to: string;
}
