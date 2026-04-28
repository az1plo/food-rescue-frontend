import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  NgbDropdown,
  NgbDropdownMenu,
  NgbDropdownToggle,
} from '@ng-bootstrap/ng-bootstrap';
import { filter } from 'rxjs';
import { NotificationInboxService } from '../../../core/services/notification-inbox.service';
import { UserService } from '../../../core/services/user.service';
import { BusinessWorkspaceStateService } from '../../../feature/business/services/business-workspace-state.service';
import { appIcons } from '../../icons/app-icons';
import { AccountMenuComponent } from '../../ui/account-menu/account-menu';

type WorkspaceRouteTarget = string | readonly (string | number)[];

interface WorkspaceBreadcrumb {
  label: string;
  route?: WorkspaceRouteTarget;
}

@Component({
  selector: 'app-workspace-header',
  imports: [
    DatePipe,
    FontAwesomeModule,
    RouterLink,
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    AccountMenuComponent,
  ],
  templateUrl: './workspace-header.html',
  styleUrl: './workspace-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceHeaderComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly notificationInbox = inject(NotificationInboxService);
  private readonly userService = inject(UserService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);

  protected readonly icons = appIcons;
  protected readonly user = this.userService.getUser();
  protected readonly notifications = this.notificationInbox.notifications;
  protected readonly recentNotifications = this.notificationInbox.recentNotifications;
  protected readonly unreadCount = this.notificationInbox.unreadCount;
  protected readonly notificationsLoading = this.notificationInbox.loading;
  protected readonly notificationsError = this.notificationInbox.errorMessage;
  protected readonly currentUrl = signal(this.router.url);
  protected readonly breadcrumbs = computed(() => this.buildBreadcrumbs());

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

  protected openCustomerView(): void {
    void this.router.navigateByUrl('/browse-offers');
  }

  protected openNotifications(): void {
    this.notificationInbox.ensureLoaded();
  }

  protected refreshNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationInbox.refresh();
  }

  protected markNotificationsRead(event?: Event): void {
    event?.stopPropagation();
    this.notificationInbox.markAllAsRead();
  }

  protected markNotificationRead(id: number, event: Event): void {
    event.stopPropagation();
    this.notificationInbox.markAsRead(id);
  }

  private buildBreadcrumbs(): WorkspaceBreadcrumb[] {
    const url = this.currentUrl();
    const breadcrumbs: WorkspaceBreadcrumb[] = [{ label: 'Workspace', route: '/workspace/dashboard' }];

    if (!url.startsWith('/workspace')) {
      return breadcrumbs;
    }

    if (url.startsWith('/workspace/admin/business-approvals')) {
      breadcrumbs.push({ label: 'Business approvals' });
      return breadcrumbs;
    }

    if (url === '/workspace/dashboard') {
      breadcrumbs.push({ label: 'Dashboard' });
      return breadcrumbs;
    }

    if (url === '/workspace/analytics') {
      breadcrumbs.push({ label: 'Analytics' });
      return breadcrumbs;
    }

    if (url === '/workspace/reservations') {
      breadcrumbs.push({ label: 'Reservations' });
      return breadcrumbs;
    }

    if (url === '/workspace/settings') {
      breadcrumbs.push({ label: 'Settings' });
      return breadcrumbs;
    }

    if (url.startsWith('/workspace/my-businesses')) {
      breadcrumbs.push({ label: 'My businesses', route: '/workspace/my-businesses' });
    }

    if (
      url === '/workspace/my-businesses' ||
      url === '/workspace' ||
      url === '/workspace/offers' ||
      url === '/workspace/dashboard'
    ) {
      if (url === '/workspace/offers') {
        breadcrumbs.push({ label: 'Offers' });
      }
      return breadcrumbs;
    }

    if (url === '/workspace/my-businesses/new') {
      breadcrumbs.push({ label: 'Create business' });
      return breadcrumbs;
    }

    const businessId = this.extractBusinessId(url);
    if (!businessId) {
      return breadcrumbs;
    }

    const businessName =
      this.businessWorkspaceState.knownBusinesses().find((item) => item.id === businessId)?.name ?? 'Business details';

    const isOffersRoute = url.startsWith(`/workspace/my-businesses/${businessId}/offers`);
    const isAnalyticsRoute = url.startsWith(`/workspace/my-businesses/${businessId}/analytics`);
    const isReservationsRoute = url.startsWith(`/workspace/my-businesses/${businessId}/reservations`);
    const isSettingsRoute = url.startsWith(`/workspace/my-businesses/${businessId}/settings`);
    breadcrumbs.push({
      label: businessName,
      route:
        isOffersRoute || isAnalyticsRoute || isReservationsRoute || isSettingsRoute
          ? ['/workspace', 'my-businesses', businessId]
          : undefined,
    });

    if (isOffersRoute) {
      breadcrumbs.push({ label: 'Offers' });
    } else if (isAnalyticsRoute) {
      breadcrumbs.push({ label: 'Analytics' });
    } else if (isReservationsRoute) {
      breadcrumbs.push({ label: 'Reservations' });
    } else if (isSettingsRoute) {
      breadcrumbs.push({ label: 'Settings' });
    }

    return breadcrumbs;
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
