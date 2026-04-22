import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { CircleIconComponent } from '../../../../shared/ui/circle-icon/circle-icon';
import {
  OfferPreviewCardComponent,
  OfferPreviewCardModel,
} from '../../../../shared/ui/offer-preview-card/offer-preview-card';

interface HomeBenefit {
  icon: IconDefinition;
  lead: string;
  tail?: string;
  description: string;
}

interface HomeStep {
  icon: IconDefinition;
  title: string;
  description: string;
}

interface HomeStat {
  icon: IconDefinition;
  value: string;
  label: string;
}

@Component({
  selector: 'app-public-home-page',
  imports: [RouterLink, FontAwesomeModule, ActionButtonComponent, CircleIconComponent, OfferPreviewCardComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly userService = inject(UserService);

  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;

  protected readonly heroBenefits: HomeBenefit[] = [
    {
      icon: appIcons.leaf,
      lead: 'Save food',
      description: 'Rescue delicious food from local businesses.',
    },
    {
      icon: appIcons.store,
      lead: 'Support local',
      description: 'Help businesses and build stronger communities.',
    },
    {
      icon: appIcons.globe,
      lead: 'Protect the',
      tail: 'planet',
      description: 'Reduce waste and make a real impact.',
    },
  ];

  protected readonly offerPreview: OfferPreviewCardModel[] = [
    {
      title: 'Bakery Surprise Box',
      business: 'Little Oven Bakery',
      price: '3.50 EUR',
      rating: '4.8',
      distance: '1.2 km',
      pickup: 'Today 18:00 - 20:00',
      image: '/images/offer-bakery.png',
    },
    {
      title: 'Sushi Set',
      business: 'Sakura Sushi',
      price: '5.00 EUR',
      rating: '4.6',
      distance: '2.1 km',
      pickup: 'Today 19:00 - 21:00',
      image: '/images/offer-sushi.png',
    },
    {
      title: 'Healthy Mix',
      business: 'Green Kitchen',
      price: '4.00 EUR',
      rating: '4.7',
      distance: '1.5 km',
      pickup: 'Today 17:30 - 19:30',
      image: '/images/offer-salad.png',
    },
    {
      title: 'Bagels Box',
      business: 'City Bagels',
      price: '3.00 EUR',
      rating: '4.5',
      distance: '2.7 km',
      pickup: 'Today 18:30 - 20:00',
      image: '/images/offer-bagels.png',
    },
  ];

  protected readonly steps: HomeStep[] = [
    {
      icon: appIcons.magnifyingGlass,
      title: 'Browse offers',
      description: 'Find great surplus food near you.',
    },
    {
      icon: appIcons.bagShopping,
      title: 'Reserve',
      description: 'Book your favorite offer in a few taps.',
    },
    {
      icon: appIcons.calendarDays,
      title: 'Pick up',
      description: 'Collect your order and enjoy your meal.',
    },
  ];

  protected readonly stats: HomeStat[] = [
    { icon: appIcons.bagShopping, value: '10K+', label: 'Meals saved' },
    { icon: appIcons.store, value: '500+', label: 'Partner businesses' },
    { icon: appIcons.userGroup, value: '15K+', label: 'Happy rescuers' },
    { icon: appIcons.globe, value: '30+', label: 'Cities' },
  ];
}
