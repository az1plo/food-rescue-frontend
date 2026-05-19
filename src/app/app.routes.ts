import { Routes } from '@angular/router';
import { adminRequiredGuard } from './core/guards/admin-required.guard';
import { AppShellComponent } from './core/layout/app-shell/app-shell';
import { PageNotFound } from './core/component/page-not-found/page-not-found';
import { authRequiredGuard } from './core/guards/auth-required.guard';
import { ownerWorkspaceRequiredGuard } from './core/guards/owner-workspace-required.guard';
import { BusinessAnalyticsPage } from './feature/business/pages/business-analytics/business-analytics';
import { WorkspaceHomeRedirectPage } from './feature/workspace/pages/workspace-home-redirect/workspace-home-redirect';
import { WorkspaceAnalyticsRedirectPage } from './feature/workspace/pages/workspace-analytics-redirect/workspace-analytics-redirect';
import { WorkspaceLayoutComponent } from './feature/workspace/layout/workspace-layout/workspace-layout';
import { WorkspaceOffersRedirectPage } from './feature/workspace/pages/workspace-offers-redirect/workspace-offers-redirect';
import { WorkspaceReservationsRedirectPage } from './feature/workspace/pages/workspace-reservations-redirect/workspace-reservations-redirect';
import { WorkspaceSettingsRedirectPage } from './feature/workspace/pages/workspace-settings-redirect/workspace-settings-redirect';
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
import { BusinessOffersPage } from './feature/offer/pages/business-offers/business-offers';
import { BrowseOffersPage } from './feature/offer/pages/browse-offers/browse-offers';
import { CartPage } from './feature/order/pages/cart/cart';
import { OfferDetailsPage } from './feature/offer/pages/offer-details/offer-details';
import { BusinessReservationsPage } from './feature/order/pages/business-reservations/business-reservations';
import { WorkspaceReservationsPage } from './feature/order/pages/my-pickups/my-pickups';

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
      { path: 'orders', component: WorkspaceReservationsRedirectPage },
      { path: 'reservations', pathMatch: 'full', redirectTo: 'orders' },
      { path: 'settings', component: WorkspaceSettingsRedirectPage },
      { path: 'my-businesses', component: MyBusinessesPage, canActivate: [ownerWorkspaceRequiredGuard] },
      { path: 'my-businesses/new', component: BusinessDetailsPage, data: { mode: 'create' }, canActivate: [ownerWorkspaceRequiredGuard] },
      {
        path: 'my-businesses/:id/analytics',
        component: BusinessAnalyticsPage,
        canActivate: [ownerWorkspaceRequiredGuard],
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'my-businesses/:id/orders',
        component: BusinessReservationsPage,
        canActivate: [ownerWorkspaceRequiredGuard],
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'my-businesses/:id/reservations',
        component: BusinessReservationsPage,
        canActivate: [ownerWorkspaceRequiredGuard],
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'my-businesses/:id/offers',
        component: BusinessOffersPage,
        canActivate: [ownerWorkspaceRequiredGuard],
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'my-businesses/:id/settings',
        component: BusinessDetailsPage,
        data: { mode: 'settings' },
        canActivate: [ownerWorkspaceRequiredGuard],
        resolve: { business: businessDetailsResolver },
      },
      {
        path: 'my-businesses/:id',
        component: BusinessDetailsPage,
        data: { mode: 'details' },
        canActivate: [ownerWorkspaceRequiredGuard],
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
      { path: 'cart', component: CartPage },
      { path: 'browse-offers/:id', component: OfferDetailsPage },
      { path: 'browse-offers', component: BrowseOffersPage },
      { path: 'my-pickups', component: WorkspaceReservationsPage, canActivate: [authRequiredGuard] },
      { path: 'my-reservations', pathMatch: 'full', redirectTo: 'my-pickups' },
      { path: 'how-it-works', component: HowItWorksPage },
      { path: 'for-business', component: ForBusinessPage },
      { path: '**', component: PageNotFound },
    ],
  },
];
