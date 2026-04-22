import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationService } from '../../../core/services/notification.service';
import { appIcons } from '../../icons/app-icons';

interface WorkspaceNavItem {
  label: string;
  icon: IconDefinition;
  route: string | null;
}

@Component({
  selector: 'app-workspace-sidebar',
  imports: [RouterLink, RouterLinkActive, FontAwesomeModule],
  templateUrl: './workspace-sidebar.html',
  styleUrl: './workspace-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSidebarComponent {
  private readonly notificationService = inject(NotificationService);

  protected readonly icons = appIcons;
  protected readonly navItems: WorkspaceNavItem[] = [
    { label: 'My businesses', icon: this.icons.store, route: '/workspace/my-businesses' },
    { label: 'Dashboard', icon: this.icons.globe, route: null },
    { label: 'Offers', icon: this.icons.list, route: null },
    { label: 'Reservations', icon: this.icons.calendarDays, route: null },
    { label: 'Analytics', icon: this.icons.hashtag, route: null },
    { label: 'Settings', icon: this.icons.user, route: null },
  ];

  protected keepCurrentWorkspaceSection(): void {
    this.notificationService.info('This workspace section is not connected yet.', 'Coming next');
  }
}
