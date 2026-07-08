import { Injectable } from '@angular/core';

export interface JourneyStep {
  id: string;
  icon: string;
  title: string;
  hint: string;
  route: string;
  query?: Record<string, string>;
}

/**
 * A game-like "Getting Started" journey that walks a new user through the whole
 * catering workflow — one step at a time, showing where to go next and what to do.
 * Progress (completed step ids) is remembered in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class GuidedJourneyService {
  private readonly STORE = 'guidedJourneyDone';
  private readonly HIDE = 'guidedJourneyHidden';

  readonly steps: JourneyStep[] = [
    { id: 'item',       icon: '📦', title: 'Add your first Item',      hint: 'Products & ingredients you buy or sell. Click "+ Create Item", fill Code, Name, Category and UOM, then Save.', route: '/app/inventory/List-itemmaster' },
    { id: 'customer',   icon: '🤝', title: 'Add a Customer',           hint: 'Who you sell to. Open the Customers tab and click "+ Add customer", fill the name & details, Save.', route: '/app/business-partners', query: { tab: 'customers' } },
    { id: 'supplier',   icon: '🏭', title: 'Add a Supplier',           hint: 'Who you buy from. Open the Suppliers tab and add one — needed before Purchase Orders.', route: '/app/business-partners', query: { tab: 'suppliers' } },
    { id: 'quotation',  icon: '📄', title: 'Create a Quotation',       hint: 'A price offer to a customer. Click "+ New QT", pick the customer & currency, add item lines, Save.', route: '/app/sales/quotations' },
    { id: 'salesorder', icon: '🛒', title: 'Confirm a Sales Order',    hint: 'Turn the quotation into a confirmed order. Sales → Sales Order → New, or convert from the quotation.', route: '/app/sales/orders' },
    { id: 'delivery',   icon: '🚚', title: 'Make a Delivery Order',    hint: 'Deliver the goods to the customer. Sales → Delivery Order → New, from the Sales Order.', route: '/app/sales/delivery-orders' },
    { id: 'invoice',    icon: '🧾', title: 'Raise a Sales Invoice',    hint: 'Bill the customer. Sales → Sales Invoice → New, from the Sales Order / Delivery Order.', route: '/app/sales/invoices' },
    { id: 'receipt',    icon: '💰', title: 'Record a Payment',         hint: 'The customer pays. Finance → Accounts Receivable → record a receipt against the invoice.', route: '/app/finance/ar' },
  ];

  private done = new Set<string>();

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.STORE) || '[]');
      if (Array.isArray(raw)) raw.forEach((x: any) => this.done.add(String(x)));
    } catch {}
  }

  isDone(id: string): boolean { return this.done.has(id); }

  markDone(id: string): void {
    this.done.add(id);
    this.persist();
  }

  toggleDone(id: string): void {
    if (this.done.has(id)) this.done.delete(id); else this.done.add(id);
    this.persist();
  }

  reset(): void { this.done.clear(); this.persist(); }

  /** Index of the first step not yet completed (the "current" quest). */
  currentIndex(): number {
    const i = this.steps.findIndex(s => !this.done.has(s.id));
    return i < 0 ? this.steps.length - 1 : i;
  }

  isCurrent(id: string): boolean { return this.steps[this.currentIndex()]?.id === id; }

  doneCount(): number { return this.steps.filter(s => this.done.has(s.id)).length; }
  total(): number { return this.steps.length; }
  progressPct(): number { return Math.round((this.doneCount() / this.total()) * 100); }
  allDone(): boolean { return this.doneCount() >= this.total(); }

  hidden(): boolean { try { return localStorage.getItem(this.HIDE) === '1'; } catch { return false; } }
  setHidden(v: boolean): void { try { localStorage.setItem(this.HIDE, v ? '1' : '0'); } catch {} }

  private persist(): void {
    try { localStorage.setItem(this.STORE, JSON.stringify(Array.from(this.done))); } catch {}
  }
}
