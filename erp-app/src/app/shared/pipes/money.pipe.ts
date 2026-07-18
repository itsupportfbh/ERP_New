import { Pipe, PipeTransform } from '@angular/core';
import { formatNumber } from '@angular/common';
import { CurrencyDisplayService } from '../../core/services/currency-display.service';

/**
 * Money display pipe. Prepends the correct currency symbol to a formatted amount.
 *
 *   {{ amount | money }}                 -> base (company) currency symbol   e.g. "S$1,250.00"
 *   {{ amount | money:doc.currencyId }}  -> document-selected currency       e.g. "RM 1,250.00"
 *   {{ amount | money:currencyId:'1.2-0' }} -> custom digits
 *   {{ amount | money:null:'1.2-2':true }}  -> accounting negatives          e.g. "(RM 1,250.00)"
 *
 * Impure so the symbol appears once the async currency load completes (cheap string work).
 */
@Pipe({ name: 'money', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  constructor(private cur: CurrencyDisplayService) {}

  /**
   * @param brackets Accounting style: render a negative as "(RM 100.00)" instead of "-RM 100.00".
   *                 Opt-in, so every existing caller keeps the leading minus it renders today.
   */
  transform(value: any, currency?: number | string | null, digits: string = '1.2-2', brackets = false): string {
    let symbol: string;
    if (currency === null || currency === undefined || currency === '') {
      symbol = this.cur.baseSymbol();
    } else if (typeof currency === 'number') {
      symbol = currency > 0 ? this.cur.symbolFor(currency) : this.cur.baseSymbol();
    } else {
      symbol = this.cur.symbolForName(currency);
    }
    const sep = /[A-Za-z]$/.test(symbol) ? ' ' : '';

    let num = Number(value);
    if (value === null || value === undefined || value === '' || isNaN(num)) num = 0;
    const neg = num < 0;
    let formatted: string;
    try {
      formatted = formatNumber(Math.abs(num), 'en-US', digits);
    } catch {
      formatted = Math.abs(num).toFixed(2);
    }
    const amount = `${symbol}${sep}${formatted}`;
    if (!neg) return amount;
    return brackets ? `(${amount})` : `-${amount}`;
  }
}
