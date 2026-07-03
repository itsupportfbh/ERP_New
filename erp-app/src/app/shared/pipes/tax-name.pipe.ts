import { Pipe, PipeTransform } from '@angular/core';
import { CurrencyDisplayService } from '../../core/services/currency-display.service';

/**
 * Replaces the literal token "GST" inside a label with the company's dynamic tax name
 * (GST / SST / VAT), taken from the company's country (Country.TaxName).
 *
 *   {{ 'GST %'      | taxName }}   -> "SST %"
 *   {{ 'Tax (GST)'  | taxName }}   -> "Tax (SST)"
 *   {{ 'Output GST' | taxName }}   -> "Output SST"
 *   {{ ''           | taxName }}   -> "SST"   (empty input returns the bare tax name)
 *
 * Impure so it reflects the async-loaded tax name.
 */
@Pipe({ name: 'taxName', standalone: true, pure: false })
export class TaxNamePipe implements PipeTransform {
  constructor(private cur: CurrencyDisplayService) {}

  transform(value?: string | null): string {
    const tax = this.cur.taxName;
    const label = (value ?? '').toString();
    if (!label.trim()) return tax;
    return label.replace(/GST/g, tax);
  }
}
