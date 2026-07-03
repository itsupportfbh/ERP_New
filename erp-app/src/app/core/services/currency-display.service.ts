import { Injectable } from '@angular/core';
import { MasterService } from './master.service';

/**
 * App-wide currency symbol + tax-name (GST/SST/VAT) resolver. Multi-currency aware.
 *
 *  - Per-currency SYMBOL comes from the Currency master (Currency.Symbol): RM, S$, $, ...
 *    Used for BOTH the company base currency and any document-selected currency, so a
 *    Malaysia company (base RM) invoicing in SGD shows S$ on that document automatically.
 *  - TAX NAME comes from the company's COUNTRY (Country.TaxName): SST / GST / VAT.
 *
 * Everything is cached in localStorage for instant, synchronous reads and refreshed on
 * login / company switch.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyDisplayService {
  private symbolById = new Map<number, string>();
  private symbolByName = new Map<string, string>();
  private loaded = false;
  private loading = false;
  private _symbol = '';   // company base currency symbol
  private _taxName = '';

  constructor(private master: MasterService) {
    this.hydrateFromCache();
  }

  private hydrateFromCache(): void {
    try {
      const byId = JSON.parse(localStorage.getItem('currencySymByIdMap') || '{}') || {};
      for (const k of Object.keys(byId)) this.symbolById.set(Number(k), String(byId[k]));
      const byName = JSON.parse(localStorage.getItem('currencySymByNameMap') || '{}') || {};
      for (const k of Object.keys(byName)) this.symbolByName.set(k, String(byName[k]));
    } catch {}
    this._symbol = (localStorage.getItem('appCurrencySymbol') || '').trim();
    this._taxName = (localStorage.getItem('appTaxName') || '').trim();
  }

  /** One-time background load of per-currency symbols + the company's tax name. */
  ensureLoaded(): void {
    if (this.loaded || this.loading) return;
    this.loading = true;

    // 1) Currencies -> per-currency symbol maps + company base symbol.
    this.master.getCurrencies().subscribe({
      next: (res: any) => {
        const list: any[] = res?.data ?? res ?? [];
        const arr = Array.isArray(list) ? list : [];
        const symById: Record<string, string> = {};
        const symByName: Record<string, string> = {};
        for (const c of arr) {
          const id = Number(c.id ?? c.Id ?? 0);
          const sym = String(c.symbol ?? c.Symbol ?? '').trim();
          const nm = String(c.currencyName ?? c.CurrencyName ?? c.name ?? '').trim();
          if (!sym) continue;
          if (id > 0) { this.symbolById.set(id, sym); symById[id] = sym; }
          if (nm) { this.symbolByName.set(nm.toLowerCase(), sym); symByName[nm.toLowerCase()] = sym; }
        }
        try {
          localStorage.setItem('currencySymByIdMap', JSON.stringify(symById));
          localStorage.setItem('currencySymByNameMap', JSON.stringify(symByName));
        } catch {}
        const baseId = Number(localStorage.getItem('companyCurrencyId') || 0);
        const baseSym = this.symbolById.get(baseId);
        if (baseSym) { this._symbol = baseSym; try { localStorage.setItem('appCurrencySymbol', baseSym); } catch {} }
        this.loaded = true;
        this.loading = false;
      },
      error: () => { this.loaded = true; this.loading = false; }
    });

    // 2) Country (independent) -> tax name + base-symbol fallback when currency has none.
    this.loadCountryMeta();
  }

  private loadCountryMeta(): void {
    this.master.getCountries().subscribe({
      next: (cr: any) => {
        const list: any[] = cr?.data ?? cr ?? [];
        const arr = Array.isArray(list) ? list : [];
        const companyId = Number(localStorage.getItem('companyId') || 0);
        if (companyId) {
          this.master.getCompanyById(companyId).subscribe({
            next: (res: any) => {
              const f = res?.financeTax || res?.finance || {};
              this.applyCountry(arr, Number(f.countryId ?? 0), String(f.country ?? res?.general?.country ?? '').trim());
            },
            error: () => this.applyCountry(arr, 0, '')
          });
        } else {
          this.applyCountry(arr, 0, '');
        }
      },
      error: () => {}
    });
  }

  private applyCountry(arr: any[], prefId: number, prefName: string): void {
    const hasSymbol = (x: any) => String(x?.currencySymbol ?? x?.CurrencySymbol ?? '').trim().length > 0;
    let match = arr.find((x: any) => Number(x.id ?? x.Id ?? 0) === prefId && prefId > 0);
    if (!match && prefName) {
      match = arr.find((x: any) => String(x.countryName ?? x.name ?? '').trim().toLowerCase() === prefName.toLowerCase());
    }
    if (!match) match = arr.find(hasSymbol);
    if (!match && arr.length === 1) match = arr[0];
    const tax = String(match?.taxName ?? match?.TaxName ?? '').trim();
    if (tax) { this._taxName = tax; try { localStorage.setItem('appTaxName', tax); } catch {} }
    // Only use the country symbol as a fallback if the base currency had no symbol.
    if (!this._symbol) {
      const sym = String(match?.currencySymbol ?? match?.CurrencySymbol ?? '').trim();
      if (sym) { this._symbol = sym; try { localStorage.setItem('appCurrencySymbol', sym); } catch {} }
    }
  }

  /** Force a refresh (e.g. after switching company). */
  reload(): void {
    this.loaded = false;
    this.loading = false;
    this.ensureLoaded();
  }

  /** Dynamic tax label for the company (GST / SST / VAT). Falls back to 'GST'. */
  get taxName(): string { this.ensureLoaded(); return this._taxName || 'GST'; }

  get baseCurrencyId(): number { return Number(localStorage.getItem('companyCurrencyId') || 0); }

  /** Company base currency symbol. Falls back to the base currency name, then '$'. */
  baseSymbol(): string {
    this.ensureLoaded();
    const sym = this.symbolById.get(this.baseCurrencyId);
    if (sym) return sym;
    if (this._symbol) return this._symbol;
    const nm = (localStorage.getItem('companyCurrencyName') || '').trim();
    return nm || '$';
  }

  /** Symbol for a document-selected currency id; falls back to the base symbol. */
  symbolFor(currencyId?: number | null): string {
    this.ensureLoaded();
    const id = Number(currencyId || 0);
    if (id > 0) {
      const sym = this.symbolById.get(id);
      if (sym) return sym;
    }
    return this.baseSymbol();
  }

  /** Symbol for a currency given by its name/code (e.g. "SGD"); falls back to base symbol. */
  symbolForName(name?: string | null): string {
    this.ensureLoaded();
    const key = String(name || '').trim().toLowerCase();
    if (key) {
      const sym = this.symbolByName.get(key);
      if (sym) return sym;
      const baseName = (localStorage.getItem('companyCurrencyName') || '').trim().toLowerCase();
      if (key !== baseName) return String(name || '').trim(); // show the given code if unknown
    }
    return this.baseSymbol();
  }

  /**
   * Compact money for dashboard tiles: base currency symbol + K/M/B scaling.
   * Replaces the old hardcoded "₹…L/Cr" (Indian) formatting.
   */
  compactMoney(value: any): string {
    const sym = this.baseSymbol();
    const n = Number(value);
    const num = (value === null || value === undefined || value === '' || isNaN(n)) ? 0 : n;
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    let out: string;
    if (abs >= 1e9) out = (abs / 1e9).toFixed(2) + 'B';
    else if (abs >= 1e6) out = (abs / 1e6).toFixed(2) + 'M';
    else if (abs >= 1e3) out = (abs / 1e3).toFixed(1) + 'K';
    else out = abs.toFixed(2);
    const sep = /[A-Za-z]$/.test(sym) ? ' ' : '';
    return `${sign}${sym}${sep}${out}`;
  }
}
