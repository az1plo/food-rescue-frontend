import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { CircleIconComponent } from '../../../../shared/ui/circle-icon/circle-icon';
import { OfferCardComponent } from '../../../../shared/ui/offer-card/offer-card';
import { OfferCardModel } from '../../../../shared/ui/offer-card/offer-card.models';

interface HomeStep {
  icon: IconDefinition;
  title: string;
  description: string;
}

interface HomeStat {
  icon: IconDefinition;
  value: string;
  label: string;
  note: string;
}

interface HomeBusinessBenefit {
  icon: IconDefinition;
  title: string;
  description: string;
}

@Component({
  selector: 'app-public-home-page',
  imports: [RouterLink, FontAwesomeModule, ActionButtonComponent, CircleIconComponent, OfferCardComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly userService = inject(UserService);

  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;

  protected readonly offerPreview: OfferCardModel[] = [
    {
      title: 'Pastry Bag',
      businessName: 'Spinning J Bakery',
      businessArea: 'Bucktown',
      brandMark: 'SJ',
      price: '\u20AC4.50',
      originalPrice: '\u20AC15.00',
      rating: '4.8',
      availabilityLabel: '1 left',
      distance: '0.5 km away',
      pickup: 'Today 4:00 PM - 6:00 PM',
      image: '/images/offer-bakery.png',
      status: 'AVAILABLE',
    },
    {
      title: 'Good Day Bag',
      businessName: 'Lula Cafe',
      businessArea: 'Wicker Park',
      brandMark: 'LC',
      price: '\u20AC5.00',
      originalPrice: '\u20AC16.00',
      rating: '4.7',
      availabilityLabel: '2 left',
      distance: '1.0 km away',
      pickup: 'Today 3:30 PM - 5:30 PM',
      image: '/images/offer-salad.png',
      status: 'AVAILABLE',
    },
    {
      title: 'Produce Bundle',
      businessName: 'The Green Grocer',
      businessArea: 'Logan Square',
      brandMark: 'GG',
      price: '\u20AC6.00',
      originalPrice: '\u20AC18.00',
      rating: '4.9',
      availabilityLabel: '3 left',
      distance: '1.3 km away',
      pickup: 'Today 5:00 PM - 7:00 PM',
      image: '/images/offer-sushi.png',
      status: 'AVAILABLE',
    },
    {
      title: 'Pizza Surprise Bag',
      businessName: 'Santa Maria Pizzeria',
      businessArea: 'West Loop',
      brandMark: 'SP',
      price: '\u20AC5.50',
      originalPrice: '\u20AC16.00',
      rating: '4.6',
      availabilityLabel: '1 left',
      distance: '1.3 km away',
      pickup: 'Today 8:00 PM - 9:30 PM',
      image: '/images/offer-bagels.png',
      status: 'AVAILABLE',
    },
  ];

  protected readonly heroFeaturedOffers = this.offerPreview.slice(0, 3);
  protected readonly heroTrustAvatars = ['AL', 'MK', 'JP', 'SR'];
  protected readonly heroStars = Array.from({ length: 5 }, (_, index) => index);

  protected readonly steps: HomeStep[] = [
    {
      icon: appIcons.magnifyingGlass,
      title: 'Browse nearby offers',
      description: 'Discover great food from local businesses near you.',
    },
    {
      icon: appIcons.bagShopping,
      title: 'Reserve & pay in app',
      description: 'Secure your order in seconds at a big discount.',
    },
    {
      icon: appIcons.calendarDays,
      title: 'Pick up & enjoy',
      description: 'Pick it up during the time window and enjoy your meal.',
    },
  ];

  protected readonly stats: HomeStat[] = [
    {
      icon: appIcons.leaf,
      value: '2.4M+',
      label: 'Meals rescued',
      note: 'Delicious meals saved from waste and enjoyed by our community.',
    },
    {
      icon: appIcons.store,
      value: '5,800+',
      label: 'Local businesses',
      note: 'Restaurants, cafes, and grocers partnering with Savr.',
    },
    {
      icon: appIcons.globe,
      value: '1,250',
      label: 'Tons of CO2 saved',
      note: 'Keeping good food out of landfills and our planet happier.',
    },
    {
      icon: appIcons.userGroup,
      value: '50,000+',
      label: 'Happy savers',
      note: 'People across the city saving food and money every day.',
    },
  ];

  protected readonly businessBenefits: HomeBusinessBenefit[] = [
    {
      icon: appIcons.store,
      title: 'Reduce waste and costs',
      description: 'Turn unsold food into value instead of disposal costs.',
    },
    {
      icon: appIcons.userGroup,
      title: 'Attract new customers',
      description: 'Reach thousands of local savers who love neighborhood food spots.',
    },
    {
      icon: appIcons.leaf,
      title: 'Strengthen your impact',
      description: 'Show your community that good food deserves a second chance.',
    },
  ];
}
