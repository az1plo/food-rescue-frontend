import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { CircleIconComponent } from '../../../../shared/ui/circle-icon/circle-icon';
import { BusinessListComponent } from '../../components/business-list/business-list';
import { BusinessWorkspaceStateService } from '../../services/business-workspace-state.service';

type BusinessSummaryTone = 'default' | 'success' | 'pending' | 'danger';

interface BusinessSummaryCard {
  label: string;
  value: number;
  icon: IconDefinition;
  tone: BusinessSummaryTone;
}

@Component({
  selector: 'app-my-businesses-page',
  imports: [ActionButtonComponent, CircleIconComponent, BusinessListComponent],
  templateUrl: './my-businesses.html',
  styleUrl: './my-businesses.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyBusinessesPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);

  protected readonly businesses = computed(() =>
    [...this.businessWorkspaceState.knownBusinesses()].sort((first, second) => second.lastViewedAt - first.lastViewedAt),
  );
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly icons = appIcons;

  protected readonly summaryCards = computed<BusinessSummaryCard[]>(() => {
    const businesses = this.businesses();
    const active = businesses.filter((business) => business.status === 'ACTIVE').length;
    const pending = businesses.filter((business) => business.status === 'PENDING').length;
    const attention = businesses.filter((business) => business.status === 'REJECTED' || business.status === 'BLOCKED').length;

    return [
      { label: 'Total businesses', value: businesses.length, icon: this.icons.store, tone: 'default' },
      { label: 'Active', value: active, icon: this.icons.circleCheck, tone: 'success' },
      { label: 'Pending', value: pending, icon: this.icons.clock, tone: 'pending' },
      { label: 'Needs attention', value: attention, icon: this.icons.circleExclamation, tone: 'danger' },
    ];
  });

  constructor() {
    this.loadBusinesses();
  }

  protected refreshBusinesses(): void {
    this.loadBusinesses();
  }

  protected trackBusinessSummary(index: number, summary: BusinessSummaryCard): string {
    return `${summary.label}-${index}`;
  }

  private loadBusinesses(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.businessWorkspaceState
      .refreshBusinesses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('We could not load your businesses right now. Please try again.');
        },
      });
  }
}
