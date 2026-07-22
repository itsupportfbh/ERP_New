import { Component, EventEmitter, Input, Output } from '@angular/core';
import { EmailComposeService } from '../../services/email-compose.service';

export interface EmailComposeAttachment {
  /** e.g. "Sales Invoice" */
  label: string;
  /** e.g. the document number "SI-0001" */
  sublabel?: string;
  checked: boolean;
  disabled?: boolean;
  /** The rendered PDF the host produced; sent when this row is checked. */
  blob?: Blob;
  /** File name for the attachment, e.g. "SI-0001.pdf". */
  fileName?: string;
}

export interface EmailComposeModel {
  /** Read-only "Name <email>" shown in the From box (company mailbox sends; this is Reply-To). */
  fromLabel: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  ccEmail: string;
  subject: string;
  bodyHtml: string;
}

/**
 * Reusable "Email Customer" compose dialog shared by every document (Quotation, SO, DO, SI, PO,
 * Supplier Invoice). Purely presentational: the host owns the model + attachment blobs and handles
 * the actual send on (send). The email always goes from the company mailbox with the logged-in user
 * as display name + Reply-To, so no per-user password is needed.
 */
@Component({
  selector: 'erp-email-compose',
  standalone: false,
  templateUrl: './email-compose.component.html',
  styleUrls: ['./email-compose.component.scss']
})
export class EmailComposeComponent {
  @Input() open = false;
  @Input() title = 'Email Customer';
  @Input() toLabel = 'To';
  @Input() loading = false;
  @Input() sending = false;
  @Input() model!: EmailComposeModel;
  @Input() attachments: EmailComposeAttachment[] = [];

  constructor(private emailSvc: EmailComposeService) {}

  @Output() send = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  /**
   * The box shows readable text, not markup. The model keeps HTML (that is what the API
   * sends), so we convert on the way in and back out — otherwise the user saw raw
   * "<p>…<br/>" tags, and anything they typed was treated as markup.
   */
  get bodyText(): string {
    return this.htmlToText(this.model?.bodyHtml ?? '');
  }
  set bodyText(value: string) {
    if (this.model) this.model.bodyHtml = this.textToHtml(value ?? '');
  }

  private htmlToText(html: string): string { return this.emailSvc.htmlToText(html); }
  private textToHtml(text: string): string { return this.emailSvc.textToHtml(text); }

  onSend(): void { if (!this.sending) this.send.emit(); }
  onCancel(): void { if (!this.sending) this.cancel.emit(); }
}
