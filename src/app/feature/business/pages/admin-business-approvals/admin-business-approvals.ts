import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { CircleIconComponent } from '../../../../shared/ui/circle-icon/circle-icon';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { BusinessModel } from '../../models/business.model';
import { BusinessApiService } from '../../services/business-api.service';

@Component({
  selector: 'app-admin-business-approvals-page',
  imports: [DatePipe, ActionButtonComponent, CircleIconComponent],
  templateUrl: './admin-business-approvals.html',
  styleUrl: './admin-business-approvals.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBusinessApprovalsPage {
  private readonly businessApi = inject(BusinessApiService);
  private readonly notificationService = inject(NotificationService);

  protected readonly icons = appIcons;
  protected readonly pendingBusinesses = signal<BusinessModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly approvingIds = signal<number[]>([]);

  protected readonly approvalCount = computed(() => this.pendingBusinesses().length);

  constructor() {
    this.loadPendingBusinesses();
  }

  protected refreshQueue(): void {
    this.loadPendingBusinesses();
  }

  protected approveBusiness(id: number): void {
    if (this.isApproving(id)) {
      return;
    }

    this.approvingIds.update((ids) => [...ids, id]);

    this.businessApi.approveBusiness(id).subscribe({
      next: (approvedBusiness) => {
        this.pendingBusinesses.update((businesses) => businesses.filter((business) => business.id !== id));
        this.removeApprovingId(id);
        this.notificationService.success(`"${approvedBusiness.name}" is now active.`, 'Business approved');
      },
      error: () => {
        this.removeApprovingId(id);
        this.notificationService.error('Business approval could not be completed.');
      },
    });
  }

  protected isApproving(id: number): boolean {
    return this.approvingIds().includes(id);
  }

  private loadPendingBusinesses(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.businessApi.getPendingBusinessesForApproval().subscribe({
      next: (businesses) => {
        this.pendingBusinesses.set(businesses);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('We could not load pending businesses right now. Please try again.');
      },
    });
  }

  private removeApprovingId(id: number): void {
    this.approvingIds.update((ids) => ids.filter((currentId) => currentId !== id));
  }
}
