import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  private readonly userService = inject(UserService);

  protected readonly year = new Date().getFullYear();
  protected readonly user = this.userService.getUser();

  protected login(): void {
    void this.userService.login('/');
  }
}
