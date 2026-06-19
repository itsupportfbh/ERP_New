import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';

@Component({
  selector: 'erp-pager',
  standalone: false,
  templateUrl: './pager.component.html',
  styleUrls: ['./pager.component.scss']
})
export class PagerComponent implements OnChanges {
  @Input() totalItems = 0;
  @Input() pageSize = 10;
  @Input() currentPage = 1;
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  totalPages = 1;
  pages: number[] = [];
  pageSizes = [5, 10, 20, 50, 100];

  ngOnChanges(): void { this.buildPages(); }

  buildPages(): void {
    this.totalPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    const current = Math.min(this.currentPage, this.totalPages);
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, current - delta); i <= Math.min(this.totalPages, current + delta); i++) range.push(i);
    this.pages = range;
  }

  goTo(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.pageChange.emit(page);
  }

  changePageSize(size: number): void {
    this.pageSizeChange.emit(+size);
    this.pageChange.emit(1);
  }

  get startItem(): number { return Math.min((this.currentPage - 1) * this.pageSize + 1, this.totalItems); }
  get endItem(): number { return Math.min(this.currentPage * this.pageSize, this.totalItems); }
}
