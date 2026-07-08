import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { GuidedJourneyService, JourneyStep } from '../../../core/services/guided-journey.service';

@Component({
  selector: 'erp-guided-journey',
  standalone: false,
  templateUrl: './guided-journey.component.html',
  styleUrls: ['./guided-journey.component.scss']
})
export class GuidedJourneyComponent {
  open = false;

  constructor(public j: GuidedJourneyService, private router: Router) {}

  get steps(): JourneyStep[] { return this.j.steps; }
  get hidden(): boolean { return this.j.hidden(); }

  toggle(): void { this.open = !this.open; }

  go(step: JourneyStep): void {
    this.router.navigate([step.route], step.query ? { queryParams: step.query } : {});
    this.open = false;
  }

  done(step: JourneyStep, ev: Event): void {
    ev.stopPropagation();
    this.j.markDone(step.id);
  }

  restart(): void { this.j.reset(); }

  hideForever(): void { this.j.setHidden(true); this.open = false; }
}
