import { Routes } from '@angular/router';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  { path: 'auth/login', loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'auth/boxes', loadComponent: () => import('./features/auth/box-picker.page').then(m => m.BoxPickerPage) },
  { path: 'athlete', canActivate: [roleGuard(['ATHLETE', 'COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/athlete/athlete-shell.page').then(m => m.AthleteShellPage) },
  { path: 'coach', canActivate: [roleGuard(['COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/coach/coach-shell.page').then(m => m.CoachShellPage) },
  {
    path: 'admin', canActivate: [roleGuard(['BOX_ADMIN'])],
    loadComponent: () => import('./features/admin/admin-shell.page').then(m => m.AdminShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'members' },
      { path: 'members', loadComponent: () => import('./features/admin/members.page').then(m => m.MembersPage) },
      { path: 'invites', loadComponent: () => import('./features/admin/invites.page').then(m => m.InvitesPage) },
      { path: 'plans', loadComponent: () => import('./features/admin/plans.page').then(m => m.PlansPage) },
      { path: 'settings', loadComponent: () => import('./features/admin/settings.page').then(m => m.SettingsPage) },
    ],
  },
  { path: 'tv', loadComponent: () => import('./features/tv/tv-shell.page').then(m => m.TvShellPage) },
  { path: 'join/:token', loadComponent: () => import('./features/join/join.page').then(m => m.JoinPage) },
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: '**', redirectTo: 'auth/login' },
];
