import { AfterViewInit, Directive, DoCheck, ElementRef, Input, OnDestroy, Renderer2 } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { PermissionService } from '../../core/services/permission.service';

type PermissionAction =
  | 'view' | 'create' | 'edit' | 'delete' | 'submit' | 'approve'
  | 'reject' | 'cancel' | 'export' | 'print' | 'post';

/**
 * Opt-out for buttons whose host component already applies the authoritative
 * permission check. Two independent checks on one button means the stricter -
 * and possibly stale - one silently wins.
 */
const NO_PERMISSION_GATE = 'none';

/**
 * Final UI safety-net for action buttons.
 *
 * Existing explicit *ngIf permission checks remain the preferred documentation
 * at the call site. This directive covers legacy screens and form/modal buttons
 * that did not have an explicit check. Non-business controls (Back, Close,
 * Search, Reset, pagination, tabs, etc.) are intentionally left untouched.
 */
@Directive({ selector: 'button', standalone: false })
export class ButtonPermissionDirective implements AfterViewInit, DoCheck, OnDestroy {
  @Input() erpPermissionAction: PermissionAction | typeof NO_PERMISSION_GATE | '' = '';
  @Input() erpPermissionFunction = '';

  private readonly subscriptions = new Subscription();
  private lastSignature = '';
  private ready = false;

  constructor(
    private readonly host: ElementRef<HTMLButtonElement>,
    private readonly renderer: Renderer2,
    private readonly router: Router,
    private readonly permissions: PermissionService
  ) {}

  ngAfterViewInit(): void {
    this.ready = true;
    this.subscriptions.add(this.permissions.changes$.subscribe(() => this.applyPermission()));
    this.subscriptions.add(
      this.router.events.pipe(filter(event => event instanceof NavigationEnd))
        .subscribe(() => this.applyPermission())
    );
    this.applyPermission();
  }

  ngDoCheck(): void {
    if (!this.ready) return;
    const element = this.host.nativeElement;
    const signature = [
      this.router.url,
      this.erpPermissionAction,
      this.erpPermissionFunction,
      element.textContent,
      element.title,
      element.className,
      element.type
    ].join('|');
    if (signature !== this.lastSignature) this.applyPermission(signature);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private applyPermission(signature?: string): void {
    const element = this.host.nativeElement;
    const functionId = this.erpPermissionFunction || this.resolveFunctionId(this.router.url);
    const action = (this.erpPermissionAction || this.inferAction(element, this.router.url)) as
      PermissionAction | typeof NO_PERMISSION_GATE | '';
    this.lastSignature = signature ?? [
      this.router.url, this.erpPermissionAction, this.erpPermissionFunction,
      element.textContent, element.title, element.className, element.type
    ].join('|');

    // The component owns this button's visibility; stay out of its way.
    if (action === NO_PERMISSION_GATE) {
      this.renderer.removeStyle(element, 'display');
      this.renderer.removeAttribute(element, 'aria-hidden');
      return;
    }

    // Login/account controls and buttons without a business action are not RBAC actions.
    if (!functionId || !action) {
      this.renderer.removeStyle(element, 'display');
      return;
    }

    const allowed = this.isAllowed(action, functionId);
    if (allowed) {
      this.renderer.removeStyle(element, 'display');
      this.renderer.removeAttribute(element, 'aria-hidden');
    } else {
      this.renderer.setStyle(element, 'display', 'none');
      this.renderer.setAttribute(element, 'aria-hidden', 'true');
    }
  }

  private isAllowed(action: PermissionAction, functionId: string): boolean {
    switch (action) {
      case 'view': return this.permissions.canView(functionId);
      case 'create': return this.permissions.canCreate(functionId);
      case 'edit': return this.permissions.canEdit(functionId);
      case 'delete': return this.permissions.canDelete(functionId);
      case 'submit': return this.permissions.canSubmit(functionId);
      case 'approve': return this.permissions.canApprove(functionId);
      case 'reject': return this.permissions.canReject(functionId);
      case 'cancel': return this.permissions.canCancel(functionId);
      case 'export': return this.permissions.canExport(functionId);
      case 'print': return this.permissions.canPrint(functionId);
      case 'post': return this.permissions.canPost(functionId);
    }
  }

  private inferAction(button: HTMLButtonElement, url: string): PermissionAction | '' {
    // `mbtn-*` are the app's generic button styling classes and carry no intent.
    // Leaving them in made every `mbtn-add` button - Columns, Cancel, Apply,
    // Prev/Next, Export - read as a Create action via the \badd\b match, so they
    // all disappeared for anyone without Create on the current screen.
    const classes = String(button.className ?? '').toLowerCase().replace(/\bmbtn-[a-z0-9-]+/g, ' ');
    const value = `${button.textContent ?? ''} ${button.title ?? ''} ${classes}`
      .replace(/\s+/g, ' ').trim().toLowerCase();
    const modeAction: PermissionAction = this.isCreateRoute(url) ? 'create' : 'edit';

    if (/\b(export|download|excel|csv)\b/.test(value)) return 'export';
    if (/\bprint\b/.test(value)) return 'print';
    if (/\breject\b/.test(value)) return 'reject';
    if (/\bapprove(d|val)?\b/.test(value)) return 'approve';
    if (/\b(post|finalize|complete production|close period|close year)\b/.test(value)) return 'post';
    if (/\b(delete|trash)\b/.test(value)) return 'delete';
    if (/\bedit\b/.test(value)) return 'edit';

    // Generic form Submit/Save buttons persist a new/existing record. Workflow
    // submit buttons normally include "for approval" and use Submit permission.
    if (/\b(submit for approval|send for approval)\b/.test(value)) return 'submit';
    if (/\b(save|update|submit)\b/.test(value) || button.type === 'submit') return modeAction;

    // Add/remove line operations mutate the current document, not a separate entity.
    if (/\b(remove|add) (line|row|item|another)\b/.test(value)) return modeAction;
    if (/\b(create|new|add)\b/.test(value)) return 'create';

    // Do not treat modal/navigation Cancel and Close as document cancellation.
    if (/\b(cancel|void) (document|order|request|invoice|quotation|note)\b/.test(value)) return 'cancel';
    return '';
  }

  private isCreateRoute(url: string): boolean {
    return /\/(new|create[^/]*)($|\/|\?)/i.test(url);
  }

  private resolveFunctionId(rawUrl: string): string {
    const url = rawUrl.toLowerCase().split('?')[0];
    const routes: Array<[RegExp, string]> = [
      [/^\/app\/(home|dashboard)/, 'home'],
      [/\/user-access|\/business-partners\/users/, 'users'],
      [/\/business-partners\/customers?/, 'bp-customer'],
      [/\/business-partners\/suppliers?/, 'bp-supplier'],

      [/\/sales\/quotations?/, 'qt-list'],
      [/\/sales\/orders?|\/sales-order/, 'so-list'],
      [/\/sales\/picking|pending-fulfillment/, 'sales-pp-list'],
      [/\/sales\/delivery-orders?/, 'do-list2'],
      [/\/sales\/invoices?/, 'si-list'],
      [/\/sales\/credit-notes?/, 'cn-list'],
      [/\/sales\/reports?/, 'sales-report'],

      // must precede the other purchase entries so it is not shadowed
      [/\/purchase\/reports?/, 'purchase-report'],
      [/\/purchase\/requests|purchase-request|purchaserequest/, 'pr-list'],
      [/\/purchase\/orders|purchase-order|purchaseorder/, 'po-list'],
      [/\/purchase\/rfq/, 'rfq'],
      [/\/purchase\/grn|purchasegoodreceipt/, 'grn-list'],
      [/supplier-invoice|supplierinvoice/, 'pin-list'],
      [/debit-note|debitnote/, 'dn-list'],
      [/scorecard/, 'supplier-scorecard'],
      [/mobile-?receiving|mobilereceiving/, 'mobilereceiving'],

      [/item-?master/, 'im-list'],
      [/stock-overview|stack-overview/, 'stock-overview'],
      [/stock-?adjustment/, 'stock-adjustment'],
      [/stock-?transfer-?receipt/, 'list-stock-transfer-receipt'],
      [/stock-?transfer/, 'stock-transfer'],
      [/material-requisi|material-request/, 'mr-list'],
      [/stock-?take/, 'stocktake-list'],
      [/stock-?reorder/, 'reorder-list'],
      [/stock-?cogs/, 'stockcogs'],
      [/stock-history/, 'list-stock-history'],

      [/finance\/chart-of-accounts|financial\/chartofaccount/, 'coa'],
      [/finance\/general-ledger|financial\/ledger/, 'ledger'],
      [/finance\/(create-journal|opening-balance)|financial\/(journal|create-journal|opening-balance)/, 'journal'],
      [/finance\/(accounts-payable|ap-aging|ap-advance)|financial\/(accountpayable|ap-aging|ap-advance)/, 'ap'],
      [/finance\/(ar|ar-invoices|receipts|ar-advance|ar-aging)|financial\/(ar|ar-invoice|ar-receipt|ar-advance|aging)/, 'ar'],
      [/finance\/(tax-gst|gst-return|gst-report|gst-detail)|financial\/(tax-gst|gst-report)/, 'tax'],
      [/period-close/, 'period'],
      [/year-end|year-close/, 'year-end'],
      [/trial-balance|financial\/report/, 'tb'],
      [/finance\/profit-loss|financial\/profitloss/, 'finance-report-profit-loss'],
      [/finance\/balance-sheet|financial\/balance-sheet/, 'finance-report-balance-sheet'],
      [/finance\/arap-aging/, 'finance-report-arap-aging'],
      [/finance\/gst-detail/, 'finance-report-gst-detail'],
      [/finance\/collection-forecast|financial\/forecast/, 'finance-report-collection-forecast'],
      [/finance\/daybook|financial\/daybook/, 'finance-report-daybook'],
      [/finance\/reports|financial\/finance-report/, 'reports'],
      [/^\/app\/(finance|financial\/dashboard)/, 'finance-dashboard'],

      [/recipe\/recipes/, 'recipe-list'],
      [/recipe\/production-planning/, 'pp-list'],
      [/recipe\/batch-production/, 'bp-list'],

      [/master\/approval-level/, 'approval-level'],
      [/master\/bank/, 'bank'], [/master\/bin/, 'bin'], [/master\/catagory/, 'catagory'],
      [/master\/cities/, 'cities'], [/master\/company/, 'company'],
      [/master\/(coastingmethod|costingmethod)/, 'costingmethod'], [/master\/countries/, 'countries'],
      [/master\/currency/, 'currency'], [/master\/customergroups/, 'customergroups'],
      [/master\/department-menu-access/, 'department-menu-access'], [/master\/department/, 'department'],
      [/master\/driver/, 'driver'], [/master\/exchangerate/, 'exchangerate'],
      [/master\/flagissue/, 'flagissue'], [/master\/incoterms/, 'incoterms'],
      [/master\/itemtype/, 'itemType'], [/master\/location/, 'location'],
      [/master\/itemset/, 'itemSet'], [/master\/paymentterms/, 'paymentTerms'],
      [/master\/recurring/, 'recurring'], [/master\/service/, 'service'],
      [/master\/states/, 'states'], [/master\/stockissue/, 'stockissue'],
      [/master\/strategy/, 'strategy'], [/master\/suppliergroups/, 'suppliergroups'],
      [/master\/taxcode/, 'taxcode'], [/master\/uomconversion/, 'uomconversion'],
      [/master\/uom/, 'uom'], [/master\/vehicle/, 'vehicle'], [/master\/warehouse/, 'warehouse']
    ];
    return routes.find(([pattern]) => pattern.test(url))?.[1] ?? '';
  }
}
