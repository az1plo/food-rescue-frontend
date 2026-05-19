import { MarketplaceBusinessCluster } from './browse-offers.models';

export interface BrowseOffersMapRenderRequest {
  id: number;
  focusSelectedBusiness: boolean;
}

export interface BrowseOffersMapSelectionState {
  selectedBusinessId: number | null;
  selectedOfferId: number | null;
}

export function createBrowseOffersMapRenderRequest(
  id: number,
  focusSelectedBusiness: boolean,
): BrowseOffersMapRenderRequest {
  return {
    id,
    focusSelectedBusiness,
  };
}

export function resolveReconciledMapSelection(
  selectedBusinessId: number | null,
  selectedOfferId: number | null,
  mapScopedBusinesses: readonly MarketplaceBusinessCluster[],
): BrowseOffersMapSelectionState {
  if (selectedBusinessId === null) {
    return {
      selectedBusinessId,
      selectedOfferId,
    };
  }

  const businessStillVisibleInMapScope = mapScopedBusinesses.some(
    (cluster) => cluster.business.id === selectedBusinessId,
  );
  if (businessStillVisibleInMapScope) {
    return {
      selectedBusinessId,
      selectedOfferId,
    };
  }

  return {
    selectedBusinessId: null,
    selectedOfferId: null,
  };
}
