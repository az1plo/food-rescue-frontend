import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { BusinessWorkspaceStateService } from '../../../feature/business/services/business-workspace-state.service';

@Component({
  selector: 'app-workspace-offers-redirect',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceOffersRedirectPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);

  constructor() {
    this.businessWorkspaceState
      .refreshBusinesses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (businesses) => {
          const targetBusinessId = this.businessWorkspaceState.businessId() ?? businesses[0]?.id ?? null;

          if (targetBusinessId) {
            this.businessWorkspaceState.rememberBusinessId(targetBusinessId);
            void this.router.navigate(['/workspace', 'my-businesses', targetBusinessId, 'offers'], {
              replaceUrl: true,
            });
            return;
          }

          void this.router.navigateByUrl('/workspace/my-businesses', { replaceUrl: true });
        },
        error: () => {
          void this.router.navigateByUrl('/workspace/my-businesses', { replaceUrl: true });
        },
      });
  }
}
