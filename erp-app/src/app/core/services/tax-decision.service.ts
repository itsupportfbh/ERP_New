import { Injectable } from '@angular/core';

export type CalculatedTaxMode = 'Exclusive' | 'Inclusive' | 'ZeroRated';

export interface TaxDecisionContext {
  companyCountryId?: number | null;
  partnerCountryId?: number | null;
  companyCurrencyId?: number | null;
  documentCurrencyId?: number | null;
  defaultTaxRate?: number | null;
}

export interface TaxDecision {
  isOverseas: boolean;
  taxRate: number;
  taxMode: CalculatedTaxMode;
  category: 'domestic' | 'cross-border' | 'foreign-currency' | 'unknown';
  reason: string;
}

@Injectable({ providedIn: 'root' })
export class TaxDecisionService {
  decide(context: TaxDecisionContext): TaxDecision {
    const companyCountryId = Number(context.companyCountryId || 0) || null;
    const partnerCountryId = Number(context.partnerCountryId || 0) || null;
    const companyCurrencyId = Number(context.companyCurrencyId || 0) || null;
    const documentCurrencyId = Number(context.documentCurrencyId || 0) || null;
    const defaultTaxRate = Math.max(0, Number(context.defaultTaxRate || 0));

    if (companyCountryId && partnerCountryId) {
      if (companyCountryId !== partnerCountryId) {
        return {
          isOverseas: true,
          taxRate: 0,
          taxMode: 'ZeroRated',
          category: 'cross-border',
          reason: 'Partner country differs from company country.'
        };
      }
      return {
        isOverseas: companyCurrencyId > 0 && documentCurrencyId > 0 && companyCurrencyId !== documentCurrencyId,
        taxRate: defaultTaxRate,
        taxMode: 'Exclusive',
        category: 'domestic',
        reason: 'Partner and company are in the same country.'
      };
    }

    if (companyCurrencyId && documentCurrencyId && companyCurrencyId !== documentCurrencyId) {
      return {
        isOverseas: true,
        taxRate: 0,
        taxMode: 'ZeroRated',
        category: 'foreign-currency',
        reason: 'Document currency differs from company base currency.'
      };
    }

    return {
      isOverseas: false,
      taxRate: defaultTaxRate,
      taxMode: defaultTaxRate > 0 ? 'Exclusive' : 'ZeroRated',
      category: 'unknown',
      reason: 'Country data is incomplete, so the default company tax is used.'
    };
  }
}
