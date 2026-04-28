import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  NgbDropdown,
  NgbDropdownItem,
  NgbDropdownMenu,
  NgbDropdownToggle,
} from '@ng-bootstrap/ng-bootstrap';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-account-menu',
  imports: [NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.scss',
  host: {
    class: 'account-menu',
    '[attr.data-variant]': 'variant()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);

  readonly name = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly variant = input<'public' | 'workspace'>('public');

  protected openReservations(): void {
    void this.router.navigateByUrl('/my-reservations');
  }

  protected logout(): void {
    this.userService.logout();
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
