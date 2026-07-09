import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonComponent } from '../../ui/button.component';
import { ProgrammingService, Benchmark } from './programming.service';

@Component({
  selector: 'bh-benchmark-library',
  standalone: true,
  imports: [ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Benchmark library</h2>
      <div class="filters">
        <button class="f" [class.on]="kind() === ''" (click)="kind.set('')">All</button>
        <button class="f" [class.on]="kind() === 'GIRL'" (click)="kind.set('GIRL')">Girls</button>
        <button class="f" [class.on]="kind() === 'HERO'" (click)="kind.set('HERO')">Heroes</button>
      </div>
      <div class="cards">
        @for (b of shown(); track b.id) {
          <div class="card" [attr.data-testid]="'bm-' + b.id">
            <div class="top"><span class="nm">{{ b.name }}</span><span class="kd">{{ b.kind }}</span></div>
            <p class="body">{{ b.bodyText }}</p>
            <div class="foot">
              <span class="sc">{{ b.scoreType }}</span>
              <bh-button size="sm" (click)="use(b)">Use →</bh-button>
            </div>
          </div>
        } @empty { <p class="muted">No benchmarks.</p> }
      </div>
    </section>
  `,
  styles: [`
    .filters { display: flex; gap: 8px; margin-bottom: var(--sp-4); }
    .f { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--faint); font-size: 13px; padding: 6px 12px; cursor: pointer; }
    .f.on { color: var(--bone); border-color: var(--red); }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--sp-4); }
    .card { border: 1px solid var(--hairline); border-radius: var(--edge); padding: var(--sp-4);
      display: flex; flex-direction: column; gap: var(--sp-3); }
    .top { display: flex; justify-content: space-between; align-items: baseline; }
    .nm { font-family: var(--font-display); font-weight: 800; font-size: 20px; text-transform: uppercase; }
    .kd { font-family: var(--font-mono); font-size: 10px; color: var(--faint); }
    .body { font-size: 13px; color: var(--bone-dim); flex: 1; margin: 0; }
    .foot { display: flex; justify-content: space-between; align-items: center; }
    .sc { font-family: var(--font-mono); font-size: 11px; color: var(--faint); }
    .muted { color: var(--bone-dim); }
  `],
})
export class BenchmarkLibraryPage implements OnInit {
  private prog = inject(ProgrammingService);
  private router = inject(Router);

  all = signal<Benchmark[]>([]);
  kind = signal('');
  shown = computed(() => { const k = this.kind(); return k ? this.all().filter(b => b.kind === k) : this.all(); });

  ngOnInit() { this.prog.benchmarks().subscribe(b => this.all.set(b)); }

  use(b: Benchmark) { this.prog.cloneBenchmark(b.id).subscribe(w => this.router.navigate(['/coach/wods', w.id])); }
}
