import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PrintColumn, PrintField } from '../../../core/services/document-print.service';

/**
 * Generic read-only "view details" modal used by every Sales / Recipe list
 * page. The parent supplies header info fields, line columns + rows, and
 * optional totals; the modal renders them and emits (print) / (close).
 */
@Component({
  selector: 'erp-doc-view-modal',
  standalone: false,
  templateUrl: './doc-view-modal.component.html',
  styleUrls: ['./doc-view-modal.component.scss']
})
export class DocViewModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() info: PrintField[] = [];
  @Input() columns: PrintColumn[] = [];
  @Input() lines: any[] = [];
  @Input() totals: PrintField[] = [];
  @Input() loading = false;
  @Input() showPrint = false;
  /** Optional column key under which the total VALUE should be shown. Defaults to the last column. */
  @Input() totalKey: string | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() print = new EventEmitter<void>();

  private get totalColIndex(): number {
    if (!this.totalKey) return this.columns.length - 1;
    const idx = this.columns.findIndex(c => c.key === this.totalKey);
    return idx >= 0 ? idx : this.columns.length - 1;
  }

  /** Colspan for the total label (covers the # column + every column before the value column). */
  get totalLabelColspan(): number { return this.totalColIndex + 1; }

  /** Number of empty trailing cells after the total value column. */
  get totalTrailingCols(): number { return this.columns.length - this.totalColIndex - 1; }

  get totalTrailing(): number[] { return Array(Math.max(this.totalTrailingCols, 0)).fill(0); }

  cellValue(col: PrintColumn, row: any): string {
    const raw = row?.[col.key];
    switch (col.type) {
      case 'number': return (Number(raw ?? 0)).toFixed(2);
      case 'qty': return (Number(raw ?? 0)).toFixed(3).replace(/\.?0+$/, '');
      case 'date': return this.fmtDate(raw);
      default: return raw == null || raw === '' ? '-' : String(raw);
    }
  }

  alignCls(a?: string): string { return a === 'right' ? 'ta-right' : a === 'center' ? 'ta-center' : ''; }

  private fmtDate(d: any): string {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${dt.getFullYear()}`;
  }
}
