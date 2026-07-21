import { Routes } from '@angular/router';
import { roleGuard } from './core/auth/role.guard';
import { superadminGuard } from './core/auth/superadmin.guard';
import { unsavedGuard } from './core/unsaved.guard';

export const routes: Routes = [
  { path: 'auth/login', loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'auth/boxes', loadComponent: () => import('./features/auth/box-picker.page').then(m => m.BoxPickerPage) },
  { path: 'auth/signup', loadComponent: () => import('./features/auth/signup.page').then(m => m.SignupPage) },
  { path: 'auth/start', loadComponent: () => import('./features/auth/start-box.page').then(m => m.StartBoxPage) },
  { path: 'superadmin', canActivate: [superadminGuard],
    loadComponent: () => import('./features/superadmin/console.page').then(m => m.ConsolePage) },
  { path: 'auth/check-email', loadComponent: () => import('./features/auth/check-email.page').then(m => m.CheckEmailPage) },
  { path: 'auth/verify', loadComponent: () => import('./features/auth/verify.page').then(m => m.VerifyPage) },
  { path: 'auth/forgot', loadComponent: () => import('./features/auth/forgot.page').then(m => m.ForgotPage) },
  { path: 'auth/reset', loadComponent: () => import('./features/auth/reset.page').then(m => m.ResetPage) },
  { path: 'account/security', canActivate: [roleGuard(['ATHLETE', 'COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/account/security.page').then(m => m.SecurityPage) },
  { path: 'account/email', loadComponent: () => import('./features/account/email-confirm.page').then(m => m.EmailConfirmPage) },
  {
    path: 'athlete', canActivate: [roleGuard(['ATHLETE', 'COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/athlete/athlete-shell.page').then(m => m.AthleteShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', loadComponent: () => import('./features/athlete/home.page').then(m => m.HomePage) },
      { path: 'book', loadComponent: () => import('./features/athlete/book.page').then(m => m.BookPage) },
      { path: 'wod', loadComponent: () => import('./features/athlete/wod.page').then(m => m.WodPage) },
      { path: 'progress', loadComponent: () => import('./features/athlete/progress.page').then(m => m.ProgressPage) },
      { path: 'membership', loadComponent: () => import('./features/athlete/membership.page').then(m => m.MembershipPage) },
      { path: 'board/:itemId', loadComponent: () => import('./features/performance/leaderboard.page').then(m => m.LeaderboardPage) },
      { path: 'class/:id', loadComponent: () => import('./features/athlete/class-detail.page').then(m => m.ClassDetailPage) },
      { path: 'profile/:membershipId', loadComponent: () => import('./features/athlete/athlete-profile.page').then(m => m.AthleteProfilePage) },
      // legacy paths
      { path: 'today', redirectTo: 'home' },
      { path: 'my-bookings', redirectTo: 'book' },
      { path: 'lifts', redirectTo: 'progress' },
    ],
  },
  {
    path: 'coach', canActivate: [roleGuard(['COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/coach/coach-shell.page').then(m => m.CoachShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'classes' },
      { path: 'classes', loadComponent: () => import('./features/coach/classes.page').then(m => m.CoachClassesPage) },
      { path: 'classes/:id/checkin', loadComponent: () => import('./features/coach/checkin.page').then(m => m.CheckinPage) },
      { path: 'classes/:id/run', loadComponent: () => import('./features/coach/runner.page').then(m => m.RunnerPage) },
      { path: 'classes/:id/build', canDeactivate: [unsavedGuard],
        loadComponent: () => import('./features/coach/instance-builder.page').then(m => m.InstanceBuilderPage) },
      { path: 'types', loadComponent: () => import('./features/programming/types.page').then(m => m.TypesPage) },
      { path: 'wods', loadComponent: () => import('./features/programming/wod-library.page').then(m => m.WodLibraryPage) },
      { path: 'wods/new', loadComponent: () => import('./features/programming/wod-builder.page').then(m => m.WodBuilderPage) },
      { path: 'wods/:id', loadComponent: () => import('./features/programming/wod-builder.page').then(m => m.WodBuilderPage) },
      { path: 'benchmarks', loadComponent: () => import('./features/programming/benchmark-library.page').then(m => m.BenchmarkLibraryPage) },
      // legacy
      { path: 'sessions', redirectTo: 'classes' },
      { path: 'sessions/:id/roster', redirectTo: 'classes' },
      { path: 'calendar', redirectTo: 'classes' },
    ],
  },
  {
    path: 'admin', canActivate: [roleGuard(['BOX_ADMIN'])],
    loadComponent: () => import('./features/admin/admin-shell.page').then(m => m.AdminShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/admin/dashboard.page').then(m => m.DashboardPage) },
      { path: 'members', loadComponent: () => import('./features/admin/members.page').then(m => m.MembersPage) },
      { path: 'schedule', loadComponent: () => import('./features/admin/schedule.page').then(m => m.SchedulePage) },
      { path: 'invites', loadComponent: () => import('./features/admin/invites.page').then(m => m.InvitesPage) },
      { path: 'plans', loadComponent: () => import('./features/admin/plans.page').then(m => m.PlansPage) },
      { path: 'subscriptions', loadComponent: () => import('./features/admin/subscriptions.page').then(m => m.SubscriptionsPage) },
      { path: 'stripe', loadComponent: () => import('./features/admin/box-stripe.page').then(m => m.BoxStripePage) },
      { path: 'movements', loadComponent: () => import('./features/admin/movements.page').then(m => m.MovementsPage) },
      { path: 'tvs', loadComponent: () => import('./features/admin/tvs.page').then(m => m.TvsPage) },
      { path: 'settings', loadComponent: () => import('./features/admin/settings.page').then(m => m.SettingsPage) },
    ],
  },
  { path: 'tv', loadComponent: () => import('./features/tv/tv-shell.page').then(m => m.TvShellPage) },
  { path: 'join/:token', loadComponent: () => import('./features/join/join.page').then(m => m.JoinPage) },
  // Stripe checkout's success/cancel redirect (StripeCheckoutService) is hardcoded server-side to
  // APP_URL + "/membership" — this top-level redirect (query params carry through) is what makes
  // that land in the athlete shell's real page instead of 404ing.
  { path: 'membership', pathMatch: 'full', redirectTo: 'athlete/membership' },
  { path: 'receipts/:paymentId', canActivate: [roleGuard(['ATHLETE', 'COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/receipt/receipt.page').then(m => m.ReceiptPage) },
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: '**', redirectTo: 'auth/login' },
];
