import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MasterService {
  private api = environment.apiUrl;
  constructor(private http: HttpClient) {}

  // APPROVAL LEVEL
  getApprovalLevels(): Observable<any> { return this.http.get(`${this.api}/ApprovalLevel/GetApprovalLevels`); }
  createApprovalLevel(d: any): Observable<any> { return this.http.post(`${this.api}/ApprovalLevel/CreateApprovalLevel`, d); }
  updateApprovalLevel(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/ApprovalLevel/UpdateApprovalLevelById/${id}`, d); }
  deleteApprovalLevel(id: number): Observable<any> { return this.http.delete(`${this.api}/ApprovalLevel/DeleteApprovalLevelById/${id}`); }

  // BANK
  getBanks(): Observable<any> { return this.http.get(`${this.api}/Bank/GetAllBank`); }
  createBank(d: any): Observable<any> { return this.http.post(`${this.api}/Bank/createBank`, d); }
  updateBank(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Bank/updateBankById/${id}`, d); }
  deleteBank(id: number): Observable<any> { return this.http.delete(`${this.api}/Bank/deleteBankById/${id}`); }

  // BIN
  getBins(): Observable<any> { return this.http.get(`${this.api}/Bin/GetAllBin`); }
  createBin(d: any): Observable<any> { return this.http.post(`${this.api}/Bin/createBin`, d); }
  updateBin(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Bin/updateBinById/${id}`, d); }
  deleteBin(id: number): Observable<any> { return this.http.delete(`${this.api}/Bin/deleteBinById/${id}`); }

  // CATEGORY
  getCategories(): Observable<any> { return this.http.get(`${this.api}/Catagory/GetAllCatagory`); }
  createCategory(d: any): Observable<any> { return this.http.post(`${this.api}/Catagory/CreateCatagory`, d); }
  updateCategory(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Catagory/UpdateCatagoryById/${id}`, d); }
  deleteCategory(id: number): Observable<any> { return this.http.delete(`${this.api}/Catagory/DeleteCatagoryById/${id}`); }

  // CHART OF ACCOUNTS
  getChartOfAccounts(): Observable<any> { return this.http.get(`${this.api}/ChartOfAccount/GetChartOfAccounts`); }

  // CITIES
  getCities(): Observable<any> { return this.http.get(`${this.api}/City/getAllCities`); }
  createCity(d: any): Observable<any> { return this.http.post(`${this.api}/City/CreateCities`, d); }
  updateCity(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/City/updateCities/${id}`, d); }
  deleteCity(id: number): Observable<any> { return this.http.delete(`${this.api}/City/deleteCities/${id}`); }

  // COSTING METHOD
  getCostingMethods(): Observable<any> { return this.http.get(`${this.api}/costingMethod/GetAllcostingMethod`); }
  createCostingMethod(d: any): Observable<any> { return this.http.post(`${this.api}/costingMethod/createcostingMethod`, d); }
  updateCostingMethod(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/costingMethod/UpdatecostingMethodById/${id}`, d); }
  deleteCostingMethod(id: number): Observable<any> { return this.http.delete(`${this.api}/costingMethod/DeletecostingMethodById/${id}`); }

  // COMPANY
  getOrganizationCompanyList(approvalLevelName = '', orgGuid = ''): Observable<any> { return this.http.get(`${this.api}/Company/organization-company-list`, { params: { approvalLevelName, orgGuid } }); }
  getCompanyById(id: number): Observable<any> { return this.http.get(`${this.api}/Company/${id}`); }
  createCompanySetup(d: any): Observable<any> { return this.http.post(`${this.api}/organizations/create-from-company-setup`, d); }
  createCompanyUnderOrg(d: any): Observable<any> { return this.http.post(`${this.api}/organizations/create-company-under-org`, d); }
  updateCompany(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Company/${id}`, d); }
  deleteCompany(id: number): Observable<any> { return this.http.delete(`${this.api}/Company/${id}`); }
  getOrganizationsLookup(): Observable<any> { return this.http.get(`${this.api}/organizations/lookup`); }

  // COUNTRIES
  getCountries(): Observable<any> { return this.http.get(`${this.api}/Country/getAll`); }
  createCountry(d: any): Observable<any> { return this.http.post(`${this.api}/Country/insert`, d); }
  updateCountry(d: any): Observable<any> { return this.http.put(`${this.api}/Country/update`, d); }
  deleteCountry(id: number): Observable<any> { return this.http.delete(`${this.api}/Country/Delete/${id}`); }

  // CURRENCY
  getCurrencies(): Observable<any> { return this.http.get(`${this.api}/Currency/GetCurrencies`); }
  createCurrency(d: any): Observable<any> { return this.http.post(`${this.api}/Currency/CreateCurrency`, d); }
  updateCurrency(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Currency/UpdateCurrencyById/${id}`, d); }
  deleteCurrency(id: number): Observable<any> { return this.http.delete(`${this.api}/Currency/DeleteCurrencyById/${id}`); }

  // CUSTOMER GROUPS
  getCustomerGroups(): Observable<any> { return this.http.get(`${this.api}/CustomerGroups/getAllCustomerGroups`); }
  createCustomerGroup(d: any): Observable<any> { return this.http.post(`${this.api}/CustomerGroups/CreateCustomerGroups`, d); }
  updateCustomerGroup(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/CustomerGroups/updateCustomerGroups/${id}`, d); }
  deleteCustomerGroup(id: number): Observable<any> { return this.http.delete(`${this.api}/CustomerGroups/deleteCustomerGroups/${id}`); }

  // DEPARTMENT
  getDepartments(): Observable<any> { return this.http.get(`${this.api}/Department/getAll`); }
  createDepartment(d: any): Observable<any> { return this.http.post(`${this.api}/Department/insert`, d); }
  updateDepartment(d: any): Observable<any> { return this.http.put(`${this.api}/Department/update`, d); }
  deleteDepartment(id: number): Observable<any> { return this.http.delete(`${this.api}/Department/Delete/${id}`); }

  // DRIVER
  getDrivers(): Observable<any> { return this.http.get(`${this.api}/Driver/GetAllDriver`); }
  createDriver(d: any): Observable<any> { return this.http.post(`${this.api}/Driver/createDriver`, d); }
  updateDriver(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Driver/updateDriverById/${id}`, d); }
  deleteDriver(id: number): Observable<any> { return this.http.delete(`${this.api}/Driver/deleteDriverById/${id}`); }

  // EXCHANGE RATE
  getExchangeRates(): Observable<any> { return this.http.get(`${this.api}/ExchangeRate/GetAll`); }
  createExchangeRate(d: any): Observable<any> { return this.http.post(`${this.api}/ExchangeRate/Create`, d); }
  updateExchangeRate(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/ExchangeRate/Update/${id}`, d); }
  deleteExchangeRate(id: number): Observable<any> { return this.http.delete(`${this.api}/ExchangeRate/Delete/${id}`); }

  // FLAG ISSUE
  getFlagIssues(): Observable<any> { return this.http.get(`${this.api}/FlagIssues/GetAllFlagissue`); }
  createFlagIssue(d: any): Observable<any> { return this.http.post(`${this.api}/FlagIssues/createFlagissue`, d); }
  updateFlagIssue(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/FlagIssues/updateFlagissueById/${id}`, d); }
  deleteFlagIssue(id: number): Observable<any> { return this.http.delete(`${this.api}/FlagIssues/deleteFlagissueById/${id}`); }

  // INCOTERMS
  getIncoterms(): Observable<any> { return this.http.get(`${this.api}/incoterms/GetAllIncoterms`); }
  createIncoterm(d: any): Observable<any> { return this.http.post(`${this.api}/incoterms/CreateIncoterms`, d); }
  updateIncoterm(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/incoterms/UpdateIncotermsById/${id}`, d); }
  deleteIncoterm(id: number): Observable<any> { return this.http.delete(`${this.api}/incoterms/DeleteIncotermsById/${id}`); }

  // ITEM TYPE
  getItemTypes(): Observable<any> { return this.http.get(`${this.api}/ItemType/GetItemType`); }
  createItemType(d: any): Observable<any> { return this.http.post(`${this.api}/ItemType/CreateItemType`, d); }
  updateItemType(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/ItemType/UpdateItemTypeById/${id}`, d); }
  deleteItemType(id: number): Observable<any> { return this.http.delete(`${this.api}/ItemType/DeleteItemTypeById/${id}`); }

  // LOCATION (Outlet)
  getLocations(): Observable<any> { return this.http.get(`${this.api}/Location/getAllLocation`); }
  createLocation(d: any): Observable<any> { return this.http.post(`${this.api}/Location/CreateLocation`, d); }
  updateLocation(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Location/updateLocation/${id}`, d); }
  deleteLocation(id: number): Observable<any> { return this.http.delete(`${this.api}/Location/deleteLocation/${id}`); }

  // ITEM SET (Package)
  getItemSets(): Observable<any> { return this.http.get(`${this.api}/ItemSet/GetAllItemSet`); }
  createItemSet(d: any): Observable<any> { return this.http.post(`${this.api}/ItemSet/createItemSet`, d); }
  updateItemSet(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/ItemSet/updateItemSetById/${id}`, d); }
  deleteItemSet(id: number): Observable<any> { return this.http.delete(`${this.api}/ItemSet/deleteItemSetById/${id}`); }
  getItemMaster(): Observable<any> { return this.http.get(`${this.api}/ItemMaster/GetItems`); }

  // PAYMENT TERMS
  getPaymentTerms(): Observable<any> { return this.http.get(`${this.api}/PaymentTerms/GetPaymentTerms`); }
  createPaymentTerm(d: any): Observable<any> { return this.http.post(`${this.api}/PaymentTerms/CreatePaymentTerm`, d); }
  updatePaymentTerm(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/PaymentTerms/UpdatePaymentTermById/${id}`, d); }
  deletePaymentTerm(id: number): Observable<any> { return this.http.delete(`${this.api}/PaymentTerms/DeletePaymentTermById/${id}`); }

  // RECURRING
  getRecurring(): Observable<any> { return this.http.get(`${this.api}/Recurring/getAll`); }
  createRecurring(d: any): Observable<any> { return this.http.post(`${this.api}/Recurring/insert`, d); }
  updateRecurring(d: any): Observable<any> { return this.http.put(`${this.api}/Recurring/update`, d); }
  deleteRecurring(id: number): Observable<any> { return this.http.delete(`${this.api}/Recurring/Delete/${id}`); }

  // SERVICE
  getServices(): Observable<any> { return this.http.get(`${this.api}/Service/getAllService`); }
  createService(d: any): Observable<any> { return this.http.post(`${this.api}/Service/CreateService`, d); }
  updateService(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Service/updateService/${id}`, d); }
  deleteService(id: number): Observable<any> { return this.http.delete(`${this.api}/Service/deleteService/${id}`); }

  // STATES
  getStates(): Observable<any> { return this.http.get(`${this.api}/State/getAllState`); }
  createState(d: any): Observable<any> { return this.http.post(`${this.api}/State/CreateState`, d); }
  updateState(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/State/updateState/${id}`, d); }
  deleteState(id: number): Observable<any> { return this.http.delete(`${this.api}/State/deleteState/${id}`); }

  // STOCK ISSUE
  getStockIssues(): Observable<any> { return this.http.get(`${this.api}/Stockissues/GetAllStockissue`); }
  createStockIssue(d: any): Observable<any> { return this.http.post(`${this.api}/Stockissues/createStockissue`, d); }
  updateStockIssue(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/Stockissues/updateStockissueById/${id}`, d); }
  deleteStockIssue(id: number): Observable<any> { return this.http.delete(`${this.api}/Stockissues/deleteStockissueById/${id}`); }

  // STRATEGY (Frequency)
  getStrategies(): Observable<any> { return this.http.get(`${this.api}/Strategy/getAll`); }
  createStrategy(d: any): Observable<any> { return this.http.post(`${this.api}/Strategy/insert`, d); }
  updateStrategy(d: any): Observable<any> { return this.http.put(`${this.api}/Strategy/update`, d); }
  deleteStrategy(id: number): Observable<any> { return this.http.delete(`${this.api}/Strategy/Delete/${id}`); }

  // SUPPLIER GROUPS
  getSupplierGroups(): Observable<any> { return this.http.get(`${this.api}/SupplierGroups/getAllSupplierGroups`); }
  createSupplierGroup(d: any): Observable<any> { return this.http.post(`${this.api}/SupplierGroups/CreateSupplierGroups`, d); }
  updateSupplierGroup(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/SupplierGroups/updateSupplierGroups/${id}`, d); }
  deleteSupplierGroup(id: number): Observable<any> { return this.http.delete(`${this.api}/SupplierGroups/deleteSupplierGroups/${id}`); }

  // TAX CODE
  getTaxCodes(): Observable<any> { return this.http.get(`${this.api}/TaxCode/getAll`); }
  createTaxCode(d: any): Observable<any> { return this.http.post(`${this.api}/TaxCode/insert`, d); }
  updateTaxCode(d: any): Observable<any> { return this.http.put(`${this.api}/TaxCode/update`, d); }
  deleteTaxCode(id: number): Observable<any> { return this.http.delete(`${this.api}/TaxCode/Delete/${id}`); }

  // UOM
  getUoms(): Observable<any> { return this.http.get(`${this.api}/uom/GetUoms`); }
  createUom(d: any): Observable<any> { return this.http.post(`${this.api}/uom/CreateUom`, d); }
  updateUom(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/uom/UpdateUomById/${id}`, d); }
  deleteUom(id: number): Observable<any> { return this.http.delete(`${this.api}/uom/DeleteUomById/${id}`); }

  // UOM CONVERSION
  getUomConversions(): Observable<any> { return this.http.get(`${this.api}/UomConversion/GetUomConversions`); }
  createUomConversion(d: any): Observable<any> { return this.http.post(`${this.api}/UomConversion/CreateUomConversion`, d); }
  updateUomConversion(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/UomConversion/UpdateUomConversionById/${id}`, d); }
  deleteUomConversion(id: number): Observable<any> { return this.http.delete(`${this.api}/UomConversion/DeleteUomConversionById/${id}`); }

  // VEHICLE
  getVehicles(): Observable<any> { return this.http.get(`${this.api}/vehicle/GetVehicles`); }
  createVehicle(d: any): Observable<any> { return this.http.post(`${this.api}/vehicle/CreateVehicle`, d); }
  updateVehicle(id: number, d: any): Observable<any> { return this.http.put(`${this.api}/vehicle/UpdateVehicleById/${id}`, d); }
  deleteVehicle(id: number): Observable<any> { return this.http.delete(`${this.api}/vehicle/DeleteVehicleById/${id}`); }

  // WAREHOUSE
  getWarehouses(): Observable<any> { return this.http.get(`${this.api}/Warehouse/getAll`); }
  createWarehouse(d: any): Observable<any> { return this.http.post(`${this.api}/Warehouse/insert`, d); }
  updateWarehouse(d: any): Observable<any> { return this.http.put(`${this.api}/Warehouse/update`, d); }
  deleteWarehouse(id: number): Observable<any> { return this.http.delete(`${this.api}/Warehouse/Delete/${id}`); }
}
