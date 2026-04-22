import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FooterComponent } from '../footer/footer';
import { HeaderComponent } from '../header/header';
import { ToastViewportComponent } from '../../ui/toast-viewport/toast-viewport';

@Component({
  selector: 'app-app-shell',
  imports: [HeaderComponent, FooterComponent, RouterOutlet, ToastViewportComponent],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {}
