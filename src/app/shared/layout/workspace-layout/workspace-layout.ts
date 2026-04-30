import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WorkspaceHeaderComponent } from '../workspace-header/workspace-header';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import { SupportChatWidgetComponent } from '../../ui/support-chat-widget/support-chat-widget';

@Component({
  selector: 'app-workspace-layout',
  imports: [RouterOutlet, WorkspaceHeaderComponent, WorkspaceSidebarComponent, SupportChatWidgetComponent],
  templateUrl: './workspace-layout.html',
  styleUrl: './workspace-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceLayoutComponent {}
