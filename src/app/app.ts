import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastViewportComponent } from './shared/ui/toast-viewport/toast-viewport';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastViewportComponent],
  templateUrl: './app.html',
})
export class App {}
