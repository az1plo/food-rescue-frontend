import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';

@Component({
  selector: 'app-browse-offers-page',
  imports: [ActionButtonComponent],
  templateUrl: './browse-offers.html',
  styleUrl: './browse-offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowseOffersPage {
  private readonly userService = inject(UserService);

  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;
}
