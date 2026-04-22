import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UserService } from '../../core/services/user.service';
import { appIcons } from '../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../shared/ui/action-button/action-button';
import { CircleIconComponent } from '../../shared/ui/circle-icon/circle-icon';

@Component({
  selector: 'app-offers-page',
  imports: [ActionButtonComponent, CircleIconComponent],
  templateUrl: './offers.html',
  styleUrl: './offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OffersPage {
  private readonly userService = inject(UserService);

  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;
}
