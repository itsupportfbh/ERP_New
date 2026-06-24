import { Injectable } from '@angular/core';

export interface DocumentNumberSeries {
  document: string;
  prefix: string;
  nextNo: number;
  reset: boolean;
}

@Injectable({ providedIn: 'root' })
export class DocumentNumberService {
  private readonly currentSeriesKey = 'companyNumberSeries.current';

  private readonly aliases: Record<string, string[]> = {
    PO: ['purchase order', 'po'],
    PIN: ['purchase invoice', 'purchase invoice pin', 'pin', 'supplier invoice'],
    SI: ['sales invoice', 'si'],
    DO: ['delivery order', 'do']
  };

  normalizeSeries(rows: any[]): DocumentNumberSeries[] {
    return (rows || [])
      .map((row: any) => ({
        document: String(row?.document || '').trim(),
        prefix: String(row?.prefix || '').trim().toUpperCase(),
        nextNo: Math.max(1, Number(row?.nextNo || 1)),
        reset: !!row?.reset
      }))
      .filter((row: DocumentNumberSeries) => !!row.document && !!row.prefix);
  }

  cacheCompanySeries(companyId: number, rows: any[]): void {
    const normalized = this.normalizeSeries(rows);
    if (!companyId || !normalized.length) return;
    localStorage.setItem(this.seriesKey(companyId), JSON.stringify(normalized));
    const currentCompanyId = Number(localStorage.getItem('companyId') || 0);
    if (currentCompanyId === companyId) {
      localStorage.setItem(this.currentSeriesKey, JSON.stringify(normalized));
    }
    normalized.forEach(row => this.seedCounter(companyId, row));
  }

  getSeries(companyId?: number): DocumentNumberSeries[] {
    const targetCompanyId = companyId || Number(localStorage.getItem('companyId') || 0);
    const raw = localStorage.getItem(this.seriesKey(targetCompanyId)) || localStorage.getItem(this.currentSeriesKey) || '[]';
    try {
      return this.normalizeSeries(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  peekNextNumber(docType: string, companyId?: number, date = new Date()): string {
    const row = this.findSeries(docType, companyId);
    if (!row) return this.fallbackNumber(docType);
    const nextNo = this.getCounterValue(companyId || Number(localStorage.getItem('companyId') || 0), row, date);
    return this.format(row.prefix, nextNo);
  }

  reserveNextNumber(docType: string, companyId?: number, date = new Date()): string {
    const targetCompanyId = companyId || Number(localStorage.getItem('companyId') || 0);
    const row = this.findSeries(docType, targetCompanyId);
    if (!row) return this.fallbackNumber(docType);
    const key = this.counterKey(targetCompanyId, row, date);
    const nextNo = this.getCounterValue(targetCompanyId, row, date);
    localStorage.setItem(key, String(nextNo + 1));
    return this.format(row.prefix, nextNo);
  }

  private findSeries(docType: string, companyId?: number): DocumentNumberSeries | null {
    const normalizedDoc = this.normalizeDoc(docType);
    const aliases = this.aliases[normalizedDoc] || [normalizedDoc.toLowerCase()];
    const rows = this.getSeries(companyId);
    return rows.find(row => {
      const key = this.normalizeDoc(row.document).toLowerCase();
      return aliases.some(alias => key.includes(alias.replace(/[^a-z0-9]/g, '')));
    }) || null;
  }

  private normalizeDoc(value: string): string {
    return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  }

  private format(prefix: string, nextNo: number): string {
    return `${prefix}-${String(nextNo).padStart(5, '0')}`;
  }

  private fallbackNumber(docType: string): string {
    const prefix = this.normalizeDoc(docType) || 'DOC';
    const suffix = String(Date.now()).slice(-5);
    return `${prefix}-${suffix}`;
  }

  private seriesKey(companyId: number): string {
    return `companyNumberSeries.${companyId}`;
  }

  private counterKey(companyId: number, row: DocumentNumberSeries, date: Date): string {
    const yearPart = row.reset ? `.${date.getFullYear()}` : '';
    return `companyNumberCounter.${companyId}.${this.normalizeDoc(row.document)}.${row.prefix}${yearPart}`;
  }

  private seedCounter(companyId: number, row: DocumentNumberSeries): void {
    const key = this.counterKey(companyId, row, new Date());
    const existing = Number(localStorage.getItem(key) || 0);
    if (!existing || existing < row.nextNo) {
      localStorage.setItem(key, String(row.nextNo));
    }
  }

  private getCounterValue(companyId: number, row: DocumentNumberSeries, date: Date): number {
    const key = this.counterKey(companyId, row, date);
    const stored = Number(localStorage.getItem(key) || 0);
    if (stored > 0) return stored;
    this.seedCounter(companyId, row);
    return Number(localStorage.getItem(key) || row.nextNo || 1);
  }
}
