import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PartnerType = 'customers' | 'suppliers' | 'users';

export interface SupplierPayload {
  id?: number | null;
  name?: string;
  code?: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxReg?: string;
  leadTime?: number | null;
  statusId?: number | null;
  countryId?: number | null;
  termsId?: number | null;
  currencyId?: number | null;
  incotermsId?: number | null;
  budgetLineId?: number | null;
  bankName?: string | null;
  bankAcc?: string | null;
  bankSwift?: string | null;
  bankBranch?: string | null;
  itemID?: string;
  ComplianceDocuments?: string;
  createdBy?: number | string | null;
  updatedBy?: number | string | null;
}

export interface CustomerPayload {
  customerId?: number | null;
  kycId?: number | null;
  customerName?: string;
  customerCode?: string;
  customerGroupId?: number | null;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxRegNo?: string;
  countryId?: number | null;
  locationId?: number | null;
  statusId?: number | null;
  paymentTermId?: number | null;
  budgetLineId?: number | null;
  creditAmount?: number | null;
  approvedBy?: number | null;
  isApproved?: boolean;
}

export interface UserPayload {
  id?: number | null;
  username?: string;
  email?: string;
  password?: string;
  departmentId?: number | null;
  locationId?: number | null;
  approvalLevelIds?: number[];
  teams?: string[];
  companyId?: number | null;
  orgGuid?: string;
  createdBy?: number | null;
  createdDate?: string;
  updatedBy?: number | null;
  updatedDate?: string;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class BusinessPartnersService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getCustomers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/CustomerMaster/GetAllCustomerDetails`);
  }

  getAllCustomerMaster(): Observable<any> {
    return this.http.get(`${this.apiUrl}/CustomerMaster/GetAllCustomerMaster`);
  }

  getCustomerById(id: number | string): Observable<any> {
    return this.http.get(`${this.apiUrl}/CustomerMaster/EditLoadforCustomerbyId/${id}`);
  }

  createCustomer(data: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/CustomerMaster/CreateCustomerWithKYC`, data);
  }

  updateCustomer(data: FormData): Observable<any> {
    return this.http.put(`${this.apiUrl}/CustomerMaster/UpdateCustomerMasterById`, data);
  }

  deleteCustomer(customerId: number, kycId?: number | null): Observable<any> {
    const suffix = kycId ? `/${customerId}/${kycId}` : `/${customerId}`;
    return this.http.delete(`${this.apiUrl}/CustomerMaster/Deactivate${suffix}`);
  }

  getSuppliers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/Suppliers/getAllSupplier`);
  }

  getSupplierById(id: number | string): Observable<any> {
    return this.http.get(`${this.apiUrl}/Suppliers/getSupplierbyId/${id}`);
  }

  createSupplier(data: SupplierPayload): Observable<any> {
    return this.http.post(`${this.apiUrl}/Suppliers/CreateSupplier`, data);
  }

  updateSupplier(data: SupplierPayload): Observable<any> {
    return this.http.put(`${this.apiUrl}/Suppliers/updateSupplier/`, data);
  }

  deleteSupplier(id: number | string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/Suppliers/deleteSupplier/${id}`);
  }

  getUsers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/User/getAllView`);
  }

  getUserById(id: number | string): Observable<any> {
    return this.http.get(`${this.apiUrl}/User/view/${id}`);
  }

  createUser(data: UserPayload): Observable<any> {
    return this.http.post(`${this.apiUrl}/User/insert`, data);
  }

  updateUser(id: number | string, data: UserPayload): Observable<any> {
    return this.http.put(`${this.apiUrl}/User/update/${id}`, data);
  }

  deleteUser(id: number | string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/User/delete/${id}`);
  }

  getApprovalLevels(): Observable<any> {
    return this.http.get(`${this.apiUrl}/ApprovalLevel/GetApprovalLevels`);
  }

  getDepartments(): Observable<any> {
    return this.http.get(`${this.apiUrl}/User/departments`);
  }

  getLocations(): Observable<any> {
    return this.http.get(`${this.apiUrl}/Location/getAllLocationDetails`);
  }

  getLocationsByCountry(countryId: number | string): Observable<any> {
    return this.http.get(`${this.apiUrl}/Location/getLocationbyCountryId/${countryId}`);
  }

  getCountries(): Observable<any> {
    return this.http.get(`${this.apiUrl}/Country/getAll`);
  }

  getCustomerGroups(): Observable<any> {
    return this.http.get(`${this.apiUrl}/CustomerGroups/getAllCustomerGroups`);
  }

  getPaymentTerms(): Observable<any> {
    return this.http.get(`${this.apiUrl}/PaymentTerms/GetPaymentTerms`);
  }

  getCurrencies(): Observable<any> {
    return this.http.get(`${this.apiUrl}/Currency/GetCurrencies`);
  }

  getIncoterms(): Observable<any> {
    return this.http.get(`${this.apiUrl}/Incoterms/GetAllIncoterms`);
  }

  getItems(): Observable<any> {
    return this.http.get(`${this.apiUrl}/ItemMaster/GetItems`);
  }

  getChartOfAccounts(): Observable<any> {
    return this.http.get(`${this.apiUrl}/ChartOfAccount/GetChartOfAccounts`);
  }

  getExchangeRate(fromCurrencyId: number, toCurrencyId: number, rateDate: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/ExchangeRate/GetRate`, {
      params: {
        fromCurrencyId: String(fromCurrencyId),
        toCurrencyId: String(toCurrencyId),
        rateDate
      }
    });
  }

  getDepartmentMenuAccess(departmentId: number | string): Observable<any> {
    return this.http.get(`${this.apiUrl}/DepartmentMenuAccess/by-department/${departmentId}`);
  }

  getOrganizationRoleByUserId(userId: number | string): Observable<any> {
    return this.http.get(`${this.apiUrl}/User/organization-role/${userId}`);
  }

  submitUserAccessWizard(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/User/submit-user-access`, data);
  }

  updateUserAccessWizard(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/User/update-user-access/${id}`, data);
  }

  unwrapRows(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.result)) return response.result;
    if (Array.isArray(response?.items)) return response.items;
    return [];
  }

  unwrapOne(response: any): any {
    if (Array.isArray(response)) return response[0] ?? {};
    if (Array.isArray(response?.data)) return response.data[0] ?? {};
    if (Array.isArray(response?.result)) return response.result[0] ?? {};
    if (Array.isArray(response?.items)) return response.items[0] ?? {};
    if (Array.isArray(response?.data?.data)) return response.data.data[0] ?? {};
    if (response?.data?.data && typeof response.data.data === 'object') return response.data.data;
    return response?.data ?? response ?? {};
  }
}
