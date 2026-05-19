import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';
import {
  PickupCalendarCell,
  PickupSchedulePanel,
  PickupTimeFieldName,
} from '../../business-offers.models';

@Component({
  selector: 'app-business-offer-pickup-scheduler',
  imports: [ReactiveFormsModule, FontAwesomeModule],
  templateUrl: './business-offer-pickup-scheduler.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferPickupSchedulerComponent {
  readonly icons = input.required<typeof appIcons>();
  readonly form = input.required<FormGroup>();
  readonly countries = input.required<readonly string[]>();
  readonly businessName = input('');
  readonly businessProfileAddressLabel = input('');
  readonly pickupNoteMaxLength = input.required<number>();
  readonly submitAttempted = input(false);
  readonly pickupBaseDateValue = input('');
  readonly pickupBaseDateLabel = input.required<string>();
  readonly pickupWindowSummary = input<string | null>(null);
  readonly pickupWindowRollsToNextDay = input(false);
  readonly pickupSchedulePanel = input<PickupSchedulePanel | null>(null);
  readonly pickupCalendarMonthLabel = input.required<string>();
  readonly pickupCalendarDays = input.required<readonly PickupCalendarCell[]>();
  readonly pickupCalendarWeekdays = input.required<readonly string[]>();
  readonly pickupQuickTimePresets = input.required<readonly string[]>();
  readonly pickupHourOptions = input.required<readonly string[]>();
  readonly pickupMinuteOptions = input.required<readonly string[]>();
  readonly pickupFromTimeValue = input('');
  readonly pickupToTimeValue = input('');
  readonly pickupFromHour = input<string | null>(null);
  readonly pickupFromMinute = input<string | null>(null);
  readonly pickupToHour = input<string | null>(null);
  readonly pickupToMinute = input<string | null>(null);
  readonly pickupWindowInvalid = input(false);
  readonly pickupSchedulePanelToggled = output<PickupSchedulePanel>();
  readonly pickupMonthShifted = output<number>();
  readonly pickupRelativeDateSelected = output<number>();
  readonly pickupDateSelected = output<string>();
  readonly pickupTimePresetApplied = output<{ fieldName: PickupTimeFieldName; value: string }>();
  readonly pickupTimeCleared = output<PickupTimeFieldName>();
  readonly pickupTimePartSelected = output<{ fieldName: PickupTimeFieldName; part: 'hour' | 'minute'; value: string }>();

  protected usesBusinessProfileAddress(): boolean {
    return Boolean(this.form().get('useBusinessProfileAddress')?.value);
  }

  protected showFieldError(fieldName: 'pickupStreet' | 'pickupCity' | 'pickupPostalCode' | 'pickupNote' | 'pickupFrom' | 'pickupTo'): boolean {
    const control = this.form().get(fieldName);
    return !!control && control.invalid && (this.submitAttempted() || control.touched);
  }

  protected isPickupSchedulePanelOpen(panel: PickupSchedulePanel): boolean {
    return this.pickupSchedulePanel() === panel;
  }

  protected pickupTimeValue(fieldName: PickupTimeFieldName): string {
    return fieldName === 'pickupFrom' ? this.pickupFromTimeValue() : this.pickupToTimeValue();
  }

  protected pickupTimePart(fieldName: PickupTimeFieldName, part: 'hour' | 'minute'): string | null {
    if (fieldName === 'pickupFrom') {
      return part === 'hour' ? this.pickupFromHour() : this.pickupFromMinute();
    }

    return part === 'hour' ? this.pickupToHour() : this.pickupToMinute();
  }
}
