import { Routes } from '@angular/router';
import { PageNotFound } from './core/component/page-not-found/page-not-found';
import { AppShellComponent } from './shared/layout/app-shell/app-shell';
import { authRequiredGuard } from './core/guards/auth-required.guard';
import { BusinessWorkspacePage } from './features/business/pages/business-workspace';
import { HomePage } from './features/home/home';
import { OffersPage } from './features/offers/offers';

export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: '', component: HomePage },
      { path: 'offers', component: OffersPage },
      { path: 'business', component: BusinessWorkspacePage, canActivate: [authRequiredGuard] },
      { path: 'business/:id', component: BusinessWorkspacePage, canActivate: [authRequiredGuard] },
      { path: '**', component: PageNotFound },
    ],
  },
];
