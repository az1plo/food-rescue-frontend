import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  NgbDropdown,
  NgbDropdownMenu,
  NgbDropdownToggle,
} from '@ng-bootstrap/ng-bootstrap';
import { filter } from 'rxjs';
import { UserRoleEnum } from '../../../core/models/user-role-enum';
import { NotificationInboxService } from '../../../core/services/notification-inbox.service';
import { UserService } from '../../../core/services/user.service';
import { BusinessWorkspaceStateService } from '../../../feature/business/services/business-workspace-state.service';
import { appIcons } from '../../icons/app-icons';
import { AccountMenuComponent } from '../../ui/account-menu/account-menu';

@Component({
  selector: 'app-public-header',
  imports: [
    DatePipe,
    FontAwesomeModule,
    RouterLink,
    RouterLinkActive,
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    AccountMenuComponent,
  ],
  templateUrl: './public-header.html',
  styleUrl: './public-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicHeaderComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly notificationInbox = inject(NotificationInboxService);
  private readonly userService = inject(UserService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);

  protected readonly menuOpen = signal(false);
  protected readonly notifications = this.notificationInbox.notifications;
  protected readonly recentNotifications = this.notificationInbox.recentNotifications;
  protected readonly unreadCount = this.notificationInbox.unreadCount;
  protected readonly notificationsLoading = this.notificationInbox.loading;
  protected readonly notificationsError = this.notificationInbox.errorMessage;
  protected readonly user = this.userService.getUser();
  protected readonly userReady = this.userService.getReady();
  protected readonly icons = appIcons;
  protected readonly canOpenWorkspace = computed(() => {
    const currentUser = this.user();
    if (!this.userReady() || !currentUser) {
      return true;
    }

    if (currentUser.role === UserRoleEnum.ADMIN) {
      return true;
    }

    return this.businessWorkspaceState.hasBusinesses();
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
      });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((value) => !value);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected login(): void {
    void this.userService.login(this.router.url);
  }

  protected openWorkspace(): void {
    this.closeMenu();

    if (this.user()) {
      void this.router.navigateByUrl('/workspace');
      return;
    }

    void this.userService.login('/workspace');
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

}
