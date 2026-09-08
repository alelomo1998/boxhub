import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../../ui/button.component';
import { AlertComponent } from '../../ui/alert.component';
import { SegmentedComponent, SegOption } from '../../ui/segmented.component';
import { SortableListComponent } from '../../ui/sortable-list.component';
import { SheetComponent } from '../../ui/sheet.component';
import { PickSheetComponent, PickRow, PickResult } from './pick-sheet.component';
import {
  ProgrammingService, MACROS, TIMING_PRESETS, TEAM_SHARES,
  WodBlock, WodLine, WodScale, WodSegment, WodInput,
} from './programming.service';

/** The server rejects a third level with BLOCK_DEPTH, so the UI must never offer one. */
const MAX_BLOCK_DEPTH = 2;
/** Spec 5A: a line may carry alternatives, but a wall of them stops being a prescription. */
const MAX_SCALES_PER_LINE = 6;

/** What each preset seeds. A preset SEEDS and never constrains: edits afterwards leave the name. */
const PRESET_SEEDS: Record<string, { rounds: number; segments: WodSegment[] }> = {
  FOR_TIME: { rounds: 1, segments: [{ seconds: 0, kind: 'WORK' }] },
  AMRAP: { rounds: 1, segments: [{ seconds: 1200, kind: 'WORK' }] },
  EMOM: { rounds: 12, segments: [{ seconds: 60, kind: 'WORK' }] },
  TABATA: { rounds: 8, segments: [{ seconds: 20, kind: 'WORK' }, { seconds: 10, kind: 'REST' }] },
  INTERVAL: { rounds: 5, segments: [{ seconds: 60, kind: 'WORK' }, { seconds: 60, kind: 'REST' }] },
};

const MACRO_LABELS: Record<string, string> = {
  WARMUP: $localize`:@@piece.macro.warmup:Warm-up`,
  STRENGTH: $localize`:@@piece.macro.strength:Strength`,
  GYMNASTIC: $localize`:@@piece.macro.gymnastic:Gymnastic`,
  WORKOUT: $localize`:@@piece.macro.workout:Workout`,
};

const PRESET_LABELS: Record<string, string> = {
  FOR_TIME: $localize`:@@piece.preset.forTime:For time`,
  AMRAP: $localize`:@@piece.preset.amrap:AMRAP`,
  EMOM: $localize`:@@piece.preset.emom:EMOM`,
  TABATA: $localize`:@@piece.preset.tabata:Tabata`,
  INTERVAL: $localize`:@@piece.preset.interval:Interval`,
};

const SHARE_LABELS: Record<string, string> = {
  TOGETHER: $localize`:@@piece.share.together:Together`,
  SPLIT: $localize`:@@piece.share.split:Split`,
  RELAY: $localize`:@@piece.share.relay:Relay`,
};

/** Which line a movement pick is destined for. Null means the sheet is shut. */
type PickTarget = { block: number; line: number; scale: number | null };

/**
 * The piece editor — one component behind two entry points (spec 6.2, 6.3).
 *
 * Tour decision 3: checking a WOD, creating one and building a class are ONE editor. With a session
 * in the route it edits a piece of that class; without one it edits a library wod directly and
 * hides "save to library", because a standalone WOD already IS a library row.
 *
 * It reads and writes macro and timingPreset and never sends wodType. That absence is the whole
 * CIRCUIT/CUSTOM/SKILL fix: those three were type values with no macro, so reopening one landed on
 * a blank select and silently retyped the piece on save.
 *
 * The builder is on the hero list (user-ruled 2026-09-08): a coach writing the workout is writing
 * the WOD board, so the piece gets the same expressive treatment being authored as being read.
 * Volt therefore lands on exactly one thing here -- the macro chip, which answers "what IS this
 * piece" -- and every control (inputs, add and remove affordances, the save) stays bone.
 */
@Component({
  selector: 'bh-piece-editor',
  standalone: true,
  imports: [
    ButtonComponent, AlertComponent, SegmentedComponent,
    SortableListComponent, PickSheetComponent, SheetComponent,
  ],
  template: `
    <form class="page" (submit)="submit($event)" novalidate data-testid="piece-form">
      @if (state() === 'loading') {
        <p class="muted" data-testid="piece-loading" i18n="@@piece.loading">Loading the piece…</p>
      } @else if (state() === 'error') {
        <div data-testid="piece-error">
          <bh-alert tone="danger" i18n="@@piece.error">That piece could not be loaded.</bh-alert>
          <bh-button variant="ghost" (click)="reload()" testId="piece-retry">
            <span i18n="@@piece.retry">Try again</span>
          </bh-button>
        </div>
      } @else {
        <header class="head">
          <input class="title-input" [value]="title()" (input)="setTitle($any($event.target).value)"
                 placeholder="Untitled piece" i18n-placeholder="@@piece.title.placeholder"
                 aria-label="Title" i18n-aria-label="@@piece.title.label"
                 data-testid="piece-title" />
          @if (titleError()) {
            <span class="title-err" role="alert">{{ titleError() }}</span>
          }
          @if (timingSummary()) {
            <p class="timing-line">{{ timingSummary() }}</p>
          }

          <div class="meta-strip">
            <button type="button" class="chip volt" (click)="openSheet.set('macro')" data-testid="meta-macro">
              <span class="chip-k" i18n="@@piece.macro.chipLabel">WHAT</span>
              <span class="chip-v">{{ metaMacroLabel() }}</span>
            </button>
            <button type="button" class="chip" (click)="openSheet.set('timing')" data-testid="meta-timing">
              <span class="chip-k" i18n="@@piece.timing.chipLabel">HOW</span>
              <span class="chip-v">{{ metaPresetLabel() }}</span>
            </button>
            <button type="button" class="chip" (click)="openSheet.set('score')" data-testid="meta-score">
              <span class="chip-k" i18n="@@piece.score.chipLabel">SCORE</span>
              <span class="chip-v">{{ metaScoreLabel() }}</span>
            </button>
            <button type="button" class="chip" (click)="openSheet.set('team')" data-testid="meta-team">
              <span class="chip-k" i18n="@@piece.team.chipLabel">WHO</span>
              <span class="chip-v">{{ metaTeamLabel() }}</span>
            </button>
          </div>
        </header>

        <section class="work">
          <h2 class="eyebrow" i18n="@@piece.blocks.heading">THE WORK</h2>

          @if (blocks().length === 0) {
            <p class="muted" data-testid="piece-empty" i18n="@@piece.blocks.empty">
              Nothing prescribed yet. Add a block to start writing the piece.
            </p>
          } @else {
            <bh-sortable-list [items]="blocks()" [itemLabel]="blockLabeller"
                              label="Blocks" i18n-label="@@piece.blocks.aria"
                              handleAlign="top"
                              (reordered)="moveBlock($event)">
              <ng-template let-b let-bi="index">
                <div class="block" [attr.data-testid]="'block-' + bi">
                  <div class="brow">
                    <input class="blabel" [value]="b.label ?? ''"
                           (input)="setBlockLabel(bi, $any($event.target).value)"
                           placeholder="Block name" i18n-placeholder="@@piece.block.namePlaceholder"
                           [attr.aria-label]="blockNameLabel(bi)" />
                    <button type="button" class="mini" (click)="removeBlock(bi)"
                            [attr.aria-label]="removeBlockLabel(bi)">&#x2715;</button>
                  </div>

                  @for (l of b.lines ?? []; track $index; let li = $index) {
                    <div class="lrow" [attr.data-testid]="'line-' + bi + '-' + li">
                      <button type="button" class="mv" (click)="openPick(bi, li, null)"
                              [attr.data-testid]="'line-movement-' + bi + '-' + li">
                        @if (l.text) {
                          <span>{{ l.text }}</span>
                        } @else {
                          <span class="ph" i18n="@@piece.line.choose">Choose a movement</span>
                        }
                      </button>
                      <input class="in sm r-reps" [value]="l.reps ?? ''"
                             (input)="setLine(bi, li, { reps: $any($event.target).value })"
                             placeholder="reps" i18n-placeholder="@@piece.line.reps"
                             [attr.aria-label]="repsLabel(bi, li)" />
                      <input class="in sm r-load" [value]="l.load ?? ''"
                             (input)="setLine(bi, li, { load: $any($event.target).value })"
                             placeholder="load" i18n-placeholder="@@piece.line.load"
                             [attr.aria-label]="loadLabel(bi, li)" />
                      <button type="button" class="mini r-rm" (click)="removeLine(bi, li)"
                              [attr.aria-label]="removeLineLabel(bi, li)">&#x2715;</button>
                    </div>

                    @for (sc of scalesOf(bi, li); track $index; let si = $index) {
                      <div class="srow" [attr.data-testid]="'scale-row-' + bi + '-' + li + '-' + si">
                        <span class="arrow" aria-hidden="true">&#x21B3;</span>
                        <button type="button" class="mv" (click)="openPick(bi, li, si)"
                                [attr.data-testid]="'scale-movement-' + bi + '-' + li + '-' + si">
                          @if (sc.text) {
                            <span>{{ sc.text }}</span>
                          } @else {
                            <span class="ph" i18n="@@piece.scale.choose">Choose a scaling option</span>
                          }
                        </button>
                        <input class="in sm r-reps" [value]="sc.reps ?? ''"
                               (input)="setScale(bi, li, si, { reps: $any($event.target).value })"
                               placeholder="reps" i18n-placeholder="@@piece.scale.reps"
                               [attr.aria-label]="scaleRepsLabel(bi, li, si)" />
                        <button type="button" class="mini r-rm" (click)="removeScale(bi, li, si)"
                                [attr.aria-label]="removeScaleLabel(bi, li, si)">&#x2715;</button>
                      </div>
                    }

                    @if (canAddScale(bi, li)) {
                      <button type="button" class="add sub" (click)="addScale(bi, li)"
                              [attr.data-testid]="'add-scale-' + bi + '-' + li">
                        <span i18n="@@piece.scale.add">+ scaling option</span>
                      </button>
                    }
                  }

                  @for (sb of b.blocks ?? []; track $index; let sbi = $index) {
                    <div class="sub-block" [attr.data-testid]="'sub-block-' + bi + '-' + sbi">
                      <div class="brow">
                        <input class="blabel sub" [value]="sb.label ?? ''"
                               (input)="setSubBlockLabel(bi, sbi, $any($event.target).value)"
                               placeholder="Part name" i18n-placeholder="@@piece.subBlock.namePlaceholder"
                               [attr.aria-label]="subBlockNameLabel(bi, sbi)" />
                        <button type="button" class="mini" (click)="removeSubBlock(bi, sbi)"
                                [attr.aria-label]="removeSubBlockLabel(bi, sbi)">&#x2715;</button>
                      </div>
                      <!-- Depth 2 is the floor: canAddSubBlock is false here, so no control is
                           rendered. An affordance that produces a 400 is a defect, not a guard. -->
                    </div>
                  }

                  <div class="badds">
                    <button type="button" class="add" (click)="addLine(bi)"
                            [attr.data-testid]="'add-line-' + bi">
                      <span i18n="@@piece.line.add">+ line</span>
                    </button>
                    @if (canAddSubBlock(bi)) {
                      <button type="button" class="add" (click)="addSubBlock(bi)"
                              [attr.data-testid]="'add-sub-block-' + bi">
                        <span i18n="@@piece.subBlock.add">+ part</span>
                      </button>
                    }
                  </div>
                </div>
              </ng-template>
            </bh-sortable-list>
          }

          <bh-button variant="ghost" size="sm" (click)="addBlock()" testId="piece-add-block">
            <span i18n="@@piece.block.add">+ block</span>
          </bh-button>
        </section>

        <footer class="foot">
          @if (!standalone()) {
            <label class="check" data-testid="save-to-library">
              <input type="checkbox" [checked]="saveToLibrary()"
                     (change)="saveToLibrary.set($any($event.target).checked)" />
              <span i18n="@@piece.saveToLibrary">Also save this to the library</span>
            </label>
          }

          @if (formError()) {
            <bh-alert tone="danger" data-testid="piece-save-error">{{ formError() }}</bh-alert>
          }

          <bh-button type="submit" variant="strong" size="lg" class="full"
                     [loading]="pending()" testId="piece-save">
            @if (pending()) {
              <span i18n="@@piece.save.pending">Saving…</span>
            } @else {
              <span i18n="@@piece.save.default">Save piece</span>
            }
          </bh-button>
        </footer>
      }
    </form>

    <bh-sheet [open]="openSheet() === 'macro'" title="What it is" i18n-title="@@piece.macro.sheetTitle"
              label="What it is" i18n-label="@@piece.macro.aria" (closed)="openSheet.set(null)">
      <bh-segmented [options]="macroOptions" [(value)]="macro" tone="bone" [wrap]="true"
                    label="What it is" i18n-label="@@piece.macro.aria" />
    </bh-sheet>

    <bh-sheet [open]="openSheet() === 'timing'" title="How it runs" i18n-title="@@piece.timing.sheetTitle"
              label="How it runs" i18n-label="@@piece.timing.aria" (closed)="openSheet.set(null)">
      <bh-segmented [options]="presetOptions" [value]="timingPreset() ?? ''"
                    (valueChange)="pickPreset($event)" tone="bone" [wrap]="true"
                    label="How it runs" i18n-label="@@piece.timing.aria" />

      @if (segments().length) {
        <ul class="segs">
          @for (s of segments(); track $index) {
            <li class="seg-row" [attr.data-testid]="'segment-' + $index">
              <input class="num" type="number" min="0" inputmode="numeric"
                     [value]="s.seconds"
                     (change)="updateSegment($index, { seconds: +$any($event.target).value, kind: s.kind, label: s.label })"
                     [attr.aria-label]="secondsLabel($index)" />
              <span class="unit" i18n="@@piece.segment.seconds">sec</span>
              <button type="button" class="kind" (click)="toggleKind($index)"
                      [attr.data-testid]="'segment-kind-' + $index">
                @if (s.kind === 'WORK') {
                  <span i18n="@@piece.segment.work">WORK</span>
                } @else {
                  <span i18n="@@piece.segment.rest">REST</span>
                }
              </button>
              <button type="button" class="mini" (click)="removeSegment($index)"
                      [attr.aria-label]="removeSegmentLabel($index)">&#x2715;</button>
            </li>
          }
        </ul>
        <div class="rounds">
          <label class="rlab" for="piece-rounds" i18n="@@piece.rounds.label">Rounds</label>
          <input id="piece-rounds" class="num" type="number" min="1" inputmode="numeric"
                 [value]="rounds()" (change)="rounds.set(+$any($event.target).value || 1)"
                 data-testid="piece-rounds" />
        </div>
      }
      <bh-button variant="ghost" size="sm" (click)="addSegment()" testId="piece-add-segment">
        <span i18n="@@piece.segment.add">+ segment</span>
      </bh-button>
    </bh-sheet>

    <bh-sheet [open]="openSheet() === 'score'" title="How it is scored" i18n-title="@@piece.score.sheetTitle"
              label="How it is scored" i18n-label="@@piece.score.aria" (closed)="openSheet.set(null)">
      <bh-segmented [options]="scoreOptions" [value]="scoreChoice()"
                    (valueChange)="pickScore($event)" tone="bone" [wrap]="true"
                    label="How it is scored" i18n-label="@@piece.score.aria" />
    </bh-sheet>

    <bh-sheet [open]="openSheet() === 'team'" title="Who does it" i18n-title="@@piece.team.sheetTitle"
              label="Who does it" i18n-label="@@piece.team.aria" (closed)="openSheet.set(null)">
      <bh-segmented [options]="teamSizeOptions" [value]="teamSize().toString()"
                    (valueChange)="teamSize.set(+$event)" tone="bone" [wrap]="true"
                    label="Team size" i18n-label="@@piece.team.aria" />
      @if (teamSize() > 1) {
        <div data-testid="team-share" class="share">
          <bh-segmented [options]="shareOptions" [(value)]="teamShare" tone="bone" [wrap]="true"
                        label="How the team shares the work"
                        i18n-label="@@piece.share.aria" />
        </div>
      }
    </bh-sheet>

    <bh-pick-sheet [open]="pickOpen()" [rows]="movementRows()"
                   title="Movement" i18n-title="@@piece.pick.title"
                   searchLabel="Search movements" i18n-searchLabel="@@piece.pick.searchLabel"
                   searchPlaceholder="Search movements" i18n-searchPlaceholder="@@piece.pick.searchPlaceholder"
                   (search)="searchMovements($event)"
                   (picked)="onPicked($event)" (closed)="closePick()" />
  `,
  styles: [`
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-6); padding-bottom: var(--sp-8); }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    /* Mono for an eyebrow: it is a label on prescribed content, not prose. */
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700;
      letter-spacing: 0.08em; color: var(--bone-dim); margin: 0 0 var(--sp-3); }

    /* ---- header: title + meta strip ------------------------------------------------------- */
    .head { display: flex; flex-direction: column; gap: var(--sp-3); }
    .title-input { width: 100%; box-sizing: border-box; background: transparent; border: none;
      padding: 0; margin: 0; color: var(--bone); font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-hero); line-height: 1.1; }
    .title-input::placeholder { color: var(--bone-dim); }
    .title-input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px;
      border-radius: var(--r-xs); }
    .title-err { color: var(--danger); font-size: var(--fs-sm); }
    /* Read-only summary of the sheet's own preset choice: measured, so mono, never prose. */
    .timing-line { margin: 0; font-family: var(--font-mono); font-size: var(--fs-sm);
      font-weight: 700; letter-spacing: 0.04em; color: var(--bone-dim); }

    /* One meta strip, four chips, replaces four stacked segmented groups (the single biggest
       change in this rebuild). Two-up at 360px, four-up once there is room. */
    .meta-strip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2); }
    @media (min-width: 560px) { .meta-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    .chip { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0;
      min-height: var(--tap); box-sizing: border-box; padding: var(--sp-2) var(--sp-3);
      background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      color: var(--bone); text-align: left; cursor: pointer; }
    .chip:hover { border-color: var(--bone-dim); }
    .chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .chip-k { font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700;
      letter-spacing: 0.08em; color: var(--bone-dim); }
    .chip-v { width: 100%; font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 700;
      letter-spacing: 0.04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; }
    /* The chip showing what the piece IS is the piece's identity -- the one volt element this
       screen is allowed, bounded by area (a chip, never a card or the page). */
    .chip.volt { background: var(--volt); border-color: var(--volt); }
    .chip.volt .chip-k, .chip.volt .chip-v { color: var(--on-volt); }
    .chip.volt:focus-visible { outline-color: var(--focus-inv); }

    /* ---- the work: block cards -------------------------------------------------------------- */
    .work { display: flex; flex-direction: column; align-items: stretch; gap: var(--sp-3); }

    .segs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column;
      gap: var(--sp-2); width: 100%; }
    .seg-row { display: grid; grid-template-columns: 5rem auto minmax(0, 1fr) var(--tap);
      align-items: center; gap: var(--sp-2); }
    .unit { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim); }
    .kind { min-height: var(--tap); padding: 0 var(--sp-3); background: var(--surface-2);
      border: 1px solid var(--hairline); border-radius: var(--r-ctl); color: var(--bone);
      font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700;
      letter-spacing: 0.06em; cursor: pointer; }
    .kind:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .rounds { display: flex; align-items: center; gap: var(--sp-3); }
    .rlab { font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700;
      letter-spacing: 0.06em; color: var(--bone-dim); }

    /* The card chrome itself (surface/hairline/radius/padding) is bh-sortable-list's own .row --
       this is the content that sits inside it, so it carries no border of its own. */
    .block { display: flex; flex-direction: column; gap: var(--sp-2); width: 100%; min-width: 0; }
    .brow { display: grid; grid-template-columns: minmax(0, 1fr) var(--tap); gap: var(--sp-2);
      align-items: center; }
    /* The block's own name is a header on its card, not a form field: mono like every other
       prescribed number here, transparent until focused. */
    .blabel { min-height: var(--tap); width: 100%; min-width: 0; box-sizing: border-box;
      padding: 0 var(--sp-1); background: transparent; color: var(--bone);
      border: none; border-bottom: 1px solid transparent; border-radius: var(--r-xs);
      font-family: var(--font-mono); font-size: var(--fs-body); font-weight: 700;
      letter-spacing: 0.02em; }
    .blabel::placeholder { color: var(--bone-dim); }
    .blabel:hover { border-bottom-color: var(--hairline); }
    .blabel:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .blabel.sub { font-size: var(--fs-sm); }
    /* Mobile first: the movement is the line's subject, so at 360px it gets a full-width row of
       its own and reps/load/remove sit beneath it. Squeezing all four onto one line left the
       movement button about 40px wide -- the most important control on the row, collapsed.
       minmax(0, 1fr) throughout, never a bare 1fr: a grid item's automatic minimum is its
       min-content size, so a long movement name would otherwise force horizontal scroll. */
    .lrow { display: grid; grid-template-columns: minmax(0, 1fr) 4.5rem var(--tap);
      grid-template-areas: "mv mv mv" "reps load rm";
      gap: var(--sp-2); align-items: center; }
    .lrow > .mv { grid-area: mv; }
    .lrow > .r-reps { grid-area: reps; }
    .lrow > .r-load { grid-area: load; }
    .lrow > .r-rm { grid-area: rm; }

    .srow { display: grid; grid-template-columns: auto minmax(0, 1fr) var(--tap);
      grid-template-areas: "arrow mv mv" "arrow reps rm";
      gap: var(--sp-2); align-items: center; padding-left: var(--sp-3); }
    .srow > .arrow { grid-area: arrow; }
    .srow > .mv { grid-area: mv; }
    .srow > .r-reps { grid-area: reps; }
    .srow > .r-rm { grid-area: rm; }

    /* One line fits comfortably once there is room for it. */
    @media (min-width: 560px) {
      .lrow { grid-template-columns: minmax(0, 1fr) 4.5rem 4.5rem var(--tap);
        grid-template-areas: "mv reps load rm"; }
      .srow { grid-template-columns: auto minmax(0, 1fr) 4.5rem var(--tap);
        grid-template-areas: "arrow mv reps rm"; }
    }
    .arrow { color: var(--faint); font-size: var(--fs-sm); }
    .sub-block { padding-left: var(--sp-3); border-left: 1px solid var(--hairline);
      display: flex; flex-direction: column; gap: var(--sp-2); }

    .in, .num { min-height: var(--tap); box-sizing: border-box; width: 100%; min-width: 0;
      padding: 0 var(--sp-3); background: var(--surface); color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      font-family: var(--font-body); font-size: var(--fs-body); }
    /* Numbers are tabular and prescribed, so they read in mono. */
    .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; }
    .in:focus-visible, .num:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .mv { min-height: var(--tap); min-width: 0; padding: 0 var(--sp-3); text-align: left;
      background: var(--surface); color: var(--bone); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); font-family: var(--font-body); font-size: var(--fs-body);
      cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mv:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .ph { color: var(--bone-dim); }

    .mini { min-width: var(--tap); min-height: var(--tap); background: none; border: 0;
      color: var(--bone-dim); border-radius: var(--r-ctl); cursor: pointer; }
    .mini:hover { color: var(--bone); }
    .mini:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .badds { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
    .add { min-height: var(--tap); padding: 0 var(--sp-3); background: none;
      border: 1px dashed var(--hairline); border-radius: var(--r-ctl); color: var(--bone-dim);
      font-family: var(--font-body); font-size: var(--fs-sm); font-weight: 500; cursor: pointer; }
    .add:hover { color: var(--bone); border-color: var(--bone-dim); }
    .add:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .add.sub { margin-left: var(--sp-6); }

    .share { width: 100%; }
    .check { display: flex; align-items: center; gap: var(--sp-3); min-height: var(--tap);
      color: var(--bone); font-size: var(--fs-body); cursor: pointer; }

    /* Bottom bar: a hairline separates it from the last block card, echoing the composition's
       horizontal rule ahead of "Save piece". */
    .foot { display: flex; flex-direction: column; gap: var(--sp-3);
      padding-top: var(--sp-4); border-top: 1px solid var(--hairline); }

    /* A primary action is full-width and tall on mobile, never a small right-aligned button. */
    .full { width: 100%; }
    @media (min-width: 640px) { .full { width: auto; } }
  `],
})
export class PieceEditorPage {
  private prog = inject(ProgrammingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  state = signal<'loading' | 'error' | 'ready'>('ready');

  title = signal('');
  macro = signal('WORKOUT');
  timingPreset = signal<string | null>(null);
  rounds = signal(1);
  segments = signal<WodSegment[]>([]);
  blocks = signal<WodBlock[]>([]);
  scoreable = signal(true);
  scoreType = signal('TIME');
  teamSize = signal(1);
  teamShare = signal('TOGETHER');
  saveToLibrary = signal(false);

  titleError = signal('');
  formError = signal('');
  pending = signal(false);

  private wodId = signal<string | null>(null);

  /**
   * The class-build route is piece/:index; neither wods/ route carries an index. So the presence
   * of that param, not the id, is what says whether this piece belongs to a class.
   */
  standalone = computed(() => !this.routeIndex);
  private routeIndex = this.route.snapshot.paramMap.get('index');
  private sessionId = this.route.snapshot.paramMap.get('id');

  macroOptions: SegOption[] = MACROS.map(m => ({ value: m, label: MACRO_LABELS[m] }));
  presetOptions: SegOption[] = TIMING_PRESETS.map(p => ({ value: p, label: PRESET_LABELS[p] }));
  shareOptions: SegOption[] = TEAM_SHARES.map(s => ({ value: s, label: SHARE_LABELS[s] }));
  teamSizeOptions: SegOption[] = [1, 2, 3, 4].map(n => ({ value: n.toString(), label: n.toString() }));

  /**
   * Not scored and Completion are two different rows in the data and must read differently:
   * Completion IS a result (done or not), Not scored is the absence of one.
   */
  scoreOptions: SegOption[] = [
    { value: 'NOT_SCORED', label: $localize`:@@piece.score.notScored:Not scored` },
    { value: 'TIME', label: $localize`:@@piece.score.time:Time` },
    { value: 'ROUNDS_REPS', label: $localize`:@@piece.score.roundsReps:Rounds + reps` },
    { value: 'LOAD', label: $localize`:@@piece.score.load:Load` },
    { value: 'NONE', label: $localize`:@@piece.score.completion:Completion` },
  ];

  scoreChoice = computed(() => this.scoreable() ? this.scoreType() : 'NOT_SCORED');

  /** A class field, not an inline arrow: an arrow in the template mints a new identity each cycle. */
  blockLabeller = (b: WodBlock, i: number) =>
    b.label || $localize`:@@piece.block.fallback:block ${i + 1}:position:`;

  // ---- meta strip / sheets ----------------------------------------------------------------

  /** Which of the four meta chips opened its sheet. bh-sheet's open is one-way, so every sheet
   *  resets this to null on (closed) instead of clearing its own flag. */
  openSheet = signal<'macro' | 'timing' | 'score' | 'team' | null>(null);

  setTitle(v: string) {
    this.title.set(v);
    this.titleError.set('');
  }

  metaMacroLabel = computed(() => MACRO_LABELS[this.macro()] ?? this.macro());

  metaPresetLabel = computed(() => {
    const p = this.timingPreset();
    // NOT "Custom": that is one of the legacy wodType values this milestone exists to retire, and
    // showing it here reads as if the piece has been typed rather than simply having no preset yet.
    return p ? (PRESET_LABELS[p] ?? p) : $localize`:@@piece.timing.chip.none:Not set`;
  });

  metaScoreLabel = computed(() =>
    this.scoreOptions.find(o => o.value === this.scoreChoice())?.label ?? this.scoreChoice());

  metaTeamLabel = computed(() => this.teamSize() === 1
    ? $localize`:@@piece.team.chip.solo:Solo`
    : $localize`:@@piece.team.chip.value:Team of ${this.teamSize()}:count:`);

  /** The header's read-only "8 x :20 / :10" line -- the segment list moved into the timing sheet,
   *  so this is what stays visible without opening it. */
  timingSummary = computed(() => {
    const segs = this.segments();
    if (!segs.length) return '';
    const parts = segs.map(s => this.formatSeconds(s.seconds));
    const rounds = this.rounds();
    return rounds > 1 ? `${rounds} x ${parts.join(' / ')}` : parts.join(' / ');
  });

  private formatSeconds(total: number): string {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `:${s.toString().padStart(2, '0')}`;
  }

  // ---- pick sheet -------------------------------------------------------------------------

  pickOpen = signal(false);
  movementRows = signal<PickRow[]>([]);
  private pickTarget: PickTarget | null = null;

  constructor() {
    const id = this.route.snapshot.paramMap.get('wodId') ?? this.route.snapshot.paramMap.get('id');
    // Only a standalone wods/:id route names a wod. On the class route :id is the session.
    if (this.standalone() && id) this.load(id);
  }

  openPick(block: number, line: number, scale: number | null) {
    this.pickTarget = { block, line, scale };
    this.movementRows.set([]);
    this.pickOpen.set(true);
    this.searchMovements('');
  }

  /**
   * The sheet does not filter — it hands back the debounced term and the server does the matching,
   * so an alias the server knows about is not hidden by a second filter on this side.
   */
  searchMovements(term: string) {
    this.prog.movements(term).subscribe({
      next: ms => this.movementRows.set(
        ms.map(m => ({ id: m.id, primary: m.name, secondary: m.category }))),
      error: () => this.movementRows.set([]),
    });
  }

  onPicked(result: PickResult) {
    const t = this.pickTarget;
    // bh-pick-sheet's open is one-way and it never clears it, so both picked and closed must
    // reset this signal or the sheet will not reopen.
    this.closePick();
    if (!t) return;

    if ('freeText' in result) {
      const patch = { text: result.freeText, movementId: undefined };
      if (t.scale === null) this.setLine(t.block, t.line, patch);
      else this.setScale(t.block, t.line, t.scale, patch);
      return;
    }

    const row = this.movementRows().find(r => r.id === result.id);
    const patch = { text: row?.primary ?? '', movementId: result.id };
    if (t.scale === null) this.setLine(t.block, t.line, patch);
    else this.setScale(t.block, t.line, t.scale, patch);
  }

  closePick() {
    this.pickOpen.set(false);
    this.pickTarget = null;
  }

  // ---- load -------------------------------------------------------------------------------

  reload() {
    const id = this.wodId();
    if (id) this.load(id);
  }

  /**
   * Resets EVERY piece of state before the fetch, not just some. In M14b a sheet showed the
   * previous class's name because load() reset the state flag but not the body, and it looked right.
   */
  load(id: string) {
    this.wodId.set(id);
    this.title.set('');
    this.macro.set('WORKOUT');
    this.timingPreset.set(null);
    this.rounds.set(1);
    this.segments.set([]);
    this.blocks.set([]);
    this.scoreable.set(true);
    this.scoreType.set('TIME');
    this.teamSize.set(1);
    this.teamShare.set('TOGETHER');
    this.saveToLibrary.set(false);
    this.titleError.set('');
    this.formError.set('');
    this.state.set('loading');

    this.prog.wod(id).subscribe({
      next: w => {
        this.title.set(w.title ?? '');
        this.macro.set(w.macro || 'WORKOUT');
        this.timingPreset.set(w.timingPreset);
        this.rounds.set(w.timing?.rounds ?? 1);
        this.segments.set([...(w.timing?.segments ?? [])]);
        this.blocks.set([...(w.blocks?.blocks ?? [])]);
        this.scoreType.set(w.scoreType || 'TIME');
        this.teamSize.set(w.teamSize || 1);
        this.teamShare.set(w.teamShare || 'TOGETHER');
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  // ---- timing -----------------------------------------------------------------------------

  /** A preset SEEDS the sequence. It never constrains it: later edits leave the name in place. */
  pickPreset(preset: string) {
    this.timingPreset.set(preset);
    const seed = PRESET_SEEDS[preset];
    if (!seed) return;
    this.rounds.set(seed.rounds);
    this.segments.set(seed.segments.map(s => ({ ...s })));
  }

  updateSegment(i: number, seg: WodSegment) {
    this.segments.update(list => list.map((s, idx) => idx === i ? seg : s));
  }

  toggleKind(i: number) {
    const s = this.segments()[i];
    if (s) this.updateSegment(i, { ...s, kind: s.kind === 'WORK' ? 'REST' : 'WORK' });
  }

  addSegment() {
    this.segments.update(list => [...list, { seconds: 60, kind: 'WORK' as const }]);
  }

  removeSegment(i: number) {
    this.segments.update(list => list.filter((_, idx) => idx !== i));
  }

  // ---- blocks -----------------------------------------------------------------------------

  addBlock() {
    this.blocks.update(list => [...list, { label: '', lines: [], blocks: [] }]);
  }

  removeBlock(i: number) {
    this.blocks.update(list => list.filter((_, idx) => idx !== i));
  }

  setBlockLabel(i: number, label: string) {
    this.blocks.update(list => list.map((b, idx) => idx === i ? { ...b, label } : b));
  }

  /** bh-sortable-list is presentational and never mutates items(), so the array is spliced here. */
  moveBlock(move: { from: number; to: number }) {
    this.blocks.update(list => {
      const next = [...list];
      const [item] = next.splice(move.from, 1);
      next.splice(move.to, 0, item);
      return next;
    });
  }

  addSubBlock(i: number) {
    this.blocks.update(list => list.map((b, idx) =>
      idx === i ? { ...b, blocks: [...(b.blocks ?? []), { label: '', lines: [] }] } : b));
  }

  removeSubBlock(i: number, j: number) {
    this.blocks.update(list => list.map((b, idx) =>
      idx === i ? { ...b, blocks: (b.blocks ?? []).filter((_, k) => k !== j) } : b));
  }

  setSubBlockLabel(i: number, j: number, label: string) {
    this.blocks.update(list => list.map((b, idx) =>
      idx === i
        ? { ...b, blocks: (b.blocks ?? []).map((sb, k) => k === j ? { ...sb, label } : sb) }
        : b));
  }

  /**
   * Depth is capped at two. Called with one argument this asks "may this top-level block take a
   * part?"; called with two it asks the same of a block that is already nested, which is always no.
   */
  canAddSubBlock(i: number, j?: number): boolean {
    if (j !== undefined) return false;
    return MAX_BLOCK_DEPTH > 1 && i < this.blocks().length;
  }

  // ---- lines and scaling options ------------------------------------------------------------

  addLine(i: number) {
    this.blocks.update(list => list.map((b, idx) =>
      idx === i ? { ...b, lines: [...(b.lines ?? []), { text: '' }] } : b));
  }

  removeLine(i: number, j: number) {
    this.blocks.update(list => list.map((b, idx) =>
      idx === i ? { ...b, lines: (b.lines ?? []).filter((_, k) => k !== j) } : b));
  }

  setLine(i: number, j: number, patch: Partial<WodLine>) {
    this.blocks.update(list => list.map((b, idx) =>
      idx === i
        ? { ...b, lines: (b.lines ?? []).map((l, k) => k === j ? { ...l, ...patch } : l) }
        : b));
  }

  scalesOf(i: number, j: number): WodScale[] {
    return this.blocks()[i]?.lines?.[j]?.scales ?? [];
  }

  /** Capped at six: an affordance beyond the cap would produce a 400, which is a defect. */
  canAddScale(i: number, j: number): boolean {
    return this.scalesOf(i, j).length < MAX_SCALES_PER_LINE;
  }

  addScale(i: number, j: number) {
    if (!this.canAddScale(i, j)) return;
    this.setLine(i, j, { scales: [...this.scalesOf(i, j), { text: '' }] });
  }

  removeScale(i: number, j: number, k: number) {
    this.setLine(i, j, { scales: this.scalesOf(i, j).filter((_, idx) => idx !== k) });
  }

  setScale(i: number, j: number, k: number, patch: Partial<WodScale>) {
    this.setLine(i, j, {
      scales: this.scalesOf(i, j).map((s, idx) => idx === k ? { ...s, ...patch } : s),
    });
  }

  // ---- scoring ------------------------------------------------------------------------------

  pickScore(choice: string) {
    if (choice === 'NOT_SCORED') { this.scoreable.set(false); return; }
    this.scoreable.set(true);
    this.scoreType.set(choice);
  }

  // ---- accessible names ----------------------------------------------------------------------

  secondsLabel(i: number) { return $localize`:@@piece.segment.secondsAria:Seconds for segment ${i + 1}:position:`; }
  removeSegmentLabel(i: number) { return $localize`:@@piece.segment.removeAria:Remove segment ${i + 1}:position:`; }
  blockNameLabel(i: number) { return $localize`:@@piece.block.nameAria:Name of block ${i + 1}:position:`; }
  removeBlockLabel(i: number) { return $localize`:@@piece.block.removeAria:Remove block ${i + 1}:position:`; }
  subBlockNameLabel(i: number, j: number) { return $localize`:@@piece.subBlock.nameAria:Name of part ${j + 1}:position: in block ${i + 1}:parent:`; }
  removeSubBlockLabel(i: number, j: number) { return $localize`:@@piece.subBlock.removeAria:Remove part ${j + 1}:position: from block ${i + 1}:parent:`; }
  repsLabel(i: number, j: number) { return $localize`:@@piece.line.repsAria:Reps for line ${j + 1}:position:`; }
  loadLabel(i: number, j: number) { return $localize`:@@piece.line.loadAria:Load for line ${j + 1}:position:`; }
  removeLineLabel(i: number, j: number) { return $localize`:@@piece.line.removeAria:Remove line ${j + 1}:position:`; }
  scaleRepsLabel(i: number, j: number, k: number) { return $localize`:@@piece.scale.repsAria:Reps for scaling option ${k + 1}:position:`; }
  removeScaleLabel(i: number, j: number, k: number) { return $localize`:@@piece.scale.removeAria:Remove scaling option ${k + 1}:position:`; }

  // ---- save ----------------------------------------------------------------------------------

  /**
   * The guard lives here and not only on the button: Enter submits a form regardless of any
   * [disabled], and a native disabled attribute also drops the pressed control out of the a11y tree.
   */
  submit(event?: Event) {
    event?.preventDefault();
    if (this.pending()) return;

    this.titleError.set('');
    this.formError.set('');

    const title = this.title().trim();
    if (!title) {
      this.titleError.set($localize`:@@piece.title.error.required:Give the piece a name.`);
      return;
    }

    // No wodType. Its absence is the CIRCUIT/CUSTOM/SKILL fix: the server derives the legacy
    // value from the macro, and an explicit macro wins over it.
    const payload: WodInput = {
      title,
      macro: this.macro(),
      timingPreset: this.timingPreset(),
      timing: { rounds: this.rounds(), segments: this.segments() },
      blocks: { blocks: this.blocks() },
      scoreType: this.scoreType(),
      teamSize: this.teamSize(),
      teamShare: this.teamSize() > 1 ? this.teamShare() : null,
      library: this.standalone(),
    };
    if (!this.standalone()) payload.saveToLibrary = this.saveToLibrary();

    this.pending.set(true);
    const id = this.wodId();
    const save$ = id ? this.prog.patchWod(id, payload) : this.prog.createWod(payload);
    save$.subscribe({
      next: () => {
        this.pending.set(false);
        if (this.standalone()) this.router.navigate(['/coach/wods']);
        else this.router.navigate(['/coach/classes', this.sessionId, 'build']);
      },
      error: () => {
        this.pending.set(false);
        // The input is left exactly as typed — a failed save must never cost the coach the piece.
        this.formError.set($localize`:@@piece.save.error:That did not save — try again.`);
      },
    });
  }
}
