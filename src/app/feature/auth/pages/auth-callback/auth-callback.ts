import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { readHttpErrorMessage } from '../../../../core/utils/http-error-message';

@Component({
  selector: 'app-auth-callback-page',
  imports: [RouterLink],
  templateUrl: './auth-callback.html',
  styleUrl: './auth-callback.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackPage {
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly notificationService = inject(NotificationService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.finishLogin();
  }

  protected backToLogin(): void {
    void this.router.navigate(['/login']);
  }

  private async finishLogin(): Promise<void> {
    try {
      const user = await this.userService.completeIdentityProviderLogin();
      if (!user) {
        this.errorMessage.set('Google sign in did not return a valid account session.');
        return;
      }

      this.notificationService.success('You are signed in with Google.', 'Welcome back');
    } catch (error) {
      this.errorMessage.set(readHttpErrorMessage(error, 'Google sign in could not be completed.'));
    } finally {
      this.loading.set(false);
    }
  }
}
