import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faApple, faFacebookF, faGoogle } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope, faEye, faEyeSlash, faLock } from '@fortawesome/free-solid-svg-icons';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { readHttpErrorMessage } from '../../../../core/utils/http-error-message';

interface SocialProvider {
  id: 'google' | 'facebook' | 'apple';
  label: string;
  icon: IconDefinition;
}

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, FontAwesomeModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly notificationService = inject(NotificationService);

  protected readonly user = this.userService.getUser();
  protected readonly returnUrl = signal('/');
  protected readonly submitAttempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly icons = {
    email: faEnvelope,
    lock: faLock,
    eye: faEye,
    eyeSlash: faEyeSlash,
  } as const;
  protected readonly socialProviders: SocialProvider[] = [
    { id: 'google', label: 'Google', icon: faGoogle },
    { id: 'facebook', label: 'Facebook', icon: faFacebookF },
    { id: 'apple', label: 'Apple', icon: faApple },
  ];

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(255)]],
  });

  constructor() {
    this.returnUrl.set(this.normalizeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.returnUrl.set(this.normalizeReturnUrl(params.get('returnUrl')));
      });

    effect(() => {
      if (this.user()) {
        void this.router.navigateByUrl(this.returnUrl());
      }
    });
  }

  protected async signIn(): Promise<void> {
    this.submitAttempted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid) {
      return;
    }

    this.saving.set(true);

    try {
      const value = this.form.getRawValue();
      const user = await this.userService.loginWithCredentials(value.email, value.password, this.returnUrl());

      if (!user) {
        this.errorMessage.set('We could not sign you in right now. Please try again.');
      }
    } catch (error) {
      this.errorMessage.set(readHttpErrorMessage(error, 'Invalid email or password.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  protected showFieldError(fieldName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[fieldName];
    return this.submitAttempted() && control.invalid;
  }

  protected openSocialProvider(provider: SocialProvider): void {
    if (provider.id === 'google') {
      this.userService.loginWithIdentityProvider('google', this.returnUrl());
      return;
    }

    this.notificationService.info('This social provider is not connected yet.', `${provider.label} coming soon`);
  }

  private normalizeReturnUrl(returnUrl: string | null): string {
    if (!returnUrl || !returnUrl.startsWith('/') || returnUrl.startsWith('/login') || returnUrl.startsWith('/register')) {
      return '/';
    }

    return returnUrl;
  }
}
