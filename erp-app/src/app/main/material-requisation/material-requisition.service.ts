import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { MaterialRequisitionAPIUrls } from 'Urls/MaterialRequisitionApiUrls';

@Injectable({
  providedIn: 'root'
})
export class MaterialRequisitionService {

  private url = environment.apiUrl;
     
       constructor(private http: HttpClient) {}
     
       GetMaterialRequest(): Observable<any> {
         return this.http.get<any[]>(this.url + MaterialRequisitionAPIUrls.GetMaterialRequest);
       }
     
       CreateMaterialRequest(data: any): Observable<any> {
         return this.http.post(this.url + MaterialRequisitionAPIUrls.CreateMaterialRequest, data);
       }
     
       UpdateMaterialRequestById(id: number, data: any): Observable<any> {
         return this.http.put(`${this.url + MaterialRequisitionAPIUrls.UpdateMaterialRequestById}${id}`, data);
       }
     
       DeleteMaterialRequestById(id: number): Observable<any> {
         return this.http.delete(`${this.url + MaterialRequisitionAPIUrls.DeleteMaterialRequestById}${id}`);
       }
     
       GetMaterialRequestById(id: number): Observable<any> {
         return this.http.get(`${this.url + MaterialRequisitionAPIUrls.GetMaterialRequestById}${id}`);
       }
}
