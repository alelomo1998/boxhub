/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { initLocale } from './app/core/i18n/locale';

// English is the only locale that ships (M13a i18n infra) — no locale data to register, no
// catalog to load, so this is a no-op today. It runs the same call path a resolved user/box
// locale will go through once the locale-switcher UI lands. See app/core/i18n/locale.ts.
initLocale();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
