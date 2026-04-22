import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BusinessWorkspaceListItem } from '../../../business/models/business.model';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { BusinessCardComponent } from '../business-card/business-card';

type RouteTarget = string | readonly (string | number)[] | null;

@Component({
  selector: 'app-business-list',
  imports: [ActionButtonComponent, BusinessCardComponent],
  templateUrl: './business-list.html',
  styleUrl: './business-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessListComponent {
  readonly businesses = input<BusinessWorkspaceListItem[]>([]);
  readonly loading = input(false);
  readonly createRoute = input<RouteTarget>(null);
}
