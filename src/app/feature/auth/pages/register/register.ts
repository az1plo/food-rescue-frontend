import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faApple, faFacebookF, faGoogle } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope, faEye, faEyeSlash, faLock, faUser } from '@fortawesome/free-solid-svg-icons';
import { AuthApiService } from '../../../../core/services/auth-api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { readHttpErrorMessage } from '../../../../core/utils/http-error-message';

interface SocialProvider {
  id: 'google' | 'facebook' | 'apple';
  label: string;
  icon: IconDefinition;
}

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, FontAwesomeModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly userService = inject(UserService);
  private readonly notificationService = inject(NotificationService);

  protected readonly user = this.userService.getUser();
  protected readonly returnUrl = signal('/');
  protected readonly submitAttempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);
  protected readonly icons = {
    email: faEnvelope,
    eye: faEye,
    eyeSlash: faEyeSlash,
    lock: faLock,
    user: faUser,
  } as const;
  protected readonly socialProviders: SocialProvider[] = [
    { id: 'google', label: 'Google', icon: faGoogle },
    { id: 'facebook', label: 'Facebook', icon: faFacebookF },
    { id: 'apple', label: 'Apple', icon: faApple },
  ];

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(255)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(255)]],
    acceptTerms: [false, [Validators.requiredTrue]],
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

  protected async createAccount(): Promise<void> {
    this.submitAttempted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid || this.passwordsDoNotMatch()) {
      return;
    }

    this.saving.set(true);
    const value = this.form.getRawValue();

    this.authApi
      .register({
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        email: value.email.trim(),
        password: value.password,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async () => {
          try {
            this.notificationService.success('Your account was created successfully.', 'Welcome to Food Rescue');
            await this.userService.loginWithCredentials(value.email, value.password, this.returnUrl());
          } catch (error) {
            this.notificationService.info('Account created. Sign in once more if automatic login did not finish.', 'Account ready');
            this.errorMessage.set(readHttpErrorMessage(error, 'Account created, but automatic sign in could not be completed.'));
            await this.router.navigate(['/login'], {
              queryParams: {
                returnUrl: this.returnUrl(),
              },
            });
          } finally {
            this.saving.set(false);
          }
        },
        error: (error) => {
          this.saving.set(false);
          this.errorMessage.set(readHttpErrorMessage(error, 'Account could not be created right now.'));
        },
      });
  }

  protected togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update((value) => !value);
  }

  protected showFieldError(fieldName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[fieldName];
    return this.submitAttempted() && control.invalid;
  }

  protected passwordsDoNotMatch(): boolean {
    const { password, confirmPassword } = this.form.getRawValue();
    return !!password && !!confirmPassword && password !== confirmPassword;
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
