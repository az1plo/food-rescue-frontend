import { Routes } from '@angular/router';
import { PageNotFound } from './core/component/page-not-found/page-not-found';
import { authRequiredGuard } from './core/guards/auth-required.guard';
import { AppShellComponent } from './shared/layout/app-shell/app-shell';
import { WorkspaceLayoutComponent } from './shared/layout/workspace-layout/workspace-layout';
import { BrowseOffersPage } from './features/public/pages/browse-offers/browse-offers';
import { ForBusinessPage } from './features/public/pages/for-business/for-business';
import { HomePage } from './features/public/pages/home/home';
import { HowItWorksPage } from './features/public/pages/how-it-works/how-it-works';
import { BusinessDetailsPage } from './features/workspace/pages/business-details/business-details';
import { businessDetailsResolver } from './features/workspace/pages/business-details/business-details.resolver';
import { MyBusinessesPage } from './features/workspace/pages/my-businesses/my-businesses';

export const routes: Routes = [
  {
    path: 'workspace',
    component: WorkspaceLayoutComponent,
    canActivate: [authRequiredGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'my-businesses' },
      { path: 'my-businesses', component: MyBusinessesPage },
      { path: 'my-businesses/new', component: BusinessDetailsPage, data: { mode: 'create' } },
      {
        path: 'my-businesses/:id',
        component: BusinessDetailsPage,
        data: { mode: 'details' },
        resolve: { business: businessDetailsResolver },
      },
    ],
  },
  { path: 'offers', pathMatch: 'full', redirectTo: 'browse-offers' },
  { path: 'business/:id', pathMatch: 'full', redirectTo: 'workspace/my-businesses/:id' },
  { path: 'business', pathMatch: 'full', redirectTo: 'for-business' },
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: '', component: HomePage },
      { path: 'browse-offers', component: BrowseOffersPage },
      { path: 'how-it-works', component: HowItWorksPage },
      { path: 'for-business', component: ForBusinessPage },
      { path: '**', component: PageNotFound },
    ],
  },
];
