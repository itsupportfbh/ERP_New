import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'erp-master-popup',
  standalone: false,
  templateUrl: './master-popup.component.html',
  styleUrls: ['./master-popup.component.scss']
})
export class MasterPopupComponent {
  @Input() showDeleteConfirm = false;
  @Input() showResult = false;
  @Input() isSuccess = false;
  @Input() message = '';

  @Output() deleteConfirmed = new EventEmitter<void>();
  @Output() deleteCancelled = new EventEmitter<void>();
  @Output() resultClosed = new EventEmitter<void>();
}
