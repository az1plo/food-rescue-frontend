import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { UserRoleEnum } from '../../../core/models/user-role-enum';
import { UserService } from '../../../core/services/user.service';
import { BusinessWorkspaceStateService } from '../../../feature/business/services/business-workspace-state.service';

@Component({
  selector: 'app-workspace-home-redirect',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceHomeRedirectPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly user = inject(UserService).getUser();
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private redirectHandled = false;

  constructor() {
    effect(() => {
      const currentUser = this.user();
      if (!currentUser || this.redirectHandled) {
        return;
      }

      this.redirectHandled = true;

      if (currentUser.role === UserRoleEnum.ADMIN) {
        void this.router.navigateByUrl('/workspace/admin/business-approvals', { replaceUrl: true });
        return;
      }

      this.businessWorkspaceState
        .refreshBusinesses()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            void this.router.navigateByUrl('/workspace/dashboard', { replaceUrl: true });
          },
          error: () => {
            void this.router.navigateByUrl('/workspace/dashboard', { replaceUrl: true });
          },
        });
    });
  }
}
