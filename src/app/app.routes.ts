import { Routes } from '@angular/router';
import { adminRequiredGuard } from './core/guards/admin-required.guard';
import { PageNotFound } from './core/component/page-not-found/page-not-found';
import { authRequiredGuard } from './core/guards/auth-required.guard';
import { AppShellComponent } from './shared/layout/app-shell/app-shell';
import { BusinessAnalyticsPage } from './feature/business/pages/business-analytics/business-analytics';
import { WorkspaceHomeRedirectPage } from './shared/layout/workspace-home-redirect/workspace-home-redirect';
import { WorkspaceAnalyticsRedirectPage } from './shared/layout/workspace-analytics-redirect/workspace-analytics-redirect';
import { WorkspaceLayoutComponent } from './shared/layout/workspace-layout/workspace-layout';
import { WorkspaceOffersRedirectPage } from './shared/layout/workspace-offers-redirect/workspace-offers-redirect';
import { WorkspaceReservationsRedirectPage } from './shared/layout/workspace-reservations-redirect/workspace-reservations-redirect';
import { WorkspaceSettingsRedirectPage } from './shared/layout/workspace-settings-redirect/workspace-settings-redirect';
import { AdminBusinessApprovalsPage } from './feature/business/pages/admin-business-approvals/admin-business-approvals';
import { ForBusinessPage } from './feature/business/pages/for-business/for-business';
import { BusinessDetailsPage } from './feature/business/pages/business-details/business-details';
import { businessDetailsResolver } from './feature/business/pages/business-details/business-details.resolver';
import { MyBusinessesPage } from './feature/business/pages/my-businesses/my-businesses';
import { WorkspaceDashboardPage } from './feature/business/pages/workspace-dashboard/workspace-dashboard';
import { HomePage } from './feature/home/pages/home/home';
import { HowItWorksPage } from './feature/info/pages/how-it-works/how-it-works';
import { AuthCallbackPage } from './feature/auth/pages/auth-callback/auth-callback';
import { LoginPage } from './feature/auth/pages/login/login';
import { RegisterPage } from './feature/auth/pages/register/register';
import { BusinessReservationsPage } from './feature/offer/pages/business-reservations/business-reservations';
import { BusinessOffersPage } from './feature/offer/pages/business-offers/business-offers';
import { BrowseOffersPage } from './feature/offer/pages/browse-offers/browse-offers';
import { WorkspaceReservationsPage } from './feature/offer/pages/workspace-reservations/workspace-reservations';

export const routes: Routes = [
  {
    path: 'workspace',
    component: WorkspaceLayoutComponent,
    canActivate: [authRequiredGuard],
    children: [
      { path: '', pathMatch: 'full', component: WorkspaceHomeRedirectPage },
      { path: 'dashboard', component: WorkspaceDashboardPage },
      { path: 'offers', component: WorkspaceOffersRedirectPage },
      { path: 'analytics', component: WorkspaceAnalyticsRedirectPage },
      { path: 'reservations', component: WorkspaceReservationsRedirectPage },
      { path: 'settings', component: WorkspaceSettingsRedirectPage },
      { path: 'my-businesses', component: MyBusinessesPage },
      { path: 'my-businesses/new', component: BusinessDetailsPage, data: { mode: 'create' } },
      {
        path: 'my-businesses/:id/analytics',
        component: BusinessAnalyticsPage,
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'my-businesses/:id/reservations',
        component: BusinessReservationsPage,
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'my-businesses/:id/offers',
        component: BusinessOffersPage,
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'my-businesses/:id/settings',
        component: BusinessDetailsPage,
        data: { mode: 'settings' },
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'my-businesses/:id',
        component: BusinessDetailsPage,
        data: { mode: 'details' },
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'admin/business-approvals',
        component: AdminBusinessApprovalsPage,
        canActivate: [adminRequiredGuard],
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
      { path: 'auth/callback', component: AuthCallbackPage },
      { path: 'login', component: LoginPage },
      { path: 'register', component: RegisterPage },
      { path: 'browse-offers', component: BrowseOffersPage },
      { path: 'my-reservations', component: WorkspaceReservationsPage, canActivate: [authRequiredGuard] },
      { path: 'how-it-works', component: HowItWorksPage },
      { path: 'for-business', component: ForBusinessPage },
      { path: '**', component: PageNotFound },
    ],
  },
];
