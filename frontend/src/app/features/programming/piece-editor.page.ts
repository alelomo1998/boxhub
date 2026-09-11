import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../../ui/button.component';
import { AlertComponent } from '../../ui/alert.component';
import { SegOption } from '../../ui/segmented.component';
import { SortableListComponent } from '../../ui/sortable-list.component';
import { SheetComponent } from '../../ui/sheet.component';
import { PickSheetComponent, PickRow, PickResult } from './pick-sheet.component';
import { NumberStepperComponent } from './number-stepper.component';
import {
  ProgrammingService, MACROS, TIMING_PRESETS, TEAM_SHARES,
  movementCategoryLabel, MOVEMENT_UNITS,
  Movement, WodBlock, WodLine, WodScale, WodSegment, WodInput,
} from './programming.service';

/** The server rejects a third level with BLOCK_DEPTH, so the UI must never offer one. */
const MAX_BLOCK_DEPTH = 2;
/** Spec 5A: a line may carry alternatives, but a wall of them stops being a prescription. */
const MAX_SCALES_PER_LINE = 6;

/** What each preset seeds. A preset SEEDS and never constrains: edits afterwards leave the name. */
const PRESET_SEEDS: Record<string, { rounds: number; segments: WodSegment[] }> = {
  EMOM: { rounds: 12, segments: [{ seconds: 60, kind: 'WORK' }] },
  TABATA: { rounds: 8, segments: [{ seconds: 20, kind: 'WORK' }, { seconds: 10, kind: 'REST' }] },
  INTERVAL: { rounds: 5, segments: [{ seconds: 60, kind: 'WORK' }, { seconds: 60, kind: 'REST' }] },
};

/** These three are a repeating work-rest pattern -- a segment means "a block plus a duration,"
 *  which only means anything when the pattern repeats. FOR_TIME and AMRAP are one number (a cap,
 *  a duration), not a sequence, so they get the time-cap/duration control instead of a segments
 *  list (user-ruled 2026-09-10). Named once, here, rather than scattered through the template. */
const SEGMENTED_PRESETS = ['EMOM', 'TABATA', 'INTERVAL'];

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
    ButtonComponent, AlertComponent,
    SortableListComponent, PickSheetComponent, SheetComponent, NumberStepperComponent,
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

        @if (hasSegments()) {
          <section class="segments">
            @if (segments().length > 0) {
              <h2 class="eyebrow" i18n="@@piece.segments.heading">SEGMENTS</h2>
              <ul class="segs">
                @for (s of segments(); track $index) {
                  <li class="seg-row" [attr.data-testid]="'segment-' + $index">
                    <bh-number-stepper class="seg-secs" [label]="SEG_SEC_LABEL"
                           [value]="segSecondsStr($index)" (valueChange)="onSegSecondsChange($index, $event)"
                           [min]="1" [step]="5" [allowDecimal]="false"
                           [ariaLabel]="secondsLabel($index)" [testId]="'segment-secs-' + $index" />
                    <button type="button" class="kind" (click)="openSegPick($index)"
                            [attr.data-testid]="'segment-pick-' + $index">
                      @if (s.kind === 'REST') {
                        <span i18n="@@piece.segment.rest">REST</span>
                      } @else if (segmentBlockLabel(s); as label) {
                        <span>{{ label }}</span>
                      } @else {
                        <span class="ph" i18n="@@piece.segment.chooseBlock">Choose a block</span>
                      }
                    </button>
                    <button type="button" class="mini" (click)="removeSegment($index)"
                            [attr.aria-label]="removeSegmentLabel($index)">&#x2715;</button>
                  </li>
                }
              </ul>
              <div class="rounds">
                <bh-number-stepper [label]="ROUNDS_LABEL" [value]="roundsStr()"
                       (valueChange)="onRoundsChange($event)" [min]="1" [step]="1" [allowDecimal]="false"
                       [ariaLabel]="ROUNDS_LABEL" testId="piece-rounds" />
              </div>
            }
            <button type="button" class="add" (click)="addSegment()" data-testid="piece-add-segment">
              <span i18n="@@piece.segment.add">Add segment</span>
            </button>
          </section>
        } @else if (hasCap()) {
          <section class="segments">
            <bh-number-stepper [label]="capLabel()" [value]="timeCapMinutes()"
                   (valueChange)="timeCapMinutes.set($event)"
                   [min]="0" [step]="1" [allowDecimal]="false" [suffix]="capUnit"
                   [ariaLabel]="capAriaLabel()" testId="piece-time-cap" />
          </section>
        }

        <section class="work">
          <h2 class="eyebrow" i18n="@@piece.blocks.heading">THE WORK</h2>

          @if (blocks().length === 0) {
            <p class="muted" data-testid="piece-empty" i18n="@@piece.blocks.empty">
              Nothing prescribed yet. Add a block to start writing the piece.
            </p>
          } @else {
            <bh-sortable-list [items]="blocks()" [itemLabel]="blockLabeller"
                              label="Blocks" i18n-label="@@piece.blocks.aria"
                              handleAlign="top" [canDragItem]="canDragBlock"
                              (reordered)="moveBlock($event)">
              <ng-template let-b let-bi="index">
                <div class="block" [attr.data-testid]="'block-' + bi">
                  <div class="bar" [class.with-handle]="isCollapsed(bi)"
                       [class.confirming]="confirmRemove() === bi">
                    <button type="button" class="chevron" [class.collapsed]="isCollapsed(bi)"
                            (click)="toggleCollapse(bi)"
                            [attr.aria-expanded]="!isCollapsed(bi)"
                            [attr.aria-label]="collapseLabel(bi)"
                            [attr.data-testid]="'block-toggle-' + bi">
                      <span class="chev" aria-hidden="true">&#x25B8;</span>
                    </button>
                    <input class="blabel" [value]="b.label ?? ''"
                           (input)="setBlockLabel(bi, $any($event.target).value)"
                           placeholder="Block name" i18n-placeholder="@@piece.block.namePlaceholder"
                           [attr.aria-label]="blockNameLabel(bi)" />
                    @if (confirmRemove() === bi) {
                      <bh-button variant="ghost" size="sm" (click)="cancelRemoveBlock()"
                                 [testId]="'block-remove-cancel-' + bi">
                        <span i18n="@@piece.block.removeCancel">Cancel</span>
                      </bh-button>
                      <bh-button variant="danger" size="sm" (click)="confirmRemoveBlock(bi)"
                                 [testId]="'block-remove-confirm-' + bi">
                        <span i18n="@@piece.block.removeConfirm">Remove</span>
                      </bh-button>
                    } @else {
                      <button type="button" class="mini" (click)="copyBlock(bi)"
                              [attr.aria-label]="copyBlockLabel(bi)"
                              [attr.data-testid]="'block-copy-' + bi">
                        <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none"
                             stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                          <rect x="2" y="4" width="9" height="9" rx="1.5" />
                          <rect x="5" y="1" width="9" height="9" rx="1.5" />
                        </svg>
                      </button>
                      <button type="button" class="mini danger" (click)="onRemoveBlockClick(bi)"
                              [attr.aria-label]="removeBlockLabel(bi)"
                              [attr.data-testid]="'block-remove-' + bi">&#x2715;</button>
                    }
                  </div>

                  @if (isCollapsed(bi)) {
                    <p class="summary" [attr.data-testid]="'block-summary-' + bi">{{ blockSummary(bi) }}</p>
                  } @else {
                    @for (l of b.lines ?? []; track $index; let li = $index) {
                      <!-- One line and everything that belongs to it -- its scaling options and
                           their add control -- inside a single bounded unit, so a scaling row
                           reads as part of the line above it rather than as another line. -->
                      <div class="line-unit">
                      <div class="lrow" [attr.data-testid]="'line-' + bi + '-' + li">
                        <button type="button" class="mv" (click)="openPick(bi, li, null)"
                                [attr.data-testid]="'line-movement-' + bi + '-' + li">
                          @if (l.text) {
                            <span>{{ l.text }}</span>
                          } @else {
                            <span class="ph" i18n="@@piece.line.choose">Choose a movement</span>
                          }
                        </button>
                        <bh-number-stepper class="r-reps" [label]="unitOf(l)" [labelInteractive]="unitsOf(l).length > 1"
                               (labelAction)="openUnitPick(bi, li, null)"
                               [value]="l.reps ?? ''" (valueChange)="setLine(bi, li, { reps: $event })"
                               [min]="0" [ariaLabel]="repsLabel(bi, li)"
                               [testId]="'line-reps-' + bi + '-' + li" />
                        @if (loadableOf(l)) {
                        <bh-number-stepper class="r-load" label="LOAD" i18n-label="@@piece.line.loadStepperLabel"
                               [value]="l.load ?? ''" (valueChange)="setLine(bi, li, { load: $event })"
                               [min]="0" [allowDecimal]="true" [suffix]="weightUnit()"
                               [ariaLabel]="loadLabel(bi, li)"
                               [testId]="'line-load-' + bi + '-' + li" />
                        }
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
                          <bh-number-stepper class="r-reps" [label]="unitOf(sc)" [labelInteractive]="unitsOf(sc).length > 1"
                                 (labelAction)="openUnitPick(bi, li, si)"
                                 [value]="sc.reps ?? ''" (valueChange)="setScale(bi, li, si, { reps: $event })"
                                 [min]="0" [ariaLabel]="scaleRepsLabel(bi, li, si)"
                                 [testId]="'scale-reps-' + bi + '-' + li + '-' + si" />
                          @if (loadableOf(sc)) {
                          <bh-number-stepper class="r-load" label="LOAD" i18n-label="@@piece.scale.loadStepperLabel"
                                 [value]="sc.load ?? ''" (valueChange)="setScale(bi, li, si, { load: $event })"
                                 [min]="0" [allowDecimal]="true" [suffix]="weightUnit()"
                                 [ariaLabel]="scaleLoadLabel(bi, li, si)"
                                 [testId]="'scale-load-' + bi + '-' + li + '-' + si" />
                          }
                          <button type="button" class="mini r-rm" (click)="removeScale(bi, li, si)"
                                  [attr.aria-label]="removeScaleLabel(bi, li, si)">&#x2715;</button>
                        </div>
                      }

                      @if (canAddScale(bi, li)) {
                        <button type="button" class="add sub" (click)="addScale(bi, li)"
                                [attr.data-testid]="'add-scale-' + bi + '-' + li">
                          <span i18n="@@piece.scale.add">Add a scaling option</span>
                        </button>
                      }
                      </div>
                    }

                    <!-- A piece authored elsewhere may already carry a nested part. There is no way
                         to CREATE one here (the user could not tell what "+ part" meant), but an
                         existing one must still render rather than silently vanish -- read-only,
                         flat, no indent: a labelled group of its lines, nothing else. -->
                    @for (sb of b.blocks ?? []; track $index; let sbi = $index) {
                      <div class="subgroup" [attr.data-testid]="'sub-block-' + bi + '-' + sbi">
                        <p class="subhead">{{ sb.label || subBlockFallback(sbi) }}</p>
                        @for (sl of sb.lines ?? []; track $index) {
                          <p class="subline">{{ sl.text }}</p>
                        }
                      </div>
                    }

                    <button type="button" class="add" (click)="addLine(bi)"
                            [attr.data-testid]="'add-line-' + bi">
                      <span i18n="@@piece.line.add">Add line</span>
                    </button>
                  }
                </div>
              </ng-template>
            </bh-sortable-list>
          }

          <button type="button" class="add" (click)="addBlock()" data-testid="piece-add-block">
            <span i18n="@@piece.block.add">Add block</span>
          </button>
          @if (clipboard()) {
            <button type="button" class="add" (click)="pasteBlock()" data-testid="piece-paste-block">
              <span>{{ pasteButtonLabel() }}</span>
            </button>
          }
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
            } @else if (saved()) {
              <span i18n="@@piece.save.saved">Saved</span>
            } @else {
              <span i18n="@@piece.save.default">Save piece</span>
            }
          </bh-button>
        </footer>
      }
    </form>

    <bh-sheet [open]="openSheet() === 'macro'" title="What it is" i18n-title="@@piece.macro.sheetTitle"
              label="What it is" i18n-label="@@piece.macro.aria" (closed)="openSheet.set(null)">
      <div class="rows">
        @for (opt of macroOptions; track opt.value) {
          <button type="button" class="prow" [class.sel]="macro() === opt.value"
                  (click)="pickMacro(opt.value)">
            <span>{{ opt.label }}</span>
            @if (macro() === opt.value) { <span class="mark" aria-hidden="true">&#x2713;</span> }
          </button>
        }
      </div>
    </bh-sheet>

    <bh-sheet [open]="openSheet() === 'timing'" title="How it runs" i18n-title="@@piece.timing.sheetTitle"
              label="How it runs" i18n-label="@@piece.timing.aria" (closed)="openSheet.set(null)">
      <div class="rows">
        <button type="button" class="prow" [class.sel]="timingPreset() === null"
                (click)="pickTimingNone()">
          <span i18n="@@piece.preset.none">None</span>
          @if (timingPreset() === null) { <span class="mark" aria-hidden="true">&#x2713;</span> }
        </button>
        @for (opt of presetOptions; track opt.value) {
          <button type="button" class="prow" [class.sel]="timingPreset() === opt.value"
                  (click)="pickPreset(opt.value)">
            <span>{{ opt.label }}</span>
            @if (timingPreset() === opt.value) { <span class="mark" aria-hidden="true">&#x2713;</span> }
          </button>
        }
      </div>
    </bh-sheet>

    <bh-sheet [open]="openSheet() === 'score'" title="How it is scored" i18n-title="@@piece.score.sheetTitle"
              label="How it is scored" i18n-label="@@piece.score.aria" (closed)="openSheet.set(null)">
      <div class="rows">
        @for (opt of scoreOptions; track opt.value) {
          <button type="button" class="prow" [class.sel]="scoreChoice() === opt.value"
                  (click)="pickScore(opt.value)">
            <span>{{ opt.label }}</span>
            @if (scoreChoice() === opt.value) { <span class="mark" aria-hidden="true">&#x2713;</span> }
          </button>
        }
      </div>
    </bh-sheet>

    <bh-sheet [open]="openSheet() === 'team'" title="Who does it" i18n-title="@@piece.team.sheetTitle"
              label="Who does it" i18n-label="@@piece.team.aria" (closed)="openSheet.set(null)">
      <div class="rows">
        @for (opt of teamSizeOptions; track opt.value) {
          <button type="button" class="prow" [class.sel]="teamSize().toString() === opt.value"
                  (click)="pickTeamSize(+opt.value)">
            <span>{{ opt.label }}</span>
            @if (teamSize().toString() === opt.value) { <span class="mark" aria-hidden="true">&#x2713;</span> }
          </button>
        }
      </div>
      @if (teamSize() > 1) {
        <div data-testid="team-share" class="rows">
          @for (opt of shareOptions; track opt.value) {
            <button type="button" class="prow" [class.sel]="teamShare() === opt.value"
                    (click)="pickTeamShare(opt.value)">
              <span>{{ opt.label }}</span>
              @if (teamShare() === opt.value) { <span class="mark" aria-hidden="true">&#x2713;</span> }
            </button>
          }
        </div>
      }
    </bh-sheet>

    <bh-sheet [open]="segPick() !== null" title="What runs here" i18n-title="@@piece.segPick.sheetTitle"
              label="What runs here" i18n-label="@@piece.segPick.aria" (closed)="segPick.set(null)">
      <div class="rows">
        @for (b of blocks(); track $index) {
          <button type="button" class="prow" [class.sel]="segPickTarget()?.blockIndex === $index"
                  [attr.data-testid]="'seg-pick-block-' + $index"
                  (click)="pickSegBlock($index)">
            <span>{{ blockLabeller(b, $index) }}</span>
            @if (segPickTarget()?.blockIndex === $index) { <span class="mark" aria-hidden="true">&#x2713;</span> }
          </button>
        }
        <button type="button" class="prow rest-row" [class.sel]="segPickTarget()?.kind === 'REST'"
                data-testid="seg-pick-rest" (click)="pickSegRest()">
          <span i18n="@@piece.segment.rest">REST</span>
          @if (segPickTarget()?.kind === 'REST') { <span class="mark" aria-hidden="true">&#x2713;</span> }
        </button>
      </div>
    </bh-sheet>

    <bh-sheet [open]="unitPick() !== null" title="Unit" i18n-title="@@piece.unitPick.sheetTitle"
              label="Unit" i18n-label="@@piece.unitPick.aria" (closed)="unitPick.set(null)">
      <div class="rows">
        @for (u of unitPickOptions(); track u) {
          <button type="button" class="prow" [class.sel]="unitPickCurrent() === u"
                  [attr.data-testid]="'unit-pick-' + u" (click)="pickUnit(u)">
            <span>{{ u }}</span>
            @if (unitPickCurrent() === u) { <span class="mark" aria-hidden="true">&#x2713;</span> }
          </button>
        }
      </div>
    </bh-sheet>

    <bh-pick-sheet [open]="pickOpen()" [rows]="movementRows()"
                   title="Movement" i18n-title="@@piece.pick.title"
                   searchLabel="Search movements" i18n-searchLabel="@@piece.pick.searchLabel"
                   searchPlaceholder="Search movements" i18n-searchPlaceholder="@@piece.pick.searchPlaceholder"
                   [allowCreate]="true" [createPending]="createPending()" [createError]="createError()"
                   (search)="searchMovements($event)" (create)="onCreateMovement($event)"
                   (picked)="onPicked($event)" (closed)="closePick()" />
  `,
  styles: [`
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-6); padding-bottom: var(--sp-8); }
    .muted { color: var(--bone-dim); font-size: var(--fs-body); margin: 0; }
    /* Mono for an eyebrow: it is a label on prescribed content, not prose. Centred (user-ruled). */
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700;
      letter-spacing: 0.08em; color: var(--bone-dim); margin: 0 0 var(--sp-3); text-align: center; }

    /* ---- header: title + meta strip ------------------------------------------------------- */
    .head { display: flex; flex-direction: column; gap: var(--sp-3); }
    .title-input { width: 100%; box-sizing: border-box; background: transparent; border: none;
      padding: 0; margin: 0; color: var(--bone); font-family: var(--font-display); font-weight: 800;
      font-size: var(--fs-hero); line-height: 1.1; }
    .title-input::placeholder { color: var(--bone-dim); }
    .title-input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px;
      border-radius: var(--r-xs); }
    /* Measured: a 32-character title needs 693px of content in a 328px field at --fs-hero, so well
       under half is visible once it loses focus. Token-only step-down, not a clamp() or px size --
       a long title still clips, but less. Converting the input to a wrapping element is a shape
       change to the screen's most identity-bearing control and is not this fix's call to make. */
    @media (max-width: 360px) { .title-input { font-size: var(--fs-h2); } }
    .title-err { color: var(--danger); font-size: var(--fs-sm); }

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

    /* ---- segments: moved off the timing sheet onto the page (user-ruled: a tabata's shape is
       drawn here, not chosen inside a picker). Same eyebrow treatment as THE WORK below it. */
    /* The segments area is a card for the same reason a block is one: a coach has to see where the
       sequence starts and ends, and a bare Add button floating on the page ground said nothing
       about what it belonged to. */
    .segments { display: flex; flex-direction: column; align-items: stretch; gap: var(--sp-3);
      padding: var(--sp-3); background: var(--surface); border: 1px solid var(--hairline);
      border-radius: var(--r-card); }

    /* ---- the work: block cards -------------------------------------------------------------- */
    .work { display: flex; flex-direction: column; align-items: stretch; gap: var(--sp-3); }

    .segs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column;
      gap: var(--sp-2); width: 100%; }
    /* A stepper is far wider than the narrow number field it replaces (measured: it no longer
       fits beside the kind picker and remove button in one row at 360px), so mobile-first this
       stacks -- the stepper gets its own full-width row, kind+remove share the second. Widens
       back to one row once there is room; see the min-width breakpoint below (measured). */
    .seg-row { display: grid; grid-template-columns: minmax(0, 1fr) var(--tap);
      grid-template-areas: "secs secs" "kind rm"; gap: var(--sp-2); align-items: center; }
    .seg-row > .seg-secs { grid-area: secs; }
    .seg-row > .kind { grid-area: kind; }
    .seg-row > .mini { grid-area: rm; }
    .kind { min-height: var(--tap); padding: 0 var(--sp-3); background: var(--surface-2);
      border: 1px solid var(--hairline); border-radius: var(--r-ctl); color: var(--bone);
      font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700;
      letter-spacing: 0.06em; cursor: pointer; }
    .kind:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* No flex: it wrapped a label+input pair before the stepper, and a flex item's automatic
       min-width is its content's min-content size (unlike a grid track sized minmax(0, 1fr),
       which the seg-row/lrow/srow columns rely on for exactly this shrink) -- with flex still on,
       the stepper refused to shrink below ~360px and overflowed a 320px viewport (measured). Block
       lets the stepper's own :host{display:block} fill 100% and shrink from there. */
    .rounds { width: 100%; }
    /* Same budget as a reps stepper (label 56 + gap 8 + minus 44 + gap 8 + input 64 + gap 8 +
       plus 44 = 232px -> 15rem, no suffix here) -- measured, matches .lrow's own comment below. */
    @media (min-width: 480px) {
      .seg-row { grid-template-columns: 15rem minmax(0, 1fr) var(--tap);
        grid-template-areas: "secs kind rm"; }
    }

    /* Each block is its own outline: a surface-2 bar for the header, un-indented content on the
       page ground below it, and --sp-5 between one block and the next so a new bar reads as
       "a new block starts here" -- the boundary a flat card used to give for free. */
    /* A block IS a card, and its border is the only thing that says where it starts and ends. The
       round-1 version was rejected not for having a border but for indenting its content behind
       the drag handle's gutter and cramping it. That cannot happen now: the handle exists only
       while collapsed, so an expanded block has no gutter and its content runs the full interior
       width. Containment and full width were never in conflict. */
    .block { display: flex; flex-direction: column; gap: var(--sp-3); width: 100%; min-width: 0;
      box-sizing: border-box; padding: var(--sp-3); background: var(--surface);
      border: 1px solid var(--hairline); border-radius: var(--r-card); }

    /* One line plus its scaling options, bounded so the line's own extent is visible inside the
       block. --surface-2 against the block's --surface: a step in fill, not another heavy border,
       because three stacked 1px rules at 360px reads as noise. */
    .line-unit { display: flex; flex-direction: column; gap: var(--sp-2); width: 100%;
      min-width: 0; box-sizing: border-box; padding: var(--sp-2);
      background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--r-ctl); }
    /* Below 360px the stacked layout's own chrome (the srow arrow column, this padding) starts
       eating into the steppers' 40px floor -- measured, not estimated. Dropped rather than shrunk:
       the arrow is decorative (an indent already carries its meaning) and --sp-1 still separates
       the unit from the block around it. */
    @media (max-width: 360px) {
      .line-unit { padding: var(--sp-1); }
      /* line-unit's padding alone (measured) still left the load steppers at 38.8px, 1.2px under
         the 40px floor -- the block's own padding is the next thing spent on chrome instead of
         the control, so it gives up 4px/side here too. */
      .block { padding: var(--sp-2); }
    }
    .work bh-sortable-list ::ng-deep .list { gap: var(--sp-5); }
    /* The bar is the card's HEADER, so it runs edge to edge and pulls back over the card's own
       padding. Inset like everything else it would have read as just another --surface-2 unit
       alongside the line units; attached to the card's top edge it cannot be mistaken for one. */
    /* --sp-3, not --sp-2: copy and remove were the same size, same colour, adjacent, and a P1
       finding called reaching for one and hitting the other "half the defect" -- a wider gap
       between every pair (chevron/name included, harmless) is the cheap fix that separates them
       without a spacer column. */
    .bar { display: grid; grid-template-columns: var(--tap) minmax(0, 1fr) var(--tap) var(--tap);
      gap: var(--sp-3); align-items: center; box-sizing: border-box;
      min-height: var(--tap); padding: var(--sp-1) var(--sp-2);
      margin: calc(var(--sp-3) * -1) calc(var(--sp-3) * -1) 0;
      background: var(--surface-2); border-bottom: 1px solid var(--hairline);
      border-radius: calc(var(--r-card) - 1px) calc(var(--r-card) - 1px) 0 0; }
    /* Cancel/Remove are text buttons (bh-button), far wider than the tap-square icons they
       replace -- the trailing two columns size to content instead of a fixed --tap. */
    .bar.confirming { grid-template-columns: var(--tap) minmax(0, 1fr) auto auto; }
    /* The drag handle only exists (bh-sortable-list's canDragItem) while the block is collapsed,
       riding absolutely over the row's top-left -- so only then does the bar need to step around
       it. Expanded, there is no handle to clear. */
    .bar.with-handle { padding-left: calc(var(--tap) + var(--sp-3)); }
    .chevron { min-width: var(--tap); min-height: var(--tap); background: none; border: 0;
      color: var(--bone); border-radius: var(--r-ctl); cursor: pointer;
      display: flex; align-items: center; justify-content: center; }
    .chevron:hover { color: var(--bone-dim); }
    .chevron:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* One glyph, rotated -- never two glyphs swapped. Right-pointing at rest, rotated to point
       down once expanded (spec: "arrow to the right" reads as the collapsed state). */
    .chev { display: inline-block; font-size: var(--fs-body); transform: rotate(90deg);
      transition: transform var(--dur) var(--ease-out); }
    .chevron.collapsed .chev { transform: rotate(0deg); }
    @media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
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
    /* Collapsed summary: quiet, mono, matching the eyebrow's register -- a measured fact about
       the block's content, not prose. */
    .summary { margin: 0; font-family: var(--font-mono); font-size: var(--fs-sm);
      color: var(--bone-dim); }
    /* Mobile first: the movement is the line's subject, so at 360px it gets a full-width row of
       its own, with reps and load each getting one too and remove staying up on the movement
       row. Squeezing all four onto one line left the movement button about 40px wide -- the most
       important control on the row, collapsed. Putting reps and load side by side on a second
       row was no better, measured (not estimated) on the real render: two --tap steppers need
       --tap + input + --tap plus two --sp-2 gaps each, 104px of chrome apiece, before a single
       digit is visible -- in a 260px row that left the reps input 6px wide and squeezed load's kg
       suffix out of the row entirely. So each stepper gets its own full-width row: a line runs
       four rows tall instead of three, and that is the trade -- a legible, tappable control over
       a dense one. minmax(0, 1fr) throughout, never a bare 1fr: a grid item's automatic minimum
       is its min-content size, so a long movement name would otherwise force horizontal scroll. */
    .lrow { display: grid; grid-template-columns: minmax(0, 1fr) var(--tap);
      grid-template-areas: "mv rm" "reps reps" "load load";
      gap: var(--sp-2); align-items: center; }
    .lrow > .mv { grid-area: mv; }
    .lrow > .r-reps { grid-area: reps; }
    .lrow > .r-load { grid-area: load; }
    .lrow > .r-rm { grid-area: rm; }

    .srow { display: grid; grid-template-columns: auto minmax(0, 1fr) var(--tap);
      grid-template-areas: "arrow mv rm" "arrow reps reps" "arrow load load";
      gap: var(--sp-2); align-items: center; padding-left: var(--sp-3); }
    .srow > .arrow { grid-area: arrow; }
    .srow > .mv { grid-area: mv; }
    .srow > .r-reps { grid-area: reps; }
    .srow > .r-load { grid-area: load; }
    .srow > .r-rm { grid-area: rm; }
    /* Below 360px the arrow column costs width the steppers need more than its indent is worth.
       A zero-width track still keeps its grid-gap, so the fix drops the track (and the glyph)
       entirely rather than shrinking it -- measured: a zero-width column left the load steppers at
       38.8px/30.8px, 1-9px under the 40px floor, because the gap survived. The element stays in
       the DOM (aria-hidden already, so nothing is lost for a11y) for the wider breakpoints below. */
    @media (max-width: 360px) {
      .srow { grid-template-columns: minmax(0, 1fr) var(--tap); padding-left: 0;
        grid-template-areas: "mv rm" "reps reps" "load load"; }
      .srow > .arrow { display: none; }
    }

    /* One line fits comfortably once there is room for it. A stepper's label moved inline with its
       buttons (user-ruled 2026-09-10): 3.5rem label + gap + two --tap buttons + suffix now share
       the same column that used to hold only the input, so 12rem -- sized when the label sat above
       the control -- collapses the input to a sliver. Reps and load are budgeted separately because
       load also carries the unit suffix:
       reps: 56 (label) + 8 + 44 (minus) + 8 + 64 (input) + 8 + 44 (plus) = 232px -> 15rem
       load: reps + ~29px suffix + gap                                    = 272px -> 17rem
       and the breakpoint moves with them -- 760px was measured for the old 12rem/12rem budget and
       collapses the new one just as badly. 1080px is where reps(240) + load(272) + remove(44) +
       3 gaps + the movement control's own minimum actually fit. */
    @media (min-width: 1080px) {
      .lrow { grid-template-columns: minmax(0, 1fr) 15rem 17rem var(--tap);
        grid-template-areas: "mv reps load rm"; }
      .srow { grid-template-columns: auto minmax(0, 1fr) 15rem 17rem var(--tap);
        grid-template-areas: "arrow mv reps load rm"; }
    }
    .arrow { color: var(--faint); font-size: var(--fs-sm); }
    /* A part authored elsewhere still renders, flat -- nothing indents, no border, no card. Just
       a muted label over its lines so the content is not silently lost on screen. */
    .subgroup { display: flex; flex-direction: column; gap: var(--sp-1); width: 100%; }
    .subhead { margin: 0; font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: 700;
      letter-spacing: 0.06em; color: var(--bone-dim); }
    .subline { margin: 0; font-size: var(--fs-body); color: var(--bone); }

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
    /* The block-remove control is a delete affordance -- danger-bordered ghost, same rule bh-button
       gives ghost-danger, distinguishing it from copy's plain --bone-dim glyph. It fires
       immediately on an empty block or arms the confirm pair otherwise; either way it opens (or
       is) the destructive action, never the fill law reserves for the control that executes one. */
    .mini.danger { border: 1px solid var(--danger); color: var(--danger); }
    .mini.danger:hover { color: var(--danger); background: var(--surface-2); }

    /* +block / +line / +scaling option: full width and --tap-lg on mobile, called out by name
       ("the button +block +line etc are too small, we are in mobile!"). */
    .add { width: 100%; min-height: var(--tap-lg); padding: 0 var(--sp-3); background: none;
      border: 1px dashed var(--faint); border-radius: var(--r-ctl); color: var(--bone-dim);
      font-family: var(--font-body); font-size: var(--fs-body); font-weight: 500; cursor: pointer; }
    /* Nested inside .line-unit (--surface-2): a step DOWN in fill separates it from its container
       without a second border weight. */
    .add.sub { background: var(--surface); }
    .add:hover { color: var(--bone); border-color: var(--bone-dim); }
    .add:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .check { display: flex; align-items: center; gap: var(--sp-3); min-height: var(--tap);
      color: var(--bone); font-size: var(--fs-body); cursor: pointer; }

    /* ---- sheet rows: replaces bh-segmented pills with full-width tappable rows (law: "not those
       thing that are headers list"). Selected is marked by a check glyph -- no volt spent here,
       the meta strip's WHAT chip already carries this screen's one volt element. */
    .rows { display: flex; flex-direction: column; width: 100%; }
    .prow { display: flex; align-items: center; justify-content: space-between; width: 100%;
      box-sizing: border-box; min-height: var(--tap-lg); padding: 0 var(--sp-2); background: none;
      border: none; border-bottom: 1px solid var(--hairline); color: var(--bone); text-align: left;
      font-family: var(--font-body); font-size: var(--fs-body); cursor: pointer; }
    .rows .prow:last-child { border-bottom: none; }
    .prow:hover { background: var(--surface-2); }
    .prow:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .prow.sel { font-weight: 700; }
    .mark { color: var(--bone); font-weight: 700; }
    /* REST is a different kind of answer than a block, not another block: a top hairline separates
       it, same as .free in pick-sheet.component.ts. */
    .rest-row { border-top: 1px solid var(--hairline); }

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
  /** Minutes on screen, seconds on the wire (timeCapSeconds) -- the runner already reads the cap
   *  in seconds. Whole minutes only: a 90-second cap cannot be expressed.
   *  ponytail: deliberate ceiling, not an oversight -- add sub-minute precision if a coach asks. */
  timeCapMinutes = signal<string>('');
  blocks = signal<WodBlock[]>([]);
  /** Per-block collapse state, client-only -- never sent to the server. Parallel to `blocks`, kept
   *  in lockstep by every op that changes `blocks`' shape (including a splice inside moveBlock),
   *  so a collapsed flag follows the block it was set on rather than staying pinned to an index. */
  collapsed = signal<boolean[]>([]);
  /** Copy fills this; paste appends a clone of it. Component state only -- never sent to the
   *  server, does not survive a reload. There is deliberately no replace and no cut. */
  clipboard = signal<WodBlock | null>(null);
  private clipboardLabel = signal('');
  /** The block armed for a two-step remove, or null. Only one block at a time: cancelling,
   *  collapsing that block, or arming a different one all clear it -- an armed confirm left on a
   *  block the coach has navigated away from is a trap. */
  confirmRemove = signal<number | null>(null);
  pasteButtonLabel = computed(() =>
    $localize`:@@piece.block.paste:Paste "${this.clipboardLabel()}:name:"`);
  /** The box's load unit, read once on init. A failed fetch just leaves the KG default. */
  weightUnit = signal<'KG' | 'LB'>('KG');
  scoreable = signal(true);
  scoreType = signal('TIME');
  teamSize = signal(1);
  teamShare = signal('TOGETHER');
  saveToLibrary = signal(false);

  titleError = signal('');
  formError = signal('');
  pending = signal(false);
  /** A visible "Saved" moment before navigating away -- router.navigate() right after success left
   *  the only feedback as "you are already elsewhere," which is silent on gym wifi, the moment
   *  reassurance matters most. */
  saved = signal(false);

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

  pickMacro(v: string) {
    this.macro.set(v);
    this.openSheet.set(null);
  }

  pickTeamSize(n: number) {
    this.teamSize.set(n);
    this.openSheet.set(null);
  }

  pickTeamShare(v: string) {
    this.teamShare.set(v);
    this.openSheet.set(null);
  }

  metaPresetLabel = computed(() => {
    const p = this.timingPreset();
    // NOT "Custom": that is one of the legacy wodType values this milestone exists to retire, and
    // showing it here reads as if the piece has been typed rather than simply having no preset yet.
    return p ? (PRESET_LABELS[p] ?? p) : $localize`:@@piece.timing.chip.none:Not set`;
  });

  metaScoreLabel = computed(() =>
    this.scoreOptions.find(o => o.value === this.scoreChoice())?.label ?? this.scoreChoice());

  metaTeamLabel = computed(() => this.teamSize() === 1
    ? '1'
    : $localize`:@@piece.team.chip.value:Team of ${this.teamSize()}:count:`);

  // ---- pick sheet -------------------------------------------------------------------------

  pickOpen = signal(false);
  movementRows = signal<PickRow[]>([]);
  private pickTarget: PickTarget | null = null;

  /**
   * Indexed once on init (spec: "122 rows, one request, no per-line lookups") and topped up by
   * every search result and every create, since a movement found only through search or created
   * just now is not yet in the initial fetch. A saved line carries movementId + text only, never
   * the movement record, so this is the only way a line finds out what it is measured in.
   * A failed fetch just leaves the map empty -- every line then degrades to the free-text case
   * below rather than breaking.
   */
  movementsById = signal<Map<string, Movement>>(new Map());
  createPending = signal(false);
  createError = signal('');

  private mergeMovements(ms: Movement[]) {
    this.movementsById.update(map => {
      const next = new Map(map);
      for (const m of ms) next.set(m.id, m);
      return next;
    });
  }

  private resolveMovement(entry: { movementId?: string }): Movement | null {
    return entry.movementId ? this.movementsById().get(entry.movementId) ?? null : null;
  }

  /** No id, or an id this session hasn't resolved yet: the FULL vocabulary, and loadable -- the
   *  editor cannot know better, and hiding a control the coach might need is worse than an unused one. */
  unitsOf(entry: { movementId?: string }): readonly string[] {
    return this.resolveMovement(entry)?.units ?? MOVEMENT_UNITS;
  }

  loadableOf(entry: { movementId?: string }): boolean {
    return this.resolveMovement(entry)?.loadable ?? true;
  }

  unitOf(entry: { movementId?: string; unit?: string }): string {
    return entry.unit || this.unitsOf(entry)[0] || 'REPS';
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('wodId') ?? this.route.snapshot.paramMap.get('id');
    // Only a standalone wods/:id route names a wod. On the class route :id is the session, so
    // there is never a wod id there and this branch never runs for a class piece.
    if (this.standalone() && id) this.load(id);
    // Create, not edit: the page must never open on the empty state. load() resets blocks itself
    // and always wins, so seeding here only ever applies to a genuinely new piece.
    else { this.blocks.set([{ label: '', lines: [], blocks: [] }]); this.collapsed.set([false]); }

    // Read-once, best-effort: a failed fetch just leaves the KG default in place.
    this.prog.weightUnit().subscribe({ next: u => this.weightUnit.set(u), error: () => {} });
    // Read-once catalogue fetch for unit/loadable metadata -- see movementsById's doc comment.
    this.prog.movements().subscribe({ next: ms => this.mergeMovements(ms), error: () => {} });
  }

  openPick(block: number, line: number, scale: number | null) {
    this.pickTarget = { block, line, scale };
    this.movementRows.set([]);
    this.createError.set('');
    this.createPending.set(false);
    this.pickOpen.set(true);
    this.searchMovements('');
  }

  /**
   * The sheet does not filter — it hands back the debounced term and the server does the matching,
   * so an alias the server knows about is not hidden by a second filter on this side. Every result
   * is also merged into movementsById so a movement found only through search still resolves.
   */
  searchMovements(term: string) {
    this.prog.movements(term).subscribe({
      next: ms => {
        this.mergeMovements(ms);
        this.movementRows.set(ms.map(m => ({ id: m.id, primary: m.name, secondary: movementCategoryLabel(m.category) })));
      },
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
      // Free text has no movement behind it: full vocabulary, loadable, default unit REPS. The
      // pick REPLACES whatever the line had, per spec (swapping movements must not leave a stale unit).
      const patch: Partial<WodLine> = { text: result.freeText, movementId: undefined, unit: 'REPS' };
      if (t.scale === null) this.setLine(t.block, t.line, patch);
      else this.setScale(t.block, t.line, t.scale, patch);
      return;
    }

    const m = this.movementsById().get(result.id);
    const row = this.movementRows().find(r => r.id === result.id);
    const patch: Partial<WodLine> = {
      text: m?.name ?? row?.primary ?? '',
      movementId: result.id,
      unit: m?.units[0] ?? 'REPS',
    };
    // Clear a stored load only on an explicit pick, never silently on load of an existing piece.
    if (!(m?.loadable ?? true)) patch.load = undefined;
    if (t.scale === null) this.setLine(t.block, t.line, patch);
    else this.setScale(t.block, t.line, t.scale, patch);
  }

  closePick() {
    this.pickOpen.set(false);
    this.pickTarget = null;
    this.createError.set('');
    this.createPending.set(false);
  }

  /** bh-pick-sheet's create step posts { name, units, loadable, category }; the editor just
   *  forwards it, it owns the actual call. */
  onCreateMovement(payload: { name: string; units: string[]; loadable: boolean; category: string }) {
    this.createPending.set(true);
    this.createError.set('');
    this.prog.createMovement({ name: payload.name, category: payload.category, units: payload.units, loadable: payload.loadable })
      .subscribe({
        next: m => {
          this.createPending.set(false);
          this.mergeMovements([m]);
          const t = this.pickTarget;
          this.closePick();
          if (!t) return;
          const patch: Partial<WodLine> = { text: m.name, movementId: m.id, unit: m.units[0] ?? 'REPS' };
          if (!m.loadable) patch.load = undefined;
          if (t.scale === null) this.setLine(t.block, t.line, patch);
          else this.setScale(t.block, t.line, t.scale, patch);
        },
        error: () => {
          this.createPending.set(false);
          // Stay on step two: a failed create must never cost the coach what they typed.
          this.createError.set($localize`:@@piece.pick.createError:That did not create — try again.`);
        },
      });
  }

  // ---- unit picker sheet --------------------------------------------------------------------

  /** Which line/scale's unit sheet is open. Own signal, same pattern as segPick -- openSheet is a
   *  fixed string union and must not be widened for this. */
  unitPick = signal<PickTarget | null>(null);

  openUnitPick(block: number, line: number, scale: number | null) {
    this.unitPick.set({ block, line, scale });
  }

  private unitPickEntry(): WodLine | WodScale | undefined {
    const t = this.unitPick();
    if (!t) return undefined;
    return t.scale === null ? this.blocks()[t.block]?.lines?.[t.line] : this.scalesOf(t.block, t.line)[t.scale];
  }

  unitPickOptions = computed<readonly string[]>(() => {
    const entry = this.unitPickEntry();
    return entry ? this.unitsOf(entry) : [];
  });

  unitPickCurrent = computed<string | null>(() => {
    const entry = this.unitPickEntry();
    return entry ? this.unitOf(entry) : null;
  });

  pickUnit(u: string) {
    const t = this.unitPick();
    if (!t) return;
    if (t.scale === null) this.setLine(t.block, t.line, { unit: u });
    else this.setScale(t.block, t.line, t.scale, { unit: u });
    this.unitPick.set(null);
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
    this.timeCapMinutes.set('');
    this.blocks.set([]);
    this.collapsed.set([]);
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
        this.timeCapMinutes.set(w.timeCapSeconds != null ? String(Math.round(w.timeCapSeconds / 60)) : '');
        this.blocks.set([...(w.blocks?.blocks ?? [])]);
        // Loaded blocks are expanded, same as a new one.
        this.collapsed.set(this.blocks().map(() => false));
        this.scoreType.set(w.scoreType || 'TIME');
        this.teamSize.set(w.teamSize || 1);
        this.teamShare.set(w.teamShare || 'TOGETHER');
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  // ---- timing -----------------------------------------------------------------------------

  /** EMOM / Tabata / Interval are a repeating work-rest pattern; the other two are one number. */
  hasSegments = computed(() => SEGMENTED_PRESETS.includes(this.timingPreset() ?? ''));
  hasCap = computed(() => this.timingPreset() === 'FOR_TIME' || this.timingPreset() === 'AMRAP');

  /** The steppers' own inline labels -- constant text, so no need to be a computed. */
  readonly SEG_SEC_LABEL = $localize`:@@piece.segment.secLabel:SEC`;
  readonly ROUNDS_LABEL = $localize`:@@piece.rounds.label:Rounds`;

  capLabel = computed(() => this.timingPreset() === 'AMRAP'
    ? $localize`:@@piece.cap.durationLabel:DURATION`
    : $localize`:@@piece.cap.timeCapLabel:TIME CAP`);
  capAriaLabel = computed(() => this.timingPreset() === 'AMRAP'
    ? $localize`:@@piece.cap.durationAria:Duration in minutes`
    : $localize`:@@piece.cap.timeCapAria:Time cap in minutes`);
  capUnit = $localize`:@@piece.cap.unit:min`;

  /** A preset SEEDS the sequence. It never constrains it: later edits leave the name in place.
   *  Picking a row applies and closes the sheet -- the segment sequence it seeds is edited in its
   *  own section on the page, not inside the picker. */
  pickPreset(preset: string) {
    this.timingPreset.set(preset);
    const seed = PRESET_SEEDS[preset];
    if (seed) {
      this.rounds.set(seed.rounds);
      // A piece opens with one block, so the common case should not open already incomplete: seed
      // each WORK segment pointing at block 0 when a block already exists. Seeded REST gets none.
      const hasBlock = this.blocks().length > 0;
      this.segments.set(seed.segments.map(s =>
        s.kind === 'WORK' && hasBlock ? { ...s, blockIndex: 0 } : { ...s }));
    } else {
      // FOR_TIME and AMRAP carry no segment sequence -- a preset written before today may still
      // have one stored (data written under the old rule), so clear it rather than leave it
      // invisible-but-saveable, same as pickTimingNone already does.
      this.segments.set([]);
      this.rounds.set(1);
    }
    // AMRAP defaults to 20 minutes; a for-time cap is optional and often has none; every other
    // preset has no cap/duration control at all, so it never carries a stale value.
    this.timeCapMinutes.set(preset === 'AMRAP' ? '20' : '');
    this.openSheet.set(null);
  }

  /** A UI-level null, not a new preset value -- the server already models an absent preset as
   *  null, so "None" just clears what a preset would otherwise seed. */
  pickTimingNone() {
    this.timingPreset.set(null);
    this.segments.set([]);
    this.rounds.set(1);
    this.timeCapMinutes.set('');
    this.openSheet.set(null);
  }

  updateSegment(i: number, seg: WodSegment) {
    this.segments.update(list => list.map((s, idx) => idx === i ? seg : s));
  }

  private setSegment(i: number, patch: Partial<WodSegment>) {
    this.segments.update(list => list.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  /** bh-number-stepper's value is a raw string; segments carry seconds as a number. */
  segSecondsStr(i: number): string {
    return String(this.segments()[i]?.seconds ?? '');
  }

  /** The server rejects a segment at zero or below with SEGMENT_SECONDS, so a value the stepper
   *  produced (or the coach typed straight into its input) below 1 is clamped here, not just
   *  guarded by the stepper's own decrease button. */
  onSegSecondsChange(i: number, v: string) {
    if (!this.segments()[i]) return;
    const n = Number(v);
    this.setSegment(i, { seconds: v !== '' && Number.isFinite(n) && n >= 1 ? n : 1 });
  }

  /** Same reasoning as onSegSecondsChange: the stepper's own min blocks the buttons, but a typed
   *  value still needs clamping before it reaches the rounds signal. */
  onRoundsChange(v: string) {
    const n = Number(v);
    this.rounds.set(v !== '' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);
  }

  roundsStr(): string {
    return String(this.rounds());
  }

  // ---- segment -> block picker --------------------------------------------------------------

  /** Which segment's picker sheet is open. openSheet is a fixed string union and cannot carry
   *  this, so it gets its own signal -- reset to null on (closed), same contract as openSheet. */
  segPick = signal<number | null>(null);

  segPickTarget = computed<WodSegment | null>(() => {
    const i = this.segPick();
    return i === null ? null : (this.segments()[i] ?? null);
  });

  /** null when the segment is REST, or WORK with no (or a dangling) blockIndex -- both cases
   *  render the "Choose a block" placeholder in the template. */
  segmentBlockLabel(seg: WodSegment): string | null {
    if (seg.kind !== 'WORK' || seg.blockIndex == null) return null;
    const b = this.blocks()[seg.blockIndex];
    return b ? this.blockLabeller(b, seg.blockIndex) : null;
  }

  openSegPick(i: number) {
    this.segPick.set(i);
  }

  pickSegBlock(blockIndex: number) {
    const i = this.segPick();
    if (i === null) return;
    this.setSegment(i, { kind: 'WORK', blockIndex });
    this.segPick.set(null);
  }

  /** The backend rejects a REST segment that still names a block with SEGMENT_BLOCK, so blockIndex
   *  must be cleared, not just kind flipped. */
  pickSegRest() {
    const i = this.segPick();
    if (i === null) return;
    this.setSegment(i, { kind: 'REST', blockIndex: undefined });
    this.segPick.set(null);
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
    // New blocks are expanded.
    this.collapsed.update(list => [...list, false]);
  }

  removeBlock(i: number) {
    this.blocks.update(list => list.filter((_, idx) => idx !== i));
    this.collapsed.update(list => list.filter((_, idx) => idx !== i));
    // A segment pointing AT the removed block loses its reference (falls back to "Choose a
    // block"); one pointing above it shifts down to follow the block it named.
    this.segments.update(list => list.map(s => {
      if (s.kind !== 'WORK' || s.blockIndex == null) return s;
      if (s.blockIndex === i) return { ...s, blockIndex: undefined };
      if (s.blockIndex > i) return { ...s, blockIndex: s.blockIndex - 1 };
      return s;
    }));
  }

  /** Whether block i has anything a remove would cost -- a confirm on nothing is friction for its
   *  own sake, so an empty block keeps the one-tap remove it always had. */
  private blockHasContent(i: number): boolean {
    const b = this.blocks()[i];
    return !!b && ((b.lines?.length ?? 0) > 0 || (b.blocks?.length ?? 0) > 0);
  }

  /** The bar's remove control: arms the confirm pair for a block with something to lose, or
   *  removes an empty one immediately. */
  onRemoveBlockClick(i: number) {
    if (this.blockHasContent(i)) this.confirmRemove.set(i);
    else this.removeBlock(i);
  }

  cancelRemoveBlock() {
    this.confirmRemove.set(null);
  }

  confirmRemoveBlock(i: number) {
    this.confirmRemove.set(null);
    this.removeBlock(i);
  }

  copyBlock(i: number) {
    const b = this.blocks()[i];
    if (!b) return;
    // Clone on copy so later edits to the source never leak into the clipboard.
    this.clipboard.set(structuredClone(b));
    this.clipboardLabel.set(this.blockLabeller(b, i));
  }

  pasteBlock() {
    const c = this.clipboard();
    if (!c) return;
    // Clone on paste even though the clipboard is about to be cleared -- costs nothing, and keeps
    // this honest if the clipboard ever survives a paste again (user-ruled 2026-09-10: it doesn't
    // today. Paste the block, then press copy again to paste it a second time).
    this.blocks.update(list => [...list, structuredClone(c)]);
    this.collapsed.update(list => [...list, false]);
    this.clipboard.set(null);
    this.clipboardLabel.set('');
  }

  copyBlockLabel(i: number) {
    const b = this.blocks()[i];
    return $localize`:@@piece.block.copyAria:Copy ${b ? this.blockLabeller(b, i) : ''}:block:`;
  }

  setBlockLabel(i: number, label: string) {
    this.blocks.update(list => list.map((b, idx) => idx === i ? { ...b, label } : b));
  }

  isCollapsed(i: number): boolean {
    return this.collapsed()[i] ?? false;
  }

  toggleCollapse(i: number) {
    this.collapsed.update(list => list.map((c, idx) => idx === i ? !c : c));
    // A confirm armed on the block being collapsed is a trap otherwise -- it would sit hidden
    // behind the collapsed summary, still live.
    if (this.confirmRemove() === i) this.confirmRemove.set(null);
  }

  /** A class field, not an inline arrow: reordering is only offered on a collapsed block, so an
   *  expanded one renders no drag handle at all. */
  canDragBlock = (_b: WodBlock, i: number) => this.isCollapsed(i);

  /** Quiet mono summary shown in place of a collapsed block's content: the line count, plus the
   *  first movement named on one of those lines, if any. */
  /** Split one/other rather than interpolating a bare count -- a raw `${n} lines` reads "1 lines"
   *  on a one-line block, and a plural rule other than English's needs the branch anyway, same
   *  pattern as messages-envelope.component.ts's linkAriaLabel. */
  blockSummary(i: number): string {
    const lines = this.blocks()[i]?.lines ?? [];
    const first = lines.find(l => l.text)?.text;
    const n = lines.length;
    if (first) {
      return n === 1
        ? $localize`:@@piece.block.summaryWithMovement.one:1 line · ${first}:movement:`
        : $localize`:@@piece.block.summaryWithMovement.many:${n}:count: lines · ${first}:movement:`;
    }
    return n === 1
      ? $localize`:@@piece.block.summary.one:1 line`
      : $localize`:@@piece.block.summary.many:${n}:count: lines`;
  }

  collapseLabel(i: number) {
    return this.isCollapsed(i)
      ? $localize`:@@piece.block.expandAria:Expand block ${i + 1}:position:`
      : $localize`:@@piece.block.collapseAria:Collapse block ${i + 1}:position:`;
  }

  /**
   * bh-sortable-list is presentational and never mutates items(), so the array is spliced here.
   * `collapsed` is spliced the same way in the same call, so a block's collapse state follows the
   * block itself across a reorder rather than staying pinned to the index it used to occupy.
   */
  moveBlock(move: { from: number; to: number }) {
    // Build the permutation once, the same way blocks itself is spliced, rather than hand-deriving
    // the three-case arithmetic. perm[newPos] = oldIndex once spliced, so inverting it gives
    // oldToNew[oldIndex] = newPos -- what a segment's blockIndex needs to follow the move.
    const perm = this.blocks().map((_, idx) => idx);
    const [movedIdx] = perm.splice(move.from, 1);
    perm.splice(move.to, 0, movedIdx);
    const oldToNew = new Array<number>(perm.length);
    perm.forEach((oldIdx, newPos) => { oldToNew[oldIdx] = newPos; });

    this.blocks.update(list => {
      const next = [...list];
      const [item] = next.splice(move.from, 1);
      next.splice(move.to, 0, item);
      return next;
    });
    this.collapsed.update(list => {
      const next = [...list];
      const [item] = next.splice(move.from, 1);
      next.splice(move.to, 0, item);
      return next;
    });
    this.segments.update(list => list.map(s => {
      if (s.kind !== 'WORK' || s.blockIndex == null) return s;
      const mapped = oldToNew[s.blockIndex];
      return mapped === undefined ? s : { ...s, blockIndex: mapped };
    }));
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

  /** Picking a row applies the value and closes the sheet, same as every other meta sheet. */
  pickScore(choice: string) {
    if (choice === 'NOT_SCORED') { this.scoreable.set(false); this.openSheet.set(null); return; }
    this.scoreable.set(true);
    this.scoreType.set(choice);
    this.openSheet.set(null);
  }

  // ---- accessible names ----------------------------------------------------------------------

  secondsLabel(i: number) { return $localize`:@@piece.segment.secondsAria:Seconds for segment ${i + 1}:position:`; }
  removeSegmentLabel(i: number) { return $localize`:@@piece.segment.removeAria:Remove segment ${i + 1}:position:`; }
  blockNameLabel(i: number) { return $localize`:@@piece.block.nameAria:Name of block ${i + 1}:position:`; }
  removeBlockLabel(i: number) { return $localize`:@@piece.block.removeAria:Remove block ${i + 1}:position:`; }
  /** Read-only sub-block heading fallback -- there is no way to create a part, but one loaded
   *  from the server without a label still needs a name to render. */
  subBlockFallback(j: number) { return $localize`:@@piece.subBlock.fallback:Part ${j + 1}:position:`; }
  repsLabel(i: number, j: number) { return $localize`:@@piece.line.repsAria:Reps for line ${j + 1}:position:`; }
  loadLabel(i: number, j: number) { return $localize`:@@piece.line.loadAria:Load in ${this.weightUnit()}:unit: for line ${j + 1}:position:`; }
  removeLineLabel(i: number, j: number) { return $localize`:@@piece.line.removeAria:Remove line ${j + 1}:position:`; }
  scaleRepsLabel(i: number, j: number, k: number) { return $localize`:@@piece.scale.repsAria:Reps for scaling option ${k + 1}:position:`; }
  scaleLoadLabel(i: number, j: number, k: number) { return $localize`:@@piece.scale.loadAria:Load in ${this.weightUnit()}:unit: for scaling option ${k + 1}:position:`; }
  removeScaleLabel(i: number, j: number, k: number) { return $localize`:@@piece.scale.removeAria:Remove scaling option ${k + 1}:position:`; }

  // ---- save ----------------------------------------------------------------------------------

  /**
   * The guard lives here and not only on the button: Enter submits a form regardless of any
   * [disabled], and a native disabled attribute also drops the pressed control out of the a11y tree.
   */
  submit(event?: Event) {
    event?.preventDefault();
    if (this.pending() || this.saved()) return;

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
      // An invisible segment sequence (e.g. one stored under an old FOR_TIME/AMRAP preset) must
      // never be re-saved: it never renders, so it can never have been reviewed.
      timing: { rounds: this.rounds(), segments: this.hasSegments() ? this.segments() : [] },
      timeCapSeconds: this.hasCap() && this.timeCapMinutes() !== ''
        ? Number(this.timeCapMinutes()) * 60
        : null,
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
        // pending false, saved true: the button reads "Saved" rather than fighting a spinner. The
        // delay is the feature, not a cost -- "you are already elsewhere" is silent, and on gym
        // wifi this is the moment reassurance matters most.
        this.pending.set(false);
        this.saved.set(true);
        setTimeout(() => {
          if (this.standalone()) this.router.navigate(['/coach/wods']);
          else this.router.navigate(['/coach/classes', this.sessionId, 'build']);
        }, 600);
      },
      error: () => {
        this.pending.set(false);
        // The input is left exactly as typed — a failed save must never cost the coach the piece.
        this.formError.set($localize`:@@piece.save.error:That did not save — try again.`);
      },
    });
  }
}
