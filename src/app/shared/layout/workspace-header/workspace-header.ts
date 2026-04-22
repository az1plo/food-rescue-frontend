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
import { NotificationService } from '../../../core/services/notification.service';
import { UserService } from '../../../core/services/user.service';
import { BusinessWorkspaceStateService } from '../../../feature/business/services/business-workspace-state.service';
import { appIcons } from '../../icons/app-icons';
import { AccountMenuComponent } from '../../ui/account-menu/account-menu';

interface WorkspaceBreadcrumb {
  label: string;
  route?: string;
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
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);

  protected readonly icons = appIcons;
  protected readonly user = this.userService.getUser();
  protected readonly notifications = this.notificationService.notifications;
  protected readonly recentNotifications = computed(() => this.notifications().slice(0, 6));
  protected readonly unreadCount = this.notificationService.unreadCount;
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

  protected markNotificationsRead(): void {
    this.notificationService.markAllAsRead();
  }

  protected clearNotifications(): void {
    this.notificationService.clearAll();
  }

  protected removeNotification(id: number, event: Event): void {
    event.stopPropagation();
    this.notificationService.remove(id);
  }

  private buildBreadcrumbs(): WorkspaceBreadcrumb[] {
    const url = this.currentUrl();
    const breadcrumbs: WorkspaceBreadcrumb[] = [{ label: 'Workspace', route: '/workspace/my-businesses' }];

    if (!url.startsWith('/workspace')) {
      return breadcrumbs;
    }

    if (url.startsWith('/workspace/my-businesses')) {
      breadcrumbs.push({ label: 'My businesses', route: '/workspace/my-businesses' });
    }

    if (url === '/workspace/my-businesses' || url === '/workspace') {
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

    breadcrumbs.push({ label: businessName });
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
