import { Injectable } from '@angular/core';

export interface ReceivingSnapshotLine {
  itemKey: string;
  itemName: string;
  qty: number;
}

export interface ReceivingSnapshot {
  poNo: string;
  queuedAt: string;
  source: 'queue' | 'sync';
  lines: ReceivingSnapshotLine[];
}

export interface OcrReceivingMatchLine {
  itemName: string;
  itemKey: string;
  ocrQty: number;
  receivedQty: number;
  varianceQty: number;
  status: 'OK' | 'Mismatch';
}

@Injectable({ providedIn: 'root' })
export class ReceivingIntegrationService {
  saveQueue(poNo: string, rows: Array<{ barcode: string; itemName?: string; itemCode?: string; qty: number }>): void {
    const payload = this.buildSnapshot(poNo, rows, 'queue');
    if (!payload) return;
    localStorage.setItem(this.queueKey(poNo), JSON.stringify(payload));
  }

  saveSynced(poNo: string, rows: Array<{ barcode: string; itemName?: string; itemCode?: string; qty: number }>): void {
    const payload = this.buildSnapshot(poNo, rows, 'sync');
    if (!payload) return;
    localStorage.setItem(this.syncedKey(poNo), JSON.stringify(payload));
  }

  getQueue(poNo: string): ReceivingSnapshot | null {
    return this.readSnapshot(this.queueKey(poNo));
  }

  getSynced(poNo: string): ReceivingSnapshot | null {
    return this.readSnapshot(this.syncedKey(poNo));
  }

  clearQueue(poNo: string): void {
    localStorage.removeItem(this.queueKey(poNo));
  }

  matchOcrLines(poNos: string[], ocrLines: any[]): OcrReceivingMatchLine[] {
    const received = new Map<string, number>();
    const names = new Map<string, string>();
    poNos
      .filter(Boolean)
      .forEach(poNo => {
        [this.getQueue(poNo), this.getSynced(poNo)]
          .filter((snapshot): snapshot is ReceivingSnapshot => !!snapshot)
          .forEach(snapshot => {
            snapshot.lines.forEach(line => {
              const key = this.normalizeKey(line.itemKey || line.itemName);
              if (!key) return;
              received.set(key, (received.get(key) || 0) + Number(line.qty || 0));
              if (!names.has(key)) names.set(key, line.itemName || line.itemKey);
            });
          });
      });

    return (ocrLines || []).map((line: any) => {
      const rawName = String(line?.item ?? line?.itemName ?? '').trim();
      const key = this.normalizeKey(rawName);
      const ocrQty = Number(line?.qty ?? 0);
      const receivedQty = received.get(key) || 0;
      return {
        itemName: rawName || names.get(key) || 'Unknown Item',
        itemKey: key,
        ocrQty,
        receivedQty,
        varianceQty: +(receivedQty - ocrQty).toFixed(4),
        status: Math.abs(receivedQty - ocrQty) < 0.0001 ? 'OK' : 'Mismatch'
      };
    });
  }

  normalizeKey(value: string): string {
    return String(value || '')
      .split('|')
      .pop()
      ?.split(' - ')[0]
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '') || '';
  }

  private buildSnapshot(poNo: string, rows: Array<{ barcode: string; itemName?: string; itemCode?: string; qty: number }>, source: 'queue' | 'sync'): ReceivingSnapshot | null {
    const cleanPo = String(poNo || '').trim().toUpperCase();
    if (!cleanPo) return null;
    const lines = (rows || [])
      .map(row => ({
        itemKey: String(row.itemCode || row.barcode || '').trim(),
        itemName: String(row.itemName || row.itemCode || row.barcode || '').trim(),
        qty: Number(row.qty || 0)
      }))
      .filter(line => !!line.itemKey && line.qty > 0);
    return {
      poNo: cleanPo,
      queuedAt: new Date().toISOString(),
      source,
      lines
    };
  }

  private queueKey(poNo: string): string {
    return `receiving.queue.${String(poNo || '').trim().toUpperCase()}`;
  }

  private syncedKey(poNo: string): string {
    return `receiving.synced.${String(poNo || '').trim().toUpperCase()}`;
  }

  private readSnapshot(key: string): ReceivingSnapshot | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && parsed.poNo ? parsed : null;
    } catch {
      return null;
    }
  }
}
