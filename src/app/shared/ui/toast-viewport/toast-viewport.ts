import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { NotificationService, NotificationTone } from '../../../core/services/notification.service';
import { appIcons } from '../../icons/app-icons';

@Component({
  selector: 'app-toast-viewport',
  imports: [DatePipe, FontAwesomeModule],
  templateUrl: './toast-viewport.html',
  styleUrl: './toast-viewport.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastViewportComponent {
  private readonly notificationService = inject(NotificationService);

  protected readonly notifications = this.notificationService.activeToasts;
  protected readonly icons = appIcons;

  protected dismiss(id: number): void {
    this.notificationService.dismissToast(id);
  }

  protected iconForTone(tone: NotificationTone): IconDefinition {
    switch (tone) {
      case 'success':
        return this.icons.circleCheck;
      case 'error':
        return this.icons.circleExclamation;
      default:
        return this.icons.circleInfo;
    }
  }
}
