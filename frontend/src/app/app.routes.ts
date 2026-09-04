import { Routes } from '@angular/router';
import { roleGuard } from './core/auth/role.guard';
import { superadminGuard } from './core/auth/superadmin.guard';
import { sessionGuard } from './core/auth/session.guard';
import { unsavedGuard } from './core/unsaved.guard';
import { accountIndexGuard } from './features/account/account-index.page';
import { entryGuard } from './core/auth/entry.guard';

export const routes: Routes = [
  // Unguarded on purpose — fabricated data, no API call, needs to be reachable on a real device
  // against the real CSP. Unlisted, unlinked; deletion at launch is filed in docs/BACKLOG.md.
  { path: 'dev/components', title: $localize`:@@route.dev.components:Component gallery`, loadComponent: () => import('./features/dev/dev-gallery.page').then(m => m.DevGalleryPage) },
  { path: 'auth/login', title: $localize`:@@route.auth.login:Log in`, loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  // The picker's old address. Kept as a redirect, not deleted: it is in users' history.
  { path: 'auth/boxes', redirectTo: '/gyms', pathMatch: 'full' },
  { path: 'auth/signup', title: $localize`:@@route.auth.signup:Sign up`, loadComponent: () => import('./features/auth/signup.page').then(m => m.SignupPage) },
  { path: 'auth/start', title: $localize`:@@route.auth.start:Start your box`, loadComponent: () => import('./features/auth/start-box.page').then(m => m.StartBoxPage) },
  { path: 'superadmin', title: $localize`:@@route.superadmin.console:Superadmin`, canActivate: [superadminGuard],
    loadComponent: () => import('./features/superadmin/console.page').then(m => m.ConsolePage) },
  { path: 'auth/check-email', title: $localize`:@@route.auth.checkEmail:Check your email`, loadComponent: () => import('./features/auth/check-email.page').then(m => m.CheckEmailPage) },
  { path: 'auth/verify', title: $localize`:@@route.auth.verify:Verify your email`, loadComponent: () => import('./features/auth/verify.page').then(m => m.VerifyPage) },
  { path: 'auth/forgot', title: $localize`:@@route.auth.forgot:Forgot password`, loadComponent: () => import('./features/auth/forgot.page').then(m => m.ForgotPage) },
  { path: 'auth/reset', title: $localize`:@@route.auth.reset:Reset password`, loadComponent: () => import('./features/auth/reset.page').then(m => m.ResetPage) },
  // The emailed confirmation landing. Registered BEFORE the area and deliberately UNGUARDED:
  // it is clicked from an inbox, possibly on a device that has never logged in. The path is what
  // AccountService.startEmailChange has already mailed to real inboxes — it can never move.
  { path: 'account/email', title: $localize`:@@route.account.email:Confirm email`,
    loadComponent: () => import('./features/account/email-confirm.page').then(m => m.EmailConfirmPage) },

  // The old single page. Kept as a redirect: it is in users' history and in four places here.
  { path: 'account/security', redirectTo: '/account', pathMatch: 'full' },

  { path: 'account', title: $localize`:@@route.account.area:Account`, canActivate: [sessionGuard],
    loadComponent: () => import('./features/account/account-layout.page').then(m => m.AccountLayoutPage),
    children: [
      { path: '', pathMatch: 'full', canActivate: [accountIndexGuard],
        loadComponent: () => import('./features/account/account-index.page').then(m => m.AccountIndexPage) },
      { path: 'password', title: $localize`:@@route.account.password:Password`,
        loadComponent: () => import('./features/account/password.page').then(m => m.PasswordPage) },
      { path: 'change-email', title: $localize`:@@route.account.changeEmail:Email`,
        loadComponent: () => import('./features/account/change-email.page').then(m => m.ChangeEmailPage) },
      { path: 'sessions', title: $localize`:@@route.account.sessions:Sessions`,
        loadComponent: () => import('./features/account/sessions.page').then(m => m.SessionsPage) },
      { path: 'danger', title: $localize`:@@route.account.danger:Danger zone`,
        loadComponent: () => import('./features/account/danger.page').then(m => m.DangerPage) },
    ] },
  {
    path: 'gyms', canActivate: [sessionGuard],
    loadComponent: () => import('./features/gyms/hub-shell.page').then(m => m.HubShellPage),
    children: [
      { path: '', pathMatch: 'full', title: $localize`:@@route.gyms.hub:Your gyms`,
        loadComponent: () => import('./features/gyms/gyms.page').then(m => m.GymsPage) },
      { path: 'join', title: $localize`:@@route.gyms.join:Join a gym`,
        loadComponent: () => import('./features/gyms/join.page').then(m => m.JoinGymPage) },
    ],
  },
  {
    path: 'athlete', canActivate: [roleGuard(['ATHLETE', 'COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/athlete/athlete-shell.page').then(m => m.AthleteShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', title: $localize`:@@route.athlete.home:Home`, loadComponent: () => import('./features/athlete/home.page').then(m => m.HomePage) },
      { path: 'book', title: $localize`:@@route.athlete.book:Book`, loadComponent: () => import('./features/athlete/book.page').then(m => m.BookPage) },
      { path: 'wod', title: $localize`:@@route.athlete.wod:WOD`, loadComponent: () => import('./features/athlete/wod.page').then(m => m.WodPage) },
      { path: 'progress', title: $localize`:@@route.athlete.progress:Progress`, loadComponent: () => import('./features/athlete/progress.page').then(m => m.ProgressPage) },
      { path: 'membership', title: $localize`:@@route.athlete.membership:Membership`, loadComponent: () => import('./features/athlete/membership.page').then(m => m.MembershipPage) },
      { path: 'messages', title: $localize`:@@route.athlete.messages:Messages`, loadComponent: () => import('./features/messaging/conversations.page').then(m => m.ConversationsPage) },
      { path: 'notifications', title: $localize`:@@route.notifications:Notifications`,
        loadComponent: () => import('./features/notifications/notifications.page').then(m => m.NotificationsPage) },
      { path: 'board/:itemId', title: $localize`:@@route.athlete.board:Leaderboard`, loadComponent: () => import('./features/performance/leaderboard.page').then(m => m.LeaderboardPage) },
      { path: 'class/:id', title: $localize`:@@route.athlete.class:Class`, loadComponent: () => import('./features/athlete/class-detail.page').then(m => m.ClassDetailPage) },
      { path: 'profile/:membershipId', title: $localize`:@@route.athlete.profile:Profile`, loadComponent: () => import('./features/athlete/athlete-profile.page').then(m => m.AthleteProfilePage) },
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
      { path: 'classes', title: $localize`:@@route.coach.classes:Classes`, loadComponent: () => import('./features/coach/classes.page').then(m => m.CoachClassesPage) },
      { path: 'classes/:id/checkin', title: $localize`:@@route.coach.checkin:Check-in`, loadComponent: () => import('./features/coach/checkin.page').then(m => m.CheckinPage) },
      { path: 'classes/:id/run', title: $localize`:@@route.coach.run:Run class`, loadComponent: () => import('./features/coach/runner.page').then(m => m.RunnerPage) },
      { path: 'classes/:id/build', title: $localize`:@@route.coach.build:Build class`, canDeactivate: [unsavedGuard],
        loadComponent: () => import('./features/coach/instance-builder.page').then(m => m.InstanceBuilderPage) },
      { path: 'types', title: $localize`:@@route.coach.types:Class types`, loadComponent: () => import('./features/programming/types.page').then(m => m.TypesPage) },
      { path: 'wods', title: $localize`:@@route.coach.wods:WOD library`, loadComponent: () => import('./features/programming/wod-library.page').then(m => m.WodLibraryPage) },
      { path: 'wods/new', title: $localize`:@@route.coach.wodNew:New WOD`, loadComponent: () => import('./features/programming/wod-builder.page').then(m => m.WodBuilderPage) },
      { path: 'wods/:id', title: $localize`:@@route.coach.wodEdit:Edit WOD`, loadComponent: () => import('./features/programming/wod-builder.page').then(m => m.WodBuilderPage) },
      { path: 'benchmarks', title: $localize`:@@route.coach.benchmarks:Benchmarks`, loadComponent: () => import('./features/programming/benchmark-library.page').then(m => m.BenchmarkLibraryPage) },
      { path: 'inbox', title: $localize`:@@route.coach.inbox:Inbox`, loadComponent: () => import('./features/messaging/conversations.page').then(m => m.ConversationsPage) },
      { path: 'announcements', title: $localize`:@@route.coach.announcements:Announcements`, loadComponent: () => import('./features/messaging/announcements.page').then(m => m.AnnouncementsPage) },
      { path: 'notifications', title: $localize`:@@route.notifications:Notifications`,
        loadComponent: () => import('./features/notifications/notifications.page').then(m => m.NotificationsPage) },
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
      { path: 'dashboard', title: $localize`:@@route.admin.dashboard:Dashboard`, loadComponent: () => import('./features/admin/dashboard.page').then(m => m.DashboardPage) },
      { path: 'members', title: $localize`:@@route.admin.members:Members`, loadComponent: () => import('./features/admin/members.page').then(m => m.MembersPage) },
      { path: 'schedule', title: $localize`:@@route.admin.schedule:Schedule`, loadComponent: () => import('./features/admin/schedule.page').then(m => m.SchedulePage) },
      { path: 'invites', title: $localize`:@@route.admin.invites:Invites`, loadComponent: () => import('./features/admin/invites.page').then(m => m.InvitesPage) },
      { path: 'plans', title: $localize`:@@route.admin.plans:Plans`, loadComponent: () => import('./features/admin/plans.page').then(m => m.PlansPage) },
      { path: 'subscriptions', title: $localize`:@@route.admin.subscriptions:Subscriptions`, loadComponent: () => import('./features/admin/subscriptions.page').then(m => m.SubscriptionsPage) },
      { path: 'stripe', title: $localize`:@@route.admin.stripe:Payments`, loadComponent: () => import('./features/admin/box-stripe.page').then(m => m.BoxStripePage) },
      { path: 'movements', title: $localize`:@@route.admin.movements:Movements`, loadComponent: () => import('./features/admin/movements.page').then(m => m.MovementsPage) },
      { path: 'tvs', title: $localize`:@@route.admin.tvs:TVs`, loadComponent: () => import('./features/admin/tvs.page').then(m => m.TvsPage) },
      { path: 'settings', title: $localize`:@@route.admin.settings:Settings`, loadComponent: () => import('./features/admin/settings.page').then(m => m.SettingsPage) },
      { path: 'messages', title: $localize`:@@route.admin.messages:Messages`, loadComponent: () => import('./features/messaging/conversations.page').then(m => m.ConversationsPage) },
      { path: 'announcements', title: $localize`:@@route.admin.announcements:Announcements`, loadComponent: () => import('./features/messaging/announcements.page').then(m => m.AnnouncementsPage) },
      { path: 'notifications', title: $localize`:@@route.notifications:Notifications`,
        loadComponent: () => import('./features/notifications/notifications.page').then(m => m.NotificationsPage) },
    ],
  },
  { path: 'tv', title: $localize`:@@route.tv.board:Board`, loadComponent: () => import('./features/tv/tv-shell.page').then(m => m.TvShellPage) },
  { path: 'join/:token', title: $localize`:@@route.join.invite:Join`, loadComponent: () => import('./features/join/join.page').then(m => m.JoinPage) },
  // Stripe checkout's success/cancel redirect (StripeCheckoutService) is hardcoded server-side to
  // APP_URL + "/membership" — this top-level redirect (query params carry through) is what makes
  // that land in the athlete shell's real page instead of 404ing.
  { path: 'membership', pathMatch: 'full', redirectTo: 'athlete/membership' },
  { path: 'receipts/:paymentId', title: $localize`:@@route.receipt.view:Receipt`, canActivate: [roleGuard(['ATHLETE', 'COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/receipt/receipt.page').then(m => m.ReceiptPage) },
  // `children: []` because the guard always returns a UrlTree — these paths have no screen.
  { path: '', pathMatch: 'full', canActivate: [entryGuard], children: [] },
  { path: '**', canActivate: [entryGuard], children: [] },
];
