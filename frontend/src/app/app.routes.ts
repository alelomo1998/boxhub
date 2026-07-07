import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'auth/login', loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'auth/boxes', loadComponent: () => import('./features/auth/box-picker.page').then(m => m.BoxPickerPage) },
  { path: 'athlete', loadComponent: () => import('./features/athlete/athlete-shell.page').then(m => m.AthleteShellPage) },
  { path: 'coach', loadComponent: () => import('./features/coach/coach-shell.page').then(m => m.CoachShellPage) },
  { path: 'admin', loadComponent: () => import('./features/admin/admin-shell.page').then(m => m.AdminShellPage) },
  { path: 'tv', loadComponent: () => import('./features/tv/tv-shell.page').then(m => m.TvShellPage) },
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: '**', redirectTo: 'auth/login' },
];
