import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PublicHeaderComponent } from '../public-header/public-header';
import { SupportChatWidgetComponent } from '../../../feature/support/components/support-chat-widget/support-chat-widget';
import { FooterComponent } from '../footer/footer';

@Component({
  selector: 'app-app-shell',
  imports: [PublicHeaderComponent, FooterComponent, RouterOutlet, SupportChatWidgetComponent],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {}
