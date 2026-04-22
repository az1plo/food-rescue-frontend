import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FooterComponent } from '../footer/footer';
import { PublicHeaderComponent } from '../public-header/public-header';

@Component({
  selector: 'app-app-shell',
  imports: [PublicHeaderComponent, FooterComponent, RouterOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {}
