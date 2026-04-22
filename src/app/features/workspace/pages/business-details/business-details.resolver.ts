import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { catchError, of, tap } from 'rxjs';
import { BusinessModel } from '../../../business/models/business.model';
import { BusinessApiService } from '../../../business/services/business-api.service';
import { BusinessWorkspaceStateService } from '../../../business/services/business-workspace-state.service';

export const businessDetailsResolver: ResolveFn<BusinessModel | null> = (route) => {
  const businessApi = inject(BusinessApiService);
  const businessWorkspaceState = inject(BusinessWorkspaceStateService);
  const rawId = route.paramMap.get('id');
  const businessId = Number(rawId);

  if (!Number.isInteger(businessId) || businessId <= 0) {
    return of(null);
  }

  return businessApi.getBusiness(businessId).pipe(
    tap((business) => {
      businessWorkspaceState.rememberBusinessId(business.id);
      businessWorkspaceState.rememberBusinessSummary(business);
    }),
    catchError(() => of(null)),
  );
};
