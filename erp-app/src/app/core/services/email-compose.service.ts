import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EmailRecipientInfo {
  id: number;
  invoiceNo: string;   // document number
  partyName: string;   // customer or supplier
  email: string;       // To address
}

export interface EmailSendPayload {
  toEmail: string;
  toName?: string;
  ccEmail?: string;
  subject: string;
  bodyHtml: string;
  fromEmail?: string;   // logged-in user (Reply-To identity)
  fromName?: string;
  files: { fileName: string; blob: Blob }[];
}

/**
 * Shared helper for the reusable "Email Customer" dialog used by every document list
 * (Quotation, SO, DO, SI, PO, Supplier Invoice). Recipient prefill + generic multipart send.
 */
@Injectable({ providedIn: 'root' })
export class EmailComposeService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** docType: QUOTE | SO | DO | SI | PO | PIN */
  getRecipient(docType: string, id: number | string): Observable<any> {
    return this.http.get(`${this.api}/invoiceemail/recipient/${docType}/${id}`);
  }

  /** Uploads the rendered PDF(s) + compose fields; sends one email from the company mailbox. */
  sendWithAttachments(payload: EmailSendPayload): Observable<any> {
    const fd = new FormData();
    fd.append('toEmail', payload.toEmail ?? '');
    fd.append('toName', payload.toName ?? '');
    fd.append('ccEmail', payload.ccEmail ?? '');
    fd.append('subject', payload.subject ?? '');
    fd.append('bodyHtml', payload.bodyHtml ?? '');
    fd.append('fromEmail', payload.fromEmail ?? '');
    fd.append('fromName', payload.fromName ?? '');
    for (const f of payload.files || []) {
      if (f?.blob) fd.append('files', f.blob, f.fileName || 'document.pdf');
    }
    return this.http.post(`${this.api}/invoiceemail/send-attachments`, fd);
  }

  /**
   * Server-side compose: the API generates the document PDF (Purchase Order, Supplier Invoice, …)
   * and sends it. Used for documents whose PDF isn't rendered client-side.
   * docType: PO | PIN | SI | SO | DO
   */
  sendComposeDoc(docType: string, id: number | string, dto: any): Observable<any> {
    return this.http.post(`${this.api}/invoiceemail/compose-doc/${docType}/${id}`, dto);
  }

  unwrapOne(res: any): any {
    if (res?.data && !Array.isArray(res.data)) return res.data;
    if (Array.isArray(res?.data)) return res.data[0] ?? {};
    return res ?? {};
  }
}
