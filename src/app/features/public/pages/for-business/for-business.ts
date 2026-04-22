import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { CircleIconComponent } from '../../../../shared/ui/circle-icon/circle-icon';

interface BusinessBenefit {
  icon: IconDefinition;
  title: string;
  description: string;
}

interface BusinessStep {
  icon: IconDefinition;
  title: string;
  description: string;
}

@Component({
  selector: 'app-for-business-page',
  imports: [FontAwesomeModule, CircleIconComponent],
  templateUrl: './for-business.html',
  styleUrl: './for-business.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForBusinessPage {
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);

  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;

  protected readonly benefits: BusinessBenefit[] = [
    {
      icon: appIcons.store,
      title: 'Manage every location in one workspace',
      description: 'Keep business details, approval status, and future updates organized in a single place.',
    },
    {
      icon: appIcons.userGroup,
      title: 'Reach local people faster',
      description: 'Prepare your business presence so publishing offers later feels clear and repeatable.',
    },
    {
      icon: appIcons.leaf,
      title: 'Reduce waste with a cleaner process',
      description: 'Bring surplus food into a structured rescue flow that is easier for staff to manage.',
    },
    {
      icon: appIcons.heart,
      title: 'Strengthen your local reputation',
      description: 'Show customers and neighbors that your business turns surplus into positive impact.',
    },
  ];

  protected readonly steps: BusinessStep[] = [
    {
      icon: appIcons.store,
      title: 'Create your profile',
      description: 'Add venue details and set up the location inside the workspace.',
    },
    {
      icon: appIcons.plus,
      title: 'Prepare future offers',
      description: 'Keep the business ready for the upcoming rescue offer flow.',
    },
    {
      icon: appIcons.userGroup,
      title: 'Reach nearby customers',
      description: 'Connect with local people who want to rescue surplus food.',
    },
    {
      icon: appIcons.bagShopping,
      title: 'Hand over with confidence',
      description: 'Use clear business information so collection stays smooth for the team and customers.',
    },
    {
      icon: appIcons.globe,
      title: 'Track your impact',
      description: 'Build a stronger sustainability story as the workspace grows with new tools.',
    },
  ];

  protected openWorkspace(): void {
    if (this.user()) {
      void this.router.navigateByUrl('/workspace');
      return;
    }

    void this.userService.login('/workspace');
  }

  protected createBusinessProfile(): void {
    if (this.user()) {
      void this.router.navigateByUrl('/workspace/my-businesses/new');
      return;
    }

    void this.userService.login('/workspace/my-businesses/new');
  }
}
