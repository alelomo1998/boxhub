import { Component, EventEmitter, Output, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AvatarComponent } from '../../ui/avatar.component';
import { ButtonComponent } from '../../ui/button.component';
import { AuthService } from '../../core/auth/auth.service';
import { MediaService } from '../../core/media.service';
import { HomeService, Profile } from './home.service';

/** Own profile: avatar upload, privacy toggle, theme, logout. Lives in a bh-sheet. */
@Component({
  selector: 'bh-profile-sheet',
  standalone: true,
  imports: [AvatarComponent, ButtonComponent, RouterLink],
  template: `
    @switch (state()) {
      @case ('loading') { <p class="stateline">Loading profile…</p> }
      @case ('error') { <p class="stateline err">Couldn't load your profile — try again later.</p> }
      @default {
        @if (profile(); as p) {
          <div class="head">
            <bh-avatar [path]="p.avatarPath" [name]="p.name" size="lg" />
            <div class="who">
              <span class="nm">{{ p.name }}</span>
              <label class="upload">
                <input type="file" accept="image/jpeg,image/png" (change)="onFile($event)"
                       [disabled]="uploading()" />
                {{ uploading() ? 'Uploading…' : (p.avatarPath ? 'Change photo' : 'Add photo') }}
              </label>
            </div>
          </div>
          @if (uploadError()) { <p class="err" role="alert">{{ uploadError() }}</p> }

          <label class="row">
            <span class="rl">Private profile</span>
            <span class="rh">Others see only your photo and name</span>
            <input type="checkbox" [checked]="p.isPrivate" (change)="togglePrivacy($any($event.target).checked)" />
          </label>

          <a class="row asbtn" routerLink="/account/security" data-testid="profile-security-link">
            <span class="rl">Security</span>
            <span class="rh">Password, email, sessions</span>
            <span aria-hidden="true">›</span>
          </a>

          <div class="actions">
            <bh-button variant="ghost" class="full" (click)="logout()">Log out</bh-button>
          </div>
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .stateline { color: var(--bone-dim); }
    .stateline.err, .err { color: var(--volt); font-size: var(--fs-sm); }
    .head { display: flex; align-items: center; gap: var(--sp-4); margin-bottom: var(--sp-4); }
    .who { display: flex; flex-direction: column; gap: 6px; }
    .nm { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2); text-transform: uppercase; }
    .upload { display: inline-flex; align-items: center; min-height: var(--tap); padding: 0 var(--sp-3);
      border: 1px solid var(--hairline); border-radius: var(--edge); font-size: var(--fs-sm);
      color: var(--bone); cursor: pointer; }
    .upload input { display: none; }
    .row { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "l c" "h c";
      align-items: center; column-gap: var(--sp-3); min-height: var(--tap); padding: var(--sp-2) 0;
      border-top: 1px solid var(--hairline); cursor: pointer; }
    .asbtn { background: none; border-left: none; border-right: none; border-bottom: none;
      width: 100%; text-align: left; color: var(--bone); font: inherit; text-decoration: none; }
    .rl { grid-area: l; font-weight: 600; font-size: var(--fs-body); }
    .rh { grid-area: h; color: var(--faint); font-size: var(--fs-sm); }
    .row input { grid-area: c; width: 22px; height: 22px; accent-color: var(--volt); }
    .actions { margin-top: var(--sp-4); }
    .row:focus-visible, .upload:focus-within { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
  `],
})
export class ProfileSheetComponent implements OnInit {
  @Output() avatarChanged = new EventEmitter<string | null>();

  private auth = inject(AuthService);
  private router = inject(Router);
  private media = inject(MediaService);
  private homeSvc = inject(HomeService);

  profile = signal<Profile | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');
  uploading = signal(false);
  uploadError = signal('');

  ngOnInit() {
    this.homeSvc.myProfile().subscribe({
      next: p => { this.profile.set(p); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  onFile(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadError.set('');
    this.uploading.set(true);
    this.media.upload(file).subscribe({
      next: r => this.homeSvc.setAvatar(r.path).subscribe({
        next: p => { this.uploading.set(false); this.profile.set(p); this.avatarChanged.emit(p.avatarPath); },
        error: () => { this.uploading.set(false); this.uploadError.set("Couldn't save the photo — try again."); },
      }),
      error: () => { this.uploading.set(false); this.uploadError.set('Upload failed — JPEG/PNG/WebP up to 5 MB.'); },
    });
  }

  togglePrivacy(isPrivate: boolean) {
    this.homeSvc.setPrivacy(isPrivate).subscribe({ next: p => this.profile.set(p), error: () => {} });
  }

  logout() {
    this.auth.logout().subscribe(() => this.router.navigate(['/auth/login']));
  }
}
