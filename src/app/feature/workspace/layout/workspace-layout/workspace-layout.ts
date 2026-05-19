import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { UserService } from '../../../../core/services/user.service';
import { BusinessWorkspaceStateService } from '../../../../core/services/business-workspace-state.service';
import { WorkspaceHeaderComponent } from '../workspace-header/workspace-header';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import { SupportChatWidgetComponent } from '../../../support/components/support-chat-widget/support-chat-widget';

@Component({
  selector: 'app-workspace-layout',
  imports: [RouterOutlet, WorkspaceHeaderComponent, WorkspaceSidebarComponent, SupportChatWidgetComponent],
  templateUrl: './workspace-layout.html',
  styleUrl: './workspace-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceLayoutComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly routeLoading = signal(this.router.getCurrentNavigation() !== null);
  protected readonly userReady = this.userService.getReady();
  private readonly baseWorkspaceLoading = computed(() => {
    if (!this.userReady()) {
      return true;
    }

    if (this.routeLoading()) {
      return true;
    }

    return this.businessWorkspaceState.loading() && !this.businessWorkspaceState.loaded();
  });
  protected readonly workspaceLoading = this.baseWorkspaceLoading;

  protected readonly sidebarSkeletonIds = [1, 2, 3, 4, 5];
  protected readonly contentSkeletonIds = [1, 2, 3];

  constructor() {
    this.router.events
      .pipe(
        filter(
          (
            event,
          ): event is NavigationStart | NavigationEnd | NavigationCancel | NavigationError =>
            event instanceof NavigationStart
            || event instanceof NavigationEnd
            || event instanceof NavigationCancel
            || event instanceof NavigationError,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.routeLoading.set(event.url.startsWith('/workspace'));
          return;
        }

        this.routeLoading.set(false);
      });
  }
}
