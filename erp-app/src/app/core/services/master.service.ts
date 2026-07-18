import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MasterService {
  private api = environment.apiUrl;
  constructor(private http: HttpClient) {}

  private currentUserId(): number | null {
    const value = Number(localStorage.getItem('id') || 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private currentCompanyId(): number | null {
    const value = Number(localStorage.getItem('companyId') || 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private withAudit(data: any): any {
    const payload = { ...(data || {}) };
    const userId = this.currentUserId();
    const companyId = this.currentCompanyId();
    const now = new Date();

    if (payload.isActive == null) payload.isActive = true;
    if (userId && payload.createdBy == null) payload.createdBy = userId;
    if (userId && payload.updatedBy == null) payload.updatedBy = userId;
    if (payload.createdDate == null) payload.createdDate = now;
    if (payload.updatedDate == null) payload.updatedDate = now;
    if (companyId && payload.companyId == null) payload.companyId = companyId;

    return payload;
  }

  // APPROVAL LEVEL
  getApprovalLevels(): Observable<any> { return this.http.get(`${this.api}/ApprovalLevel/GetApprovalLevels`); }
  createApprovalLevel(d: any): Observable<any> { return this.http.post(`${this.api}/ApprovalLevel/CreateApprovalLevel`, this.withAudit(d)); }
  updateApprovalLevel(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/ApprovalLevel/UpdateApprovalLevelById/${id}`, this.withAudit({ ...d, id })); }
  deleteApprovalLevel(id: number): Observable<any> { return this.http.delete(`${this.api}/ApprovalLevel/DeleteApprovalLevelById/${id}`); }

  // BANK
  getBanks(): Observable<any> { return this.http.get(`${this.api}/Bank/GetAllBank`); }
  createBank(d: any): Observable<any> { return this.http.post(`${this.api}/Bank/createBank`, this.withAudit(d)); }
  updateBank(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Bank/updateBankById/${id}`, this.withAudit({ ...d, id })); }
  deleteBank(id: number): Observable<any> { return this.http.delete(`${this.api}/Bank/deleteBankById/${id}`); }

  // BIN
  getBins(): Observable<any> { return this.http.get(`${this.api}/Bins/GetAllBin`); }
  createBin(d: any): Observable<any> { return this.http.post(`${this.api}/Bins/createBin`, this.withAudit(d)); }
  updateBin(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Bins/updateBinById/${id}`, this.withAudit({ ...d, id })); }
  deleteBin(id: number): Observable<any> { return this.http.delete(`${this.api}/Bins/deleteBinById/${id}`); }

  // CATEGORY
  getCategories(): Observable<any> { return this.http.get(`${this.api}/Catagory/GetAllCatagory`); }
  createCategory(d: any): Observable<any> { return this.http.post(`${this.api}/Catagory/CreateCatagory`, this.withAudit(d)); }
  updateCategory(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Catagory/UpdateCatagoryById/${id}`, this.withAudit({ ...d, id })); }
  deleteCategory(id: number): Observable<any> { return this.http.delete(`${this.api}/Catagory/DeleteCatagoryById/${id}`); }

  // CHART OF ACCOUNTS
  getChartOfAccounts(): Observable<any> { return this.http.get(`${this.api}/ChartOfAccount/GetChartOfAccounts`); }

  // CITIES
  getCities(): Observable<any> { return this.http.get(`${this.api}/City/getAllCities`); }
  createCity(d: any): Observable<any> { return this.http.post(`${this.api}/City/CreateCities`, this.withAudit(d)); }
  updateCity(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/City/updateCities/${id}`, this.withAudit({ ...d, id })); }
  deleteCity(id: number): Observable<any> { return this.http.delete(`${this.api}/City/deleteCities/${id}`); }

  // COSTING METHOD
  getCostingMethods(): Observable<any> { return this.http.get(`${this.api}/costingMethod/GetAllcostingMethod`); }
  createCostingMethod(d: any): Observable<any> { return this.http.post(`${this.api}/costingMethod/createcostingMethod`, this.withAudit(d)); }
  updateCostingMethod(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/costingMethod/UpdatecostingMethodById/${id}`, this.withAudit({ ...d, id })); }
  deleteCostingMethod(id: number): Observable<any> { return this.http.delete(`${this.api}/costingMethod/DeletecostingMethodById/${id}`); }

  // COMPANY
  getOrganizationCompanyList(approvalLevelName = '', orgGuid = ''): Observable<any> { return this.http.get(`${this.api}/Company/organization-company-list`, { params: { approvalLevelName, orgGuid } }); }
  getCompanyById(id: number, orgGuid?: string): Observable<any> {
    const params: any = {};
    if (orgGuid) params.orgGuid = orgGuid;
    return this.http.get(`${this.api}/Company/${id}`, { params });
  }

  cacheCompanyLogo(): void {
    const companyId = Number(localStorage.getItem('companyId') || 0);
    if (!companyId) return;
    this.getCompanyById(companyId).subscribe({
      next: (res: any) => {
        if (res?.logoBase64) localStorage.setItem('companyLogoBase64', res.logoBase64);
        else localStorage.removeItem('companyLogoBase64');
        const g = res?.general || {};
        localStorage.setItem('companyPrintName',    g.name     || localStorage.getItem('companyName') || '');
        localStorage.setItem('companyPrintAddress1', g.address1 || '');
        localStorage.setItem('companyPrintAddress2', g.address2 || '');
        localStorage.setItem('companyPrintCity',     g.city     || '');
        localStorage.setItem('companyPrintState',    g.state    || '');
        localStorage.setItem('companyPrintPostal',   g.postal   || '');
        localStorage.setItem('companyPrintPhone',    g.phone    || '');
        localStorage.setItem('companyPrintEmail',    g.email    || '');
      },
      error: () => {}
    });
  }
  createCompanySetup(d: any): Observable<any> { return this.http.post(`${this.api}/organizations/create-from-company-setup`, d); }
  createCompanyUnderOrg(d: any): Observable<any> { return this.http.post(`${this.api}/organizations/create-company-under-org`, d); }
   setCompanyActive(masterCompanyId: number, isActive: boolean): Observable<any> { return this.http.patch(`${this.api}/Company/${masterCompanyId}/active`, { isActive }); }
  updateCompany(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Company/${id}`, d); }
  deleteCompany(id: number): Observable<any> { return this.http.delete(`${this.api}/Company/${id}`); }
  getOrganizationsLookup(): Observable<any> { return this.http.get(`${this.api}/organizations/lookup`); }

  // COUNTRIES
  getCountries(): Observable<any> { return this.http.get(`${this.api}/Country/getAll`); }
  createCountry(d: any): Observable<any> { return this.http.post(`${this.api}/Country/insert`, this.withAudit(d)); }
  updateCountry(d: any): Observable<any> { return this.http.put(`${this.api}/Country/update`, this.withAudit(d)); }
  deleteCountry(id: number): Observable<any> { return this.http.delete(`${this.api}/Country/Delete/${id}`); }

  // CURRENCY
  getCurrencies(): Observable<any> { return this.http.get(`${this.api}/Currency/GetCurrencies`); }
  createCurrency(d: any): Observable<any> { return this.http.post(`${this.api}/Currency/CreateCurrency`, this.withAudit(d)); }
  updateCurrency(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Currency/UpdateCurrencyById/${id}`, this.withAudit({ ...d, id })); }
  deleteCurrency(id: number): Observable<any> { return this.http.delete(`${this.api}/Currency/DeleteCurrencyById/${id}`); }

  // CUSTOMER GROUPS
  getCustomerGroups(): Observable<any> { return this.http.get(`${this.api}/CustomerGroups/getAllCustomerGroups`); }
  createCustomerGroup(d: any): Observable<any> { return this.http.post(`${this.api}/CustomerGroups/CreateCustomerGroups`, this.withAudit(d)); }
  updateCustomerGroup(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/CustomerGroups/updateCustomerGroups/${id}`, this.withAudit({ ...d, id })); }
  deleteCustomerGroup(id: number): Observable<any> { return this.http.delete(`${this.api}/CustomerGroups/deleteCustomerGroups/${id}`); }

  // DEPARTMENT
  getDepartments(): Observable<any> { return this.http.get(`${this.api}/Department/getAll`); }
  createDepartment(d: any): Observable<any> { return this.http.post(`${this.api}/Department/insert`, this.withAudit(d)); }
  updateDepartment(d: any): Observable<any> { return this.http.put(`${this.api}/Department/update`, this.withAudit(d)); }
  deleteDepartment(id: number): Observable<any> { return this.http.delete(`${this.api}/Department/Delete/${id}`); }

  // DRIVER
  getDrivers(): Observable<any> { return this.http.get(`${this.api}/Driver/GetAllDriver`); }
  createDriver(d: any): Observable<any> { return this.http.post(`${this.api}/Driver/createDriver`, this.withAudit(d)); }
  updateDriver(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Driver/updateDriverById/${id}`, this.withAudit({ ...d, id })); }
  deleteDriver(id: number): Observable<any> { return this.http.delete(`${this.api}/Driver/deleteDriverById/${id}`); }

  // FIXED ASSET
  getFixedAssets(): Observable<any> { return this.http.get(`${this.api}/FixedAsset/getAll`); }
  getFixedAsset(id: number): Observable<any> { return this.http.get(`${this.api}/FixedAsset/get/${id}`); }
  createFixedAsset(d: any): Observable<any> { return this.http.post(`${this.api}/FixedAsset/insert`, this.withAudit(d)); }
  updateFixedAsset(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/FixedAsset/update`, this.withAudit({ ...d, id })); }
  deleteFixedAsset(id: number): Observable<any> { return this.http.delete(`${this.api}/FixedAsset/delete/${id}`); }
  postFixedAssetAcquisition(id: number, fundingAccountId: any): Observable<any> { return this.http.post(`${this.api}/FixedAsset/${id}/post-acquisition`, { fundingAccountId }); }
  runFixedAssetDepreciation(asOfDate: any): Observable<any> { return this.http.post(`${this.api}/FixedAsset/run-depreciation`, { asOfDate }); }

  // CHART OF ACCOUNTS (dropdown helper)
  // getChartOfAccounts() is defined in the Chart Of Account section above.

  // EXCHANGE RATE
  getExchangeRates(): Observable<any> { return this.http.get(`${this.api}/ExchangeRate/GetAll`); }
  createExchangeRate(d: any): Observable<any> { return this.http.post(`${this.api}/ExchangeRate/Create`, this.withAudit(d)); }
  updateExchangeRate(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/ExchangeRate/Update/${id}`, this.withAudit({ ...d, id })); }
  deleteExchangeRate(id: number): Observable<any> { return this.http.delete(`${this.api}/ExchangeRate/Delete/${id}`); }
  getExchangeRateTimeline(fromCurrencyId: number, toCurrencyId: number): Observable<any> { return this.http.get(`${this.api}/ExchangeRate/GetTimeline?fromCurrencyId=${fromCurrencyId}&toCurrencyId=${toCurrencyId}`); }
  getExchangeRateAudit(fromCurrencyId: number, toCurrencyId: number): Observable<any> { return this.http.get(`${this.api}/ExchangeRate/GetAudit?fromCurrencyId=${fromCurrencyId}&toCurrencyId=${toCurrencyId}`); }

  // FLAG ISSUE
  getFlagIssues(): Observable<any> { return this.http.get(`${this.api}/FlagIssues/GetAllFlagissue`); }
  createFlagIssue(d: any): Observable<any> { return this.http.post(`${this.api}/FlagIssues/createFlagissue`, this.withAudit(d)); }
  updateFlagIssue(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/FlagIssues/updateFlagissueById/${id}`, this.withAudit({ ...d, id })); }
  deleteFlagIssue(id: number): Observable<any> { return this.http.delete(`${this.api}/FlagIssues/deleteFlagissueById/${id}`); }

  // INCOTERMS
  getIncoterms(): Observable<any> { return this.http.get(`${this.api}/incoterms/GetAllIncoterms`); }
  createIncoterm(d: any): Observable<any> { return this.http.post(`${this.api}/incoterms/CreateIncoterms`, this.withAudit(d)); }
  updateIncoterm(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/incoterms/UpdateIncotermsById/${id}`, this.withAudit({ ...d, id })); }
  deleteIncoterm(id: number): Observable<any> { return this.http.delete(`${this.api}/incoterms/DeleteIncotermsById/${id}`); }

  // ITEM TYPE
  getItemTypes(): Observable<any> { return this.http.get(`${this.api}/ItemType/GetItemType`); }
  createItemType(d: any): Observable<any> { return this.http.post(`${this.api}/ItemType/CreateItemType`, this.withAudit(d)); }
  updateItemType(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/ItemType/UpdateItemTypeById/${id}`, this.withAudit({ ...d, id })); }
  deleteItemType(id: number): Observable<any> { return this.http.delete(`${this.api}/ItemType/DeleteItemTypeById/${id}`); }

  // LOCATION (Outlet)
  getLocations(): Observable<any> { return this.http.get(`${this.api}/Location/getAllLocation`); }
  createLocation(d: any): Observable<any> { return this.http.post(`${this.api}/Location/CreateLocation`, this.withAudit(d)); }
  updateLocation(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Location/updateLocation/${id}`, this.withAudit({ ...d, id })); }
  deleteLocation(id: number): Observable<any> { return this.http.delete(`${this.api}/Location/deleteLocation/${id}`); }

  // ITEM SET (Package)
  getItemSets(): Observable<any> { return this.http.get(`${this.api}/ItemSet/GetAllItemSet`); }
  createItemSet(d: any): Observable<any> { return this.http.post(`${this.api}/ItemSet/createItemSet`, this.withAudit(d)); }
  updateItemSet(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/ItemSet/updateItemSetById/${id}`, this.withAudit({ ...d, id })); }
  deleteItemSet(id: number): Observable<any> { return this.http.delete(`${this.api}/ItemSet/deleteItemSetById/${id}`); }
  getItemMaster(): Observable<any> { return this.http.get(`${this.api}/ItemMaster/GetItems`); }

  // PAYMENT TERMS
  getPaymentTerms(): Observable<any> { return this.http.get(`${this.api}/PaymentTerms/GetPaymentTerms`); }
  createPaymentTerm(d: any): Observable<any> { return this.http.post(`${this.api}/PaymentTerms/CreatePaymentTerm`, this.withAudit(d)); }
  updatePaymentTerm(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/PaymentTerms/UpdatePaymentTermById/${id}`, this.withAudit({ ...d, id })); }
  deletePaymentTerm(id: number): Observable<any> { return this.http.delete(`${this.api}/PaymentTerms/DeletePaymentTermById/${id}`); }

  // RECURRING
  getRecurring(): Observable<any> { return this.http.get(`${this.api}/Recurring/getAll`); }
  createRecurring(d: any): Observable<any> { return this.http.post(`${this.api}/Recurring/insert`, this.withAudit(d)); }
  updateRecurring(d: any): Observable<any> { return this.http.put(`${this.api}/Recurring/update`, this.withAudit(d)); }
  deleteRecurring(id: number): Observable<any> { return this.http.delete(`${this.api}/Recurring/Delete/${id}`); }

  // SERVICE
  getServices(): Observable<any> { return this.http.get(`${this.api}/Service/getAllService`); }
  createService(d: any): Observable<any> { return this.http.post(`${this.api}/Service/CreateService`, this.withAudit(d)); }
  updateService(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Service/updateService/${id}`, this.withAudit({ ...d, id })); }
  deleteService(id: number): Observable<any> { return this.http.delete(`${this.api}/Service/deleteService/${id}`); }

  // STATES
  getStates(): Observable<any> { return this.http.get(`${this.api}/State/getAllState`); }
  getStatesByCountry(countryId: number): Observable<any> { return this.http.get(`${this.api}/City/GetStateWithCountryId/${countryId}`); }
  getCitiesByState(stateId: number): Observable<any> { return this.http.get(`${this.api}/City/GetCityWithStateId/${stateId}`); }
  createState(d: any): Observable<any> { return this.http.post(`${this.api}/State/CreateState`, this.withAudit(d)); }
  updateState(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/State/updateState/${id}`, this.withAudit({ ...d, id })); }
  deleteState(id: number): Observable<any> { return this.http.delete(`${this.api}/State/deleteState/${id}`); }

  // STOCK ISSUE
  getStockIssues(): Observable<any> { return this.http.get(`${this.api}/Stockissues/GetAllStockissue`); }
  createStockIssue(d: any): Observable<any> { return this.http.post(`${this.api}/Stockissues/createStockissue`, this.withAudit(d)); }
  updateStockIssue(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Stockissues/updateStockissueById/${id}`, this.withAudit({ ...d, id })); }
  deleteStockIssue(id: number): Observable<any> { return this.http.delete(`${this.api}/Stockissues/deleteStockissueById/${id}`); }

  // STRATEGY (Frequency)
  getStrategies(): Observable<any> { return this.http.get(`${this.api}/Strategy/getAll`); }
  createStrategy(d: any): Observable<any> { return this.http.post(`${this.api}/Strategy/insert`, this.withAudit(d)); }
  updateStrategy(d: any): Observable<any> { return this.http.put(`${this.api}/Strategy/update`, this.withAudit(d)); }
  deleteStrategy(id: number): Observable<any> { return this.http.delete(`${this.api}/Strategy/Delete/${id}`); }

  // SUPPLIER GROUPS
  getSupplierGroups(): Observable<any> { return this.http.get(`${this.api}/SupplierGroups/getAllSupplierGroups`); }
  createSupplierGroup(d: any): Observable<any> { return this.http.post(`${this.api}/SupplierGroups/CreateSupplierGroups`, this.withAudit(d)); }
  updateSupplierGroup(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/SupplierGroups/updateSupplierGroups/${id}`, this.withAudit({ ...d, id })); }
  deleteSupplierGroup(id: number): Observable<any> { return this.http.delete(`${this.api}/SupplierGroups/deleteSupplierGroups/${id}`); }

  // TAX CODE
  getTaxCodes(): Observable<any> { return this.http.get(`${this.api}/TaxCode/getAll`); }
  createTaxCode(d: any): Observable<any> { return this.http.post(`${this.api}/TaxCode/insert`, this.withAudit(d)); }
  updateTaxCode(d: any): Observable<any> { return this.http.put(`${this.api}/TaxCode/update`, this.withAudit(d)); }
  deleteTaxCode(id: number): Observable<any> { return this.http.delete(`${this.api}/TaxCode/Delete/${id}`); }

  // UOM
  getUoms(): Observable<any> { return this.http.get(`${this.api}/uom/GetUoms`); }
  createUom(d: any): Observable<any> { return this.http.post(`${this.api}/uom/CreateUom`, this.withAudit(d)); }
  updateUom(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/uom/UpdateUomById/${id}`, this.withAudit({ ...d, id })); }
  deleteUom(id: number): Observable<any> { return this.http.delete(`${this.api}/uom/DeleteUomById/${id}`); }

  // UOM CONVERSION
  getUomConversions(): Observable<any> { return this.http.get(`${this.api}/UomConversion/GetUomConversions`); }
  createUomConversion(d: any): Observable<any> { return this.http.post(`${this.api}/UomConversion/CreateUomConversion`, this.withAudit(d)); }
  updateUomConversion(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/UomConversion/UpdateUomConversionById/${id}`, this.withAudit({ ...d, id })); }
  deleteUomConversion(id: number): Observable<any> { return this.http.delete(`${this.api}/UomConversion/DeleteUomConversionById/${id}`); }

  // VEHICLE
  getVehicles(): Observable<any> { return this.http.get(`${this.api}/vehicle/GetVehicles`); }
  createVehicle(d: any): Observable<any> { return this.http.post(`${this.api}/vehicle/CreateVehicle`, this.withAudit(d)); }
  updateVehicle(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/vehicle/UpdateVehicleById/${id}`, this.withAudit({ ...d, id })); }
  deleteVehicle(id: number): Observable<any> { return this.http.delete(`${this.api}/vehicle/DeleteVehicleById/${id}`); }

  // WAREHOUSE
  getWarehouses(): Observable<any> { return this.http.get(`${this.api}/Warehouse/getAll`); }
  createWarehouse(d: any): Observable<any> { return this.http.post(`${this.api}/Warehouse/insert`, this.withAudit(d)); }
  updateWarehouse(d: any): Observable<any> { return this.http.put(`${this.api}/Warehouse/update`, this.withAudit(d)); }
  deleteWarehouse(id: number): Observable<any> { return this.http.delete(`${this.api}/Warehouse/Delete/${id}`); }
}
