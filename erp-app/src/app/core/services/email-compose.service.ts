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

  /**
   * Sign-off block for a document email: the sender's name followed by the company's
   * name, address, phone and email. Reads the company details cached at login by
   * MasterService.cacheCompanyLogo() (the same values the printed documents use), so
   * it costs no extra request and follows the company the user is working under.
   */
  signatureHtml(senderName: string): string {
    const ls = (k: string) => (localStorage.getItem(k) || '').trim();
    const company = ls('companyPrintName') || ls('companyName');
    const cityLine = [ls('companyPrintPostal'), ls('companyPrintCity')].filter(Boolean).join(' ');
    const phone = ls('companyPrintPhone');
    const email = ls('companyPrintEmail');

    const lines = [
      senderName ? this.escape(senderName) : '',
      company ? `<b>${this.escape(company)}</b>` : '',
      this.escape(ls('companyPrintAddress1')),
      this.escape(ls('companyPrintAddress2')),
      this.escape(cityLine),
      this.escape(ls('companyPrintState')),
      phone ? `Tel: ${this.escape(phone)}` : '',
      email ? `Email: ${this.escape(email)}` : ''
    ].filter(Boolean);

    return `<p>Regards,<br/>${lines.join('<br/>')}</p>`;
  }

  /**
   * Sender display name for a document email, e.g. "Ms Vanishree Suppiah — Quotation":
   * the logged-in user (as before) with the document type appended so the customer's
   * inbox shows what the mail is about instead of a generic "Notification".
   */
  senderName(docLabel: string): string {
    const user = (localStorage.getItem('username') || localStorage.getItem('email') || '').trim();
    return user ? `${user} — ${docLabel}` : docLabel;
  }

  /** Compose boxes show readable text; the API is sent HTML. These two convert between them. */
  htmlToText(html: string): string {
    return (html || '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  textToHtml(text: string): string {
    return this.escape(text || '')
      .split(/\n{2,}/)
      .map(block => `<p>${block.replace(/\n/g, '<br/>')}</p>`)
      .join('');
  }

  private escape(v: string): string {
    return (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  unwrapOne(res: any): any {
    if (res?.data && !Array.isArray(res.data)) return res.data;
    if (Array.isArray(res?.data)) return res.data[0] ?? {};
    return res ?? {};
  }
}
