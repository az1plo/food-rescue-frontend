import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';

type CircleIconSize = 'sm' | 'md' | 'lg';
type CircleIconTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

@Component({
  selector: 'app-circle-icon',
  imports: [FontAwesomeModule],
  templateUrl: './circle-icon.html',
  styleUrl: './circle-icon.scss',
  host: {
    class: 'circle-icon',
    '[attr.data-size]': 'size()',
    '[attr.data-tone]': 'tone()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CircleIconComponent {
  readonly icon = input.required<IconDefinition>();
  readonly size = input<CircleIconSize>('md');
  readonly tone = input<CircleIconTone>('brand');
}
