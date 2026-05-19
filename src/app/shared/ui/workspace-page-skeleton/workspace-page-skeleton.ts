import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type WorkspacePageSkeletonVariant =
  | 'dashboard'
  | 'list'
  | 'analytics'
  | 'detail'
  | 'catalog'
  | 'queue'
  | 'inline-panel';

@Component({
  selector: 'app-workspace-page-skeleton',
  templateUrl: './workspace-page-skeleton.html',
  styleUrl: './workspace-page-skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePageSkeletonComponent {
  readonly variant = input<WorkspacePageSkeletonVariant>('dashboard');

  protected readonly summaryIds = [1, 2, 3, 4];
  protected readonly panelIds = [1, 2, 3];
  protected readonly cardIds = [1, 2, 3];
  protected readonly queueIds = [1, 2, 3];
}
