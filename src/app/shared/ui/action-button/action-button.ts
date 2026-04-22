import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';

type ActionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ActionButtonIconPosition = 'start' | 'end';
type ActionButtonType = 'button' | 'submit' | 'reset';
type ActionButtonRoute = string | readonly (string | number)[] | null;

@Component({
  selector: 'app-action-button',
  imports: [RouterLink, FontAwesomeModule],
  templateUrl: './action-button.html',
  styleUrl: './action-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionButtonComponent {
  readonly label = input.required<string>();
  readonly icon = input<IconDefinition | null>(null);
  readonly route = input<ActionButtonRoute>(null);
  readonly variant = input<ActionButtonVariant>('primary');
  readonly iconPosition = input<ActionButtonIconPosition>('end');
  readonly type = input<ActionButtonType>('button');
  readonly disabled = input(false);
  readonly extraClass = input('');
  readonly pressed = output<MouseEvent>();

  protected readonly className = computed(() =>
    ['button', `button--${this.variant()}`, 'action-button', this.extraClass().trim()].filter(Boolean).join(' '),
  );

  protected handleClick(event: MouseEvent): void {
    this.pressed.emit(event);
  }
}
