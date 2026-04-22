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
import { NotificationService } from '../../../core/services/notification.service';
import { UserService } from '../../../core/services/user.service';
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
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  protected readonly menuOpen = signal(false);
  protected readonly notifications = this.notificationService.notifications;
  protected readonly recentNotifications = computed(() => this.notifications().slice(0, 6));
  protected readonly unreadCount = this.notificationService.unreadCount;
  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;

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

}
