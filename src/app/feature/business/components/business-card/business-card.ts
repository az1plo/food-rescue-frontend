import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { BUSINESS_STATUS_META, buildBusinessMark, BusinessWorkspaceListItem, resolveBusinessIconUrl } from '../../models/business.model';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';

@Component({
  selector: 'app-business-card',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './business-card.html',
  styleUrl: './business-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessCardComponent {
  readonly business = input.required<BusinessWorkspaceListItem>();

  protected readonly icons = appIcons;
  protected readonly statusMeta = computed(() => BUSINESS_STATUS_META[this.business().status]);
  protected readonly iconUrl = computed(() => resolveBusinessIconUrl(this.business().iconUrl));
  protected readonly businessMark = computed(() => buildBusinessMark(this.business().name));
  protected readonly addressLine = computed(() => {
    const business = this.business();
    return `${business.address.street}, ${business.address.city}, ${business.address.country}`;
  });
}
