import { Routes } from '@angular/router';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  { path: 'auth/login', loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'auth/boxes', loadComponent: () => import('./features/auth/box-picker.page').then(m => m.BoxPickerPage) },
  {
    path: 'athlete', canActivate: [roleGuard(['ATHLETE', 'COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/athlete/athlete-shell.page').then(m => m.AthleteShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'wod' },
      { path: 'wod', loadComponent: () => import('./features/athlete/wod-board.page').then(m => m.WodBoardPage) },
      { path: 'book', loadComponent: () => import('./features/athlete/book.page').then(m => m.BookPage) },
      { path: 'my-bookings', loadComponent: () => import('./features/athlete/my-bookings.page').then(m => m.MyBookingsPage) },
    ],
  },
  {
    path: 'coach', canActivate: [roleGuard(['COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/coach/coach-shell.page').then(m => m.CoachShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'sessions' },
      { path: 'sessions', loadComponent: () => import('./features/coach/sessions.page').then(m => m.CoachSessionsPage) },
      { path: 'sessions/:id/roster', loadComponent: () => import('./features/coach/roster.page').then(m => m.RosterPage) },
      { path: 'calendar', loadComponent: () => import('./features/programming/program-calendar.page').then(m => m.ProgramCalendarPage) },
      { path: 'wods', loadComponent: () => import('./features/programming/wod-library.page').then(m => m.WodLibraryPage) },
      { path: 'wods/new', loadComponent: () => import('./features/programming/wod-builder.page').then(m => m.WodBuilderPage) },
      { path: 'wods/:id', loadComponent: () => import('./features/programming/wod-builder.page').then(m => m.WodBuilderPage) },
      { path: 'benchmarks', loadComponent: () => import('./features/programming/benchmark-library.page').then(m => m.BenchmarkLibraryPage) },
    ],
  },
  {
    path: 'admin', canActivate: [roleGuard(['BOX_ADMIN'])],
    loadComponent: () => import('./features/admin/admin-shell.page').then(m => m.AdminShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'members' },
      { path: 'members', loadComponent: () => import('./features/admin/members.page').then(m => m.MembersPage) },
      { path: 'schedule', loadComponent: () => import('./features/admin/schedule.page').then(m => m.SchedulePage) },
      { path: 'invites', loadComponent: () => import('./features/admin/invites.page').then(m => m.InvitesPage) },
      { path: 'plans', loadComponent: () => import('./features/admin/plans.page').then(m => m.PlansPage) },
      { path: 'tracks', loadComponent: () => import('./features/admin/tracks.page').then(m => m.TracksPage) },
      { path: 'movements', loadComponent: () => import('./features/admin/movements.page').then(m => m.MovementsPage) },
      { path: 'settings', loadComponent: () => import('./features/admin/settings.page').then(m => m.SettingsPage) },
    ],
  },
  { path: 'tv', loadComponent: () => import('./features/tv/tv-shell.page').then(m => m.TvShellPage) },
  { path: 'join/:token', loadComponent: () => import('./features/join/join.page').then(m => m.JoinPage) },
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: '**', redirectTo: 'auth/login' },
];
