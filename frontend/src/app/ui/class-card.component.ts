import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet, formatDate } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from './avatar.component';

/**
 * Structurally identical to `features/booking/booking.service.ts`'s `Person`-shaped rows — declared
 * here rather than imported so `ui/` never depends on a feature type (CLAUDE.md `ui/` rules).
 * Pages pass their own `{name, avatarPath}` rows directly; no adapter needed.
 */
export interface CardPerson {
  name: string;
  avatarPath: string | null;
}

/**
 * The shared class card (spec §3.1, "A2 · bone ring"): full-bleed photo, title + coach on a light
 * scrim, who's-going avatar stack, a badge on the photo and a strip below it with the time range
 * and a projected action. One component behind athlete Book and coach Classes.
 *
 * The badge is OWNED by the card (`badgeLabel`/`badgeTone`), not projected — every caller needs the
 * same mono/uppercase chip with its own dark fill so it reads on any photo, and `bh-pill`'s
 * translucent fills are unreadable over one. Re-implementing that chip's markup per screen is
 * exactly the bug CLAUDE.md's "re-implementing a component's markup in a screen" rule exists for.
 * `[actions]`/`[error]` stay projected — they carry components (buttons, alerts), not text.
 */
@Component({
  selector: 'bh-class-card',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #photoBody>
      <div class="photo">
        @if (image()) {
          <img class="ph" [class.past]="tone() === 'past'" [src]="image()!" alt="" loading="lazy" />
        } @else {
          <span class="initials" aria-hidden="true">{{ initials() }}</span>
        }
        @if (badgeLabel()) {
          <span class="badge" [class.good]="badgeTone() === 'good'" [class.warn]="badgeTone() === 'warn'">{{ badgeLabel() }}</span>
        }
        <div class="txt">
          <div class="line">
            <span class="nm">{{ title() }}</span>
            @if (coach()) {
              <span class="sep" aria-hidden="true">·</span>
              <span class="coach">
                <bh-avatar [path]="coachAvatar()" [name]="coach()!" size="sm" />
                <span class="coachname">{{ coach() }}</span>
              </span>
            }
          </div>
          @if (peopleCount() === 0) {
            @if (emptyText()) { <span class="muted">{{ emptyText() }}</span> }
          } @else {
            <span class="stack" aria-hidden="true">
              @for (p of shownPeople(); track p.name + $index) {
                <bh-avatar [path]="p.avatarPath" [name]="p.name" size="sm" />
              }
              @if (extraCount() > 0) { <span class="more">+{{ extraCount() }}</span> }
            </span>
          }
        </div>
      </div>
    </ng-template>

    <article class="class-card" [attr.data-testid]="testId()">
      @if (href()) {
        <a class="body" [routerLink]="href()" [attr.aria-label]="ariaLabel()">
          <ng-container [ngTemplateOutlet]="photoBody" />
        </a>
      } @else {
        <div class="body">
          <ng-container [ngTemplateOutlet]="photoBody" />
        </div>
      }

      <div class="strip">
        <span class="when">{{ timeRange() }}</span>
        @if (suffix()) { <span class="suffix">· {{ suffix() }}</span> }
        <span class="acts"><ng-content select="[actions]" /></span>
      </div>
      <ng-content select="[error]" />
    </article>
  `,
  styles: [`
    :host { display: block; }
    .class-card { border-radius: var(--r-card); overflow: hidden; border: 1px solid var(--hairline);
      background: var(--surface); }
    .body { display: block; color: inherit; text-decoration: none; }
    /* No underline on the title (it would fight the photo for legibility) — a slight brightness
       lift on the photo is the only hover affordance. */
    a.body:hover .ph { filter: brightness(1.05); }
    a.body:hover .ph.past { filter: grayscale(.85) brightness(.78); }
    a.body:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }

    .photo { position: relative; height: 170px; background: var(--surface-2); overflow: hidden; }
    .ph { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    /* Greyscale lands on the img element only — never the badge or text sitting above it. */
    .ph.past { filter: grayscale(.85) brightness(.75); }
    /* Light scrim, not adaptive (user-ruled 2026-09-17, spec §3.1): known cost on a very bright
       photo, accepted rather than reopened. */
    .photo::after { content: ''; position: absolute; inset: 0;
      background: linear-gradient(180deg, transparent 28%, var(--scrim-card) 55%, var(--scrim-card) 100%); }
    .initials { position: absolute; top: var(--sp-2); right: var(--sp-3); z-index: 1;
      font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      color: var(--hairline); text-transform: uppercase; }
    /* The badge chip: owned by the card so every caller (Book, coach Classes, class detail) gets
       one identical treatment — mono, uppercase, its own dark fill so it reads on any photo.
       bh-pill's fills are translucent and unreadable over an image, so this is deliberately its
       own small chip rather than a reused bh-pill. */
    .badge { position: absolute; top: var(--sp-2); right: var(--sp-2); z-index: 1;
      display: inline-flex; align-items: center; height: 24px; padding: 0 var(--sp-2);
      border-radius: var(--r-full); font-family: var(--font-mono); font-size: var(--fs-meta);
      font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap;
      background: var(--scrim-text); border: 1px solid var(--hairline); color: var(--bone); }
    .badge.good { color: var(--good); border-color: var(--good); }
    .badge.warn { color: var(--warn); border-color: var(--warn); }

    .txt { position: absolute; left: var(--sp-3); right: var(--sp-3); bottom: var(--sp-3); z-index: 1;
      display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
    .line { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
    .nm { font-family: var(--font-display); font-weight: 500; font-size: var(--fs-h2);
      color: var(--bone); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      flex-shrink: 1; min-width: 0; }
    .sep { color: var(--bone-dim); flex-shrink: 0; }
    .coach { display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; max-width: 45%;
      min-width: 0; }
    .coachname { font-size: var(--fs-sm); color: var(--bone); white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }

    /* Who's going: overlapped bone-ringed avatars. Volt was asked for and declined on the design
       law (spec §3.1) — bone reads as "people", never as live/now. The ring sits on the AVATAR'S
       OWN host element: bh-avatar's internal border is emulated-encapsulated and can't be reached
       from here, so this ring is a second, deliberate outer ring rather than an override. */
    .stack { display: flex; align-items: center; }
    .stack bh-avatar { display: inline-flex; margin-left: -9px; border-radius: 50%;
      border: 2px solid var(--bone); box-sizing: content-box; }
    .stack bh-avatar:first-child { margin-left: 0; }
    .more { margin-left: var(--sp-1); height: 24px; min-width: 32px; padding: 0 var(--sp-2);
      border-radius: var(--r-full); background: var(--scrim-text); border: 1px solid var(--hairline);
      font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700; color: var(--bone);
      display: inline-flex; align-items: center; justify-content: center;
      font-variant-numeric: tabular-nums; }
    .muted { color: var(--bone-dim); font-size: var(--fs-sm); }

    /* Wrap is load-bearing, not cosmetic: .when and .suffix are nowrap and .acts is flex-shrink:0,
       so on a single line the action is pushed past the card's right edge and the card's
       overflow:hidden CLIPS it. At 200% text zoom on a 360px phone that put Book/Cancel ~100px
       outside the card — the athlete could not book at all (WCAG 1.4.4). Wrapping drops the action
       onto its own line instead; at normal sizes everything still fits on one. */
    .strip { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); min-height: 56px;
      padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3); background: var(--surface); }
    .when { font-family: var(--font-mono); font-weight: 700; font-size: var(--fs-sm);
      color: var(--bone); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .suffix { font-family: var(--font-mono); font-weight: 400; font-size: var(--fs-sm);
      color: var(--bone-dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .acts { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; margin-left: auto; }
  `],
})
export class ClassCardComponent {
  title = input.required<string>();
  image = input<string | null>(null);
  coach = input<string | null>(null);
  coachAvatar = input<string | null>(null);
  people = input<readonly CardPerson[]>([]);
  peopleCount = input(0);
  emptyText = input<string | null>(null);
  start = input.required<string>();
  end = input<string | null>(null);
  suffix = input<string | null>(null);
  href = input<string | readonly unknown[] | null>(null);
  tone = input<'default' | 'past'>('default');
  testId = input<string | null>(null);
  /** Already-localized by the caller — pages own the copy ("Booked", "Full", "Waitlist #2" all
   *  need per-caller interpolation this component has no business owning). Null renders nothing. */
  badgeLabel = input<string | null>(null);
  badgeTone = input<'neutral' | 'good' | 'warn'>('neutral');

  /** Defensive `?? []`: a frontend deployed ahead of its backend receives rows without `people`,
   *  and a crash here blanks the whole card (seen live on a stale backend container). */
  protected readonly shownPeople = computed(() => (this.people() ?? []).slice(0, 5));
  /** peopleCount minus what's actually rendered (never more than 5) — see the component spec:
   *  a `people` array longer than 5 must not make the chip undercount the athletes it hid. */
  protected readonly extraCount = computed(() => Math.max(0, this.peopleCount() - this.shownPeople().length));

  protected readonly initials = computed(() =>
    this.title().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase());

  private locale = inject(LOCALE_ID);

  private formatTime(iso: string): string {
    return formatDate(iso, 'HH:mm', this.locale);
  }

  protected readonly timeRange = computed(() => {
    const s = this.formatTime(this.start());
    const e = this.end();
    return e ? `${s}–${this.formatTime(e)}` : s;
  });

  protected readonly ariaLabel = computed(() => {
    const going = $localize`:@@classCard.going:${this.peopleCount()}:count: going`;
    const c = this.coach();
    return c
      ? $localize`:@@classCard.ariaCoach:${this.title()}:title:, ${c}:coach:, ${this.timeRange()}:time:, ${going}:going:`
      : $localize`:@@classCard.aria:${this.title()}:title:, ${this.timeRange()}:time:, ${going}:going:`;
  });
}
