import { Routes } from '@angular/router';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  { path: 'auth/login', loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'auth/boxes', loadComponent: () => import('./features/auth/box-picker.page').then(m => m.BoxPickerPage) },
  { path: 'athlete', canActivate: [roleGuard(['ATHLETE', 'COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/athlete/athlete-shell.page').then(m => m.AthleteShellPage) },
  { path: 'coach', canActivate: [roleGuard(['COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/coach/coach-shell.page').then(m => m.CoachShellPage) },
  { path: 'admin', canActivate: [roleGuard(['BOX_ADMIN'])],
    loadComponent: () => import('./features/admin/admin-shell.page').then(m => m.AdminShellPage) },
  { path: 'tv', loadComponent: () => import('./features/tv/tv-shell.page').then(m => m.TvShellPage) },
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: '**', redirectTo: 'auth/login' },
];
