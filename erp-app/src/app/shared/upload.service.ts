import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { Observable, map } from 'rxjs';

export type UploadFolder = 'items' | 'itemsets';

/**
 * Uploads an image and returns the relative URL to store on the record.
 *
 * Images are posted the moment the user picks one, so the existing JSON create/update endpoints
 * keep taking JSON — only the URL travels in their payload.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  /** Matches the API's own limit; checked here too so a 20 MB file is rejected before it is sent. */
  static readonly MAX_BYTES = 5 * 1024 * 1024;
  static readonly ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  private readonly api = environment.apiUrl;

  // Uploaded files are served from the API's ORIGIN (/uploads/...), not from under /api, so the
  // trailing /api has to come off or every image 404s.
  private readonly assetBase = environment.apiUrl.replace(/\/api\/?$/i, '');

  constructor(private http: HttpClient) {}

  /** Validates the file locally; returns an error message, or null when it is acceptable. */
  validate(file: File): string | null {
    if (!UploadService.ACCEPTED.includes(file.type))
      return 'Only JPG, PNG, WEBP or GIF images are allowed.';

    if (file.size > UploadService.MAX_BYTES)
      return 'Image must be 5 MB or smaller.';

    return null;
  }

  /** Uploads the file and emits the stored relative URL, e.g. /uploads/items/ab12.png. */
  upload(file: File, folder: UploadFolder): Observable<string> {
    const body = new FormData();
    body.append('file', file);

    return this.http
      .post<any>(`${this.api}/Upload/Image?folder=${folder}`, body)
      .pipe(map(res => res?.data?.url ?? res?.Data?.url ?? ''));
  }

  /** Turns a stored relative URL into one the browser can load. */
  toSrc(url: string | null | undefined): string {
    if (!url) return '';
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return `${this.assetBase}${url.startsWith('/') ? '' : '/'}${url}`;
  }
}
