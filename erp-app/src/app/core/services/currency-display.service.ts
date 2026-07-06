import { Injectable } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { MasterService } from './master.service';

/**
 * App-wide currency symbol + tax-name (GST/SST/VAT) resolver. Multi-currency aware.
 *
 * The base currency + country are read from the CURRENT company's finance settings
 * (getCompanyById → financeTax.baseCurrency / country) — the DB truth — NOT from fragile
 * localStorage values that can go stale when switching between companies.
 *
 *  - SYMBOL: the base currency NAME (e.g. 'SGD', 'MYR') → Currency master Symbol (S$, RM).
 *            Document-selected currencies resolve their own symbol by id/name.
 *  - TAX NAME: the company's country (Country master TaxName): GST / SST / VAT.
 *
 * Results are cached in localStorage for instant reads and refreshed on login / company switch.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyDisplayService {
  private symbolById = new Map<number, string>();
  private symbolByName = new Map<string, string>();
  private loaded = false;
  private loading = false;
  private _loadedKey = '';   // company+tenant the current data was loaded for (auto-refresh on switch)
  private _symbol = '';     // company base currency symbol (from DB base currency)

  /** Company + tenant database identity — different tenants can share the same companyId. */
  private currentKey(): string {
    return (localStorage.getItem('companyId') || '0') + '|' + (localStorage.getItem('databaseName') || '');
  }
  private _baseName = '';    // company base currency name (e.g. 'SGD')
  private _taxName = '';

  constructor(private master: MasterService) {
    this.hydrateFromCache();
  }

  private hydrateFromCache(): void {
    // Only trust the cache if it was written for the SAME company+tenant; otherwise it is
    // stale from another tenant (which can share the same companyId) and must not be shown.
    if ((localStorage.getItem('appCurrencyKey') || '') !== this.currentKey()) return;
    try {
      const byId = JSON.parse(localStorage.getItem('currencySymByIdMap') || '{}') || {};
      for (const k of Object.keys(byId)) this.symbolById.set(Number(k), String(byId[k]));
      const byName = JSON.parse(localStorage.getItem('currencySymByNameMap') || '{}') || {};
      for (const k of Object.keys(byName)) this.symbolByName.set(k, String(byName[k]));
    } catch {}
    this._symbol = (localStorage.getItem('appCurrencySymbol') || '').trim();
    this._taxName = (localStorage.getItem('appTaxName') || '').trim();
  }

  private loadPromise: Promise<void> | null = null;

  /**
   * Preload the currency data and RESOLVE when ready. Used by APP_INITIALIZER so the
   * base symbol is correct before any screen (e.g. the dashboard, which formats money
   * once via compactMoney) renders — otherwise a hard reload would format with a stale symbol.
   */
  preload(): Promise<void> {
    const companyId = Number(localStorage.getItem('companyId') || 0);
    if (this.loaded && this.currentKey() === this._loadedKey) return Promise.resolve();
    const load = (this.loading && this.loadPromise) ? this.loadPromise : this.startLoad(companyId);
    // Never block app bootstrap for more than 4s (data still loads in the background after).
    return Promise.race([load, new Promise<void>(resolve => setTimeout(resolve, 4000))]);
  }

  /** Load currency symbols + the CURRENT company's base symbol + tax name.
   *  Auto-refreshes when the active company changes (no re-login / reload needed). */
  ensureLoaded(): void {
    const companyId = Number(localStorage.getItem('companyId') || 0);
    // Already loaded for this company + tenant → nothing to do.
    if (this.loaded && this.currentKey() === this._loadedKey) return;
    if (this.loading) return;
    void this.startLoad(companyId);
  }

  private startLoad(companyId: number): Promise<void> {
    this.loading = true;
    this._loadedKey = this.currentKey();

    this.loadPromise = new Promise<void>(resolve => {
    forkJoin([
      this.master.getCurrencies(),
      this.master.getCountries(),
      companyId ? this.master.getCompanyById(companyId) : of(null)
    ]).subscribe({
      next: ([cRes, coRes, compRes]: any[]) => {
        // 1) Currency master → id/name → symbol maps.
        const cList: any[] = cRes?.data ?? cRes ?? [];
        const symById: Record<string, string> = {};
        const symByName: Record<string, string> = {};
        for (const c of (Array.isArray(cList) ? cList : [])) {
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

        // 2) Company finance settings (DB truth) → base currency + country.
        const f = compRes?.financeTax ?? compRes?.finance ?? {};
        const baseCur = String(f.baseCurrency ?? localStorage.getItem('companyCurrencyName') ?? '').trim();
        const countryId = Number(f.countryId ?? 0);
        const countryName = String(f.country ?? compRes?.general?.country ?? '').trim();

        // 3) Match the company's country EXACTLY (id or name) — never guess another country.
        const countries: any[] = coRes?.data ?? coRes ?? [];
        const arr = Array.isArray(countries) ? countries : [];
        let country = arr.find((x: any) => Number(x.id ?? x.Id ?? 0) === countryId && countryId > 0);
        if (!country && countryName) {
          country = arr.find((x: any) => String(x.countryName ?? x.name ?? '').trim().toLowerCase() === countryName.toLowerCase());
        }

        // 4) Base symbol: base-currency name → Currency symbol; else matched country's symbol.
        let sym = baseCur ? (this.symbolByName.get(baseCur.toLowerCase()) || '') : '';
        if (!sym && country) sym = String(country.currencySymbol ?? country.CurrencySymbol ?? '').trim();
        this._baseName = baseCur;
        this._symbol = sym;
        try {
          if (sym) localStorage.setItem('appCurrencySymbol', sym);
          else localStorage.removeItem('appCurrencySymbol');
          if (baseCur) localStorage.setItem('companyCurrencyName', baseCur);
        } catch {}

        // 5) Tax name from the matched country.
        const tax = country ? String(country.taxName ?? country.TaxName ?? '').trim() : '';
        this._taxName = tax;
        try {
          if (tax) localStorage.setItem('appTaxName', tax);
          else localStorage.removeItem('appTaxName');
        } catch {}

        try { localStorage.setItem('appCurrencyKey', this._loadedKey); } catch {}
        this.loaded = true;
        this.loading = false;
        resolve();
      },
      error: () => { this.loading = false; resolve(); }
    });
    });
    return this.loadPromise;
  }

  /** Force a refresh (e.g. after login / switching company). */
  reload(): void {
    this.loaded = false;
    this.loading = false;
    this._loadedKey = '';
    this.ensureLoaded();
  }

  /** Dynamic tax label for the company (GST / SST / VAT). Falls back to 'GST'. */
  get taxName(): string { this.ensureLoaded(); return this._taxName || 'GST'; }

  get baseCurrencyId(): number { return Number(localStorage.getItem('companyCurrencyId') || 0); }

  /** Company base currency symbol (from the company's DB base currency). */
  baseSymbol(): string {
    this.ensureLoaded();
    if (this._symbol) return this._symbol;
    // Fallbacks before the async load completes.
    const nm = (this._baseName || localStorage.getItem('companyCurrencyName') || '').trim();
    if (nm) {
      const s = this.symbolByName.get(nm.toLowerCase());
      if (s) return s;
    }
    const byId = this.symbolById.get(this.baseCurrencyId);
    if (byId) return byId;
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
      if (key !== (this._baseName || '').toLowerCase()) return String(name || '').trim();
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
