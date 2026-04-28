import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { filter } from 'rxjs';
import { UserRoleEnum } from '../../../core/models/user-role-enum';
import { NotificationService } from '../../../core/services/notification.service';
import { UserService } from '../../../core/services/user.service';
import { BusinessWorkspaceStateService } from '../../../feature/business/services/business-workspace-state.service';
import { appIcons } from '../../icons/app-icons';

interface WorkspaceNavItem {
  label: string;
  icon: IconDefinition;
  route: string | null;
  exact?: boolean;
}

@Component({
  selector: 'app-workspace-sidebar',
  imports: [RouterLink, RouterLinkActive, FontAwesomeModule],
  templateUrl: './workspace-sidebar.html',
  styleUrl: './workspace-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSidebarComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);
  private readonly user = inject(UserService).getUser();
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);

  protected readonly icons = appIcons;
  protected readonly currentUrl = signal(this.router.url);
  protected readonly currentBusinessId = computed(() => this.extractBusinessId(this.currentUrl()));
  protected readonly currentBusiness = computed(
    () => this.businessWorkspaceState.knownBusinesses().find((business) => business.id === this.currentBusinessId()) ?? null,
  );
  protected readonly sectionLabel = computed(() => {
    if (this.user()?.role === UserRoleEnum.ADMIN) {
      return 'Admin workspace';
    }

    return this.currentBusiness()?.name ?? 'Owner workspace';
  });
  protected readonly navItems = computed<WorkspaceNavItem[]>(() => {
    if (this.user()?.role === UserRoleEnum.ADMIN) {
      return [{ label: 'Business approvals', icon: this.icons.circleCheck, route: '/workspace/admin/business-approvals', exact: true }];
    }

    const currentBusinessId = this.currentBusinessId();
    if (currentBusinessId) {
      return [
        { label: 'All businesses', icon: this.icons.arrowLeft, route: '/workspace/my-businesses', exact: true },
        { label: 'Dashboard', icon: this.icons.globe, route: `/workspace/my-businesses/${currentBusinessId}`, exact: true },
        { label: 'Offers', icon: this.icons.list, route: `/workspace/my-businesses/${currentBusinessId}/offers`, exact: false },
        { label: 'Reservations', icon: this.icons.calendarDays, route: `/workspace/my-businesses/${currentBusinessId}/reservations`, exact: false },
        { label: 'Analytics', icon: this.icons.hashtag, route: `/workspace/my-businesses/${currentBusinessId}/analytics`, exact: false },
        { label: 'Settings', icon: this.icons.user, route: `/workspace/my-businesses/${currentBusinessId}/settings`, exact: false },
      ];
    }

    return [
      { label: 'Dashboard', icon: this.icons.globe, route: '/workspace/dashboard', exact: true },
      { label: 'My businesses', icon: this.icons.store, route: '/workspace/my-businesses', exact: true },
    ];
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
      });
  }

  protected keepCurrentWorkspaceSection(): void {
    this.notificationService.info('This workspace section is not connected yet.', 'Coming next');
  }

  private extractBusinessId(url: string): number | null {
    const match = url.match(/^\/workspace\/my-businesses\/(\d+)(?:\/|$)/);
    if (!match) {
      return null;
    }

    const businessId = Number(match[1]);
    return Number.isInteger(businessId) && businessId > 0 ? businessId : null;
  }
}
