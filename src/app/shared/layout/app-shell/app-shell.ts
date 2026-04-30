import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FooterComponent } from '../footer/footer';
import { PublicHeaderComponent } from '../public-header/public-header';
import { SupportChatWidgetComponent } from '../../ui/support-chat-widget/support-chat-widget';

@Component({
  selector: 'app-app-shell',
  imports: [PublicHeaderComponent, FooterComponent, RouterOutlet, SupportChatWidgetComponent],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {}
