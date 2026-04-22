import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { appIcons } from '../../../../shared/icons/app-icons';
import { CircleIconComponent } from '../../../../shared/ui/circle-icon/circle-icon';

interface WorkflowStep {
  icon: IconDefinition;
  step: number;
  title: string;
  description: string;
}

interface WorkflowBenefit {
  icon: IconDefinition;
  title: string;
  description: string;
}

@Component({
  selector: 'app-how-it-works-page',
  imports: [FontAwesomeModule, CircleIconComponent],
  templateUrl: './how-it-works.html',
  styleUrl: './how-it-works.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowItWorksPage {
  protected readonly icons = appIcons;

  protected readonly customerSteps: WorkflowStep[] = [
    {
      icon: appIcons.magnifyingGlass,
      step: 1,
      title: 'Browse offers',
      description: 'Find available surplus food from local businesses near you.',
    },
    {
      icon: appIcons.bagShopping,
      step: 2,
      title: 'Reserve online',
      description: 'Reserve your offer directly on the website in a few clicks.',
    },
    {
      icon: appIcons.calendarDays,
      step: 3,
      title: 'Pick up at the right time',
      description: 'Go to the business during the pickup window and collect your order.',
    },
    {
      icon: appIcons.heart,
      step: 4,
      title: 'Enjoy and make an impact',
      description: 'Save money, enjoy great food, and help reduce food waste.',
    },
  ];

  protected readonly businessSteps: WorkflowStep[] = [
    {
      icon: appIcons.store,
      step: 1,
      title: 'Create your profile',
      description: 'Set up your business information and submit it for review.',
    },
    {
      icon: appIcons.circleCheck,
      step: 2,
      title: 'Get approved',
      description: 'We review your profile to make sure your business is ready.',
    },
    {
      icon: appIcons.plus,
      step: 3,
      title: 'Add offers',
      description: 'Create offers with price, quantity, and pickup time.',
    },
    {
      icon: appIcons.bell,
      step: 4,
      title: 'Receive reservations',
      description: 'Customers reserve your offers through the website.',
    },
    {
      icon: appIcons.bagShopping,
      step: 5,
      title: 'Prepare and hand over',
      description: 'Get the order ready and hand it over during the pickup window.',
    },
  ];

  protected readonly benefits: WorkflowBenefit[] = [
    {
      icon: appIcons.leaf,
      title: 'Reduce food waste',
      description: 'Help keep good food out of landfills and protect the planet.',
    },
    {
      icon: appIcons.heart,
      title: 'Save money',
      description: 'Get quality food at great prices and stretch your budget.',
    },
    {
      icon: appIcons.userGroup,
      title: 'Support local',
      description: 'Support businesses in your community and small shops.',
    },
    {
      icon: appIcons.globe,
      title: 'Make an impact',
      description: 'Every order you make creates a positive impact.',
    },
  ];
}
