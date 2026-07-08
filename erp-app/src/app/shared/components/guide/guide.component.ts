import { Component, Input, OnInit } from '@angular/core';

/**
 * Reusable on-screen "How to use this screen" guide.
 * Drop it at the top of any page to explain the workflow to new users:
 *
 *   <erp-guide guideKey="sales-order-list"
 *              title="Sales Orders"
 *              intro="Confirmed customer orders that get delivered and invoiced."
 *              [needs]="['A Customer', 'At least one Item']"
 *              [steps]="['Click + New Sales Order', 'Pick the customer', 'Add item lines with qty & price', 'Save — then create a Delivery Order']">
 *   </erp-guide>
 *
 * Remembers dismissal per guideKey (localStorage) so it never nags; a small
 * "? How to use" pill lets the user reopen it any time.
 */
@Component({
  selector: 'erp-guide',
  standalone: false,
  templateUrl: './guide.component.html',
  styleUrls: ['./guide.component.scss']
})
export class GuideComponent implements OnInit {
  @Input() guideKey = '';
  @Input() title = 'How to use this screen';
  @Input() intro = '';
  @Input() needs: string[] = [];
  @Input() steps: string[] = [];

  open = true;

  private get storeKey(): string { return 'guideDismissed.' + (this.guideKey || this.title); }

  ngOnInit(): void {
    try { this.open = localStorage.getItem(this.storeKey) !== '1'; } catch { this.open = true; }
  }

  close(): void {
    this.open = false;
    try { localStorage.setItem(this.storeKey, '1'); } catch {}
  }

  reopen(): void {
    this.open = true;
    try { localStorage.removeItem(this.storeKey); } catch {}
  }
}
