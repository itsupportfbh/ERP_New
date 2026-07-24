import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MasterService } from '../../../core/services/master.service';

/** Master types that support inline quick-add from any dropdown. */
export type QuickAddType =
  | 'paymentTerms' | 'incoterms' | 'location' | 'department' | 'uom'
  | 'customerGroup' | 'supplierGroup' | 'warehouse' | 'bin' | 'itemType'
  | 'category' | 'costingMethod' | 'strategy' | 'taxCode' | 'driver'
  | 'vehicle' | 'flagIssue' | 'city' | 'currency';

/** Result emitted after a master is created and its id resolved. */
export interface QuickAddResult {
  type: QuickAddType;
  id: number;
  label: string;
  /** Mobile number typed in the popup (masters created with `needs: 'mobile'`, e.g. Driver),
   *  so the calling form can show it straight away without re-reading the master. */
  mobile?: string;
}

interface QaExtra {
  locationId: number | null;
  categoryType: number | null;
  countryId: number | null;
  stateId: number | null;
  cityId: number | null;
  mobileNumber: string;
}

type Cfg = {
  title: string;
  nameLabel: string;
  /** Business payload from the typed name + any extra field (audit added by MasterService). */
  build: (name: string, extra: QaExtra) => any;
  create: (svc: MasterService, payload: any) => Observable<any>;
  /** Re-fetch the list so we can resolve the new row's id by matching the name. */
  list: (svc: MasterService) => Observable<any>;
  /** Field on a list row holding the name we matched on. */
  nameField: string;
  /** Extra required control this master needs beyond the name:
   *  'location' = a Location picker (Warehouse), 'categoryType' = Sales/Purchase/Both
   *  (Category), 'geo' = Country→State→City cascade (Location itself). */
  needs?: 'location' | 'categoryType' | 'geo' | 'mobile';
};

/**
 * Reusable inline "+ Add new" popup. A form opens it from any `erp-dropdown`'s
 * (addNew) event, the user types a name (plus one extra field for Warehouse /
 * Category), we create the master via MasterService, resolve its id by re-reading
 * the list, and emit {type,id,label} so the form can append + select it — no
 * navigation away from the form.
 */
@Component({
  selector: 'erp-quick-add-modal',
  standalone: false,
  templateUrl: './quick-add-modal.component.html',
  styleUrls: ['./quick-add-modal.component.scss']
})
export class QuickAddModalComponent implements OnChanges {
  @Input() type: QuickAddType | null = null;
  @Input() visible = false;
  @Input() prefillName = '';

  @Output() created = new EventEmitter<QuickAddResult>();
  @Output() closed = new EventEmitter<void>();

  name = '';
  saving = false;
  error = '';

  // Extra fields (only shown for the masters that require them).
  locationId: number | null = null;
  categoryType: number | null = null;
  /**
   * Digits only, hard-capped at 10 — typing letters or an 11th digit simply does nothing,
   * so the user cannot enter an invalid number rather than being told off after Save.
   */
  private _mobileNumber = '';
  get mobileNumber(): string { return this._mobileNumber; }
  set mobileNumber(v: string) {
    this._mobileNumber = String(v ?? '').replace(/\D/g, '').slice(0, 10);
    // Clear the warning as soon as it is satisfied, instead of leaving it on screen
    // until the user presses Save again.
    if (this._mobileNumber.length === 10 && /Mobile No/i.test(this.error)) this.error = '';
  }
  locationOptions: { label: string; value: any }[] = [];
  readonly categoryTypeOptions = [
    { label: 'Sales', value: 1 },
    { label: 'Purchase', value: 2 },
    { label: 'Both', value: 3 },
  ];

  // Geo cascade (Country → State → City) — required when creating a Location.
  geoCountryId: number | null = null;
  geoStateId: number | null = null;
  geoCityId: number | null = null;
  countryOptions: { label: string; value: any }[] = [];
  stateOptions: { label: string; value: any }[] = [];
  cityOptions: { label: string; value: any }[] = [];

  private readonly cfg: Record<QuickAddType, Cfg> = {
    paymentTerms: {
      title: 'Add Payment Term', nameLabel: 'Payment Term Name',
      build: n => ({ paymentTermsName: n, description: '' }),
      create: (s, p) => s.createPaymentTerm(p), list: s => s.getPaymentTerms(), nameField: 'paymentTermsName',
    },
    incoterms: {
      title: 'Add Incoterm', nameLabel: 'Incoterm Name',
      build: n => ({ incotermsName: n }),
      create: (s, p) => s.createIncoterm(p), list: s => s.getIncoterms(), nameField: 'incotermsName',
    },
    location: {
      title: 'Add Outlet / Location', nameLabel: 'Location Name', needs: 'geo',
      build: (n, e) => ({ name: n, countryId: e.countryId, stateId: e.stateId, cityId: e.cityId, contactNumber: '' }),
      create: (s, p) => s.createLocation(p), list: s => s.getLocations(), nameField: 'name',
    },
    department: {
      title: 'Add Department', nameLabel: 'Department Name',
      build: n => ({ departmentName: n, departmentCode: '' }),
      create: (s, p) => s.createDepartment(p), list: s => s.getDepartments(), nameField: 'departmentName',
    },
    uom: {
      title: 'Add UOM', nameLabel: 'UOM Name',
      build: n => ({ name: n, description: '' }),
      create: (s, p) => s.createUom(p), list: s => s.getUoms(), nameField: 'name',
    },
    customerGroup: {
      title: 'Add Customer Group', nameLabel: 'Group Name',
      build: n => ({ name: n, description: '' }),
      create: (s, p) => s.createCustomerGroup(p), list: s => s.getCustomerGroups(), nameField: 'name',
    },
    supplierGroup: {
      title: 'Add Supplier Group', nameLabel: 'Group Name',
      build: n => ({ name: n, description: '' }),
      create: (s, p) => s.createSupplierGroup(p), list: s => s.getSupplierGroups(), nameField: 'name',
    },
    warehouse: {
      title: 'Add Warehouse', nameLabel: 'Warehouse Name', needs: 'location',
      build: (n, e) => ({ name: n, code: '', locationId: e.locationId }),
      create: (s, p) => s.createWarehouse(p), list: s => s.getWarehouses(), nameField: 'name',
    },
    bin: {
      title: 'Add Bin', nameLabel: 'Bin Name',
      build: n => ({ binName: n, description: '' }),
      create: (s, p) => s.createBin(p), list: s => s.getBins(), nameField: 'binName',
    },
    itemType: {
      title: 'Add Item Type', nameLabel: 'Item Type Name',
      build: n => ({ itemTypeName: n, description: '' }),
      create: (s, p) => s.createItemType(p), list: s => s.getItemTypes(), nameField: 'itemTypeName',
    },
    category: {
      title: 'Add Category', nameLabel: 'Category Name', needs: 'categoryType',
      build: (n, e) => ({ catagoryName: n, itemCategoryType: e.categoryType }),
      create: (s, p) => s.createCategory(p), list: s => s.getCategories(), nameField: 'catagoryName',
    },
    costingMethod: {
      title: 'Add Costing Method', nameLabel: 'Costing Method Name',
      build: n => ({ costingName: n, description: '' }),
      create: (s, p) => s.createCostingMethod(p), list: s => s.getCostingMethods(), nameField: 'costingName',
    },
    strategy: {
      title: 'Add Strategy', nameLabel: 'Strategy Name',
      build: n => ({ strategyName: n }),
      create: (s, p) => s.createStrategy(p), list: s => s.getStrategies(), nameField: 'strategyName',
    },
    taxCode: {
      title: 'Add Tax Code', nameLabel: 'Tax Code Name',
      // Rate/TypeId are NOT NULL in the DB — default them so a name-only quick-add succeeds.
      build: n => ({ name: n, description: '', rate: 0, typeId: 0 }),
      create: (s, p) => s.createTaxCode(p), list: s => s.getTaxCodes(), nameField: 'name',
    },
    driver: {
      title: 'Add Driver', nameLabel: 'Driver Name', needs: 'mobile',
      // Mobile is captured here (a driver without a contact number is not much use on a
      // delivery). LicenseNumber/LicenseExpiryDate are NOT NULL — still placeholders, to be
      // completed later in the Driver master.
      // Driver.MobileNumber is a long on the API, so strip spaces/dashes and send digits only.
      build: (n, e) => ({
        driverName: n,
        mobileNumber: Number(String(e.mobileNumber ?? '').replace(/\D/g, '')) || 0,
        licenseNumber: '', licenseExpiryDate: '1900-01-01', nricOrId: ''
      }),
      create: (s, p) => s.createDriver(p), list: s => s.getDrivers(), nameField: 'driverName',
    },
    vehicle: {
      title: 'Add Vehicle', nameLabel: 'Vehicle No',
      build: n => ({ vehicleNo: n }),
      create: (s, p) => s.createVehicle(p), list: s => s.getVehicles(), nameField: 'vehicleNo',
    },
    flagIssue: {
      title: 'Add Flag Issue', nameLabel: 'Flag Issue Name',
      build: n => ({ flagIssuesNames: n }),
      create: (s, p) => s.createFlagIssue(p), list: s => s.getFlagIssues(), nameField: 'flagIssuesNames',
    },
    city: {
      title: 'Add City', nameLabel: 'City Name',
      build: n => ({ cityName: n }),
      create: (s, p) => s.createCity(p), list: s => s.getCities(), nameField: 'cityName',
    },
    currency: {
      title: 'Add Currency', nameLabel: 'Currency Name',
      build: n => ({ currencyName: n, description: '', symbol: '' }),
      create: (s, p) => s.createCurrency(p), list: s => s.getCurrencies(), nameField: 'currencyName',
    },
  };

  constructor(private master: MasterService) {}

  ngOnChanges(ch: SimpleChanges): void {
    // When the popup is (re)opened, seed the name with what the user typed in the
    // dropdown search box and reset everything else.
    if ((ch['visible'] && this.visible) || (ch['prefillName'] && this.visible)) {
      this.name = (this.prefillName || '').trim();
      this.error = '';
      this.saving = false;
      this.locationId = null;
      this.categoryType = null;
      this.mobileNumber = '';
      this.geoCountryId = null;
      this.geoStateId = null;
      this.geoCityId = null;
      this.stateOptions = [];
      this.cityOptions = [];
      if (this.current?.needs === 'location') this.loadLocations();
      if (this.current?.needs === 'geo') this.loadGeo();
    }
  }

  get current(): Cfg | null { return this.type ? this.cfg[this.type] : null; }
  get title(): string { return this.current?.title ?? 'Add'; }
  get nameLabel(): string { return this.current?.nameLabel ?? 'Name'; }
  get needsLocation(): boolean { return this.current?.needs === 'location'; }
  get needsCategoryType(): boolean { return this.current?.needs === 'categoryType'; }
  get needsGeo(): boolean { return this.current?.needs === 'geo'; }
  get needsMobile(): boolean { return this.current?.needs === 'mobile'; }

  private loadLocations(): void {
    this.master.getLocations().pipe(catchError(() => of([]))).subscribe((res: any) => {
      this.locationOptions = this.rows(res).map((r: any) => ({
        label: r.locationName ?? r.name ?? '', value: r.id,
      }));
    });
  }

  /** Loads the country list for the Location cascade. States and cities are fetched
   *  on demand when a parent is picked (race-free — no reliance on a pre-loaded list). */
  private loadGeo(): void {
    this.master.getCountries().pipe(catchError(() => of([]))).subscribe((r: any) => {
      this.countryOptions = this.rows(r).map((x: any) => ({ label: x.countryName ?? x.name ?? '', value: x.id }));
    });
  }

  onGeoCountry(): void {
    this.geoStateId = null;
    this.geoCityId = null;
    this.stateOptions = [];
    this.cityOptions = [];
    const cid = Number(this.geoCountryId);
    if (!cid) return;
    this.master.getStatesByCountry(cid).pipe(catchError(() => of([]))).subscribe((r: any) => {
      this.stateOptions = this.rows(r).map((s: any) => ({ label: s.stateName ?? s.name ?? '', value: s.id }));
    });
  }

  onGeoState(): void {
    this.geoCityId = null;
    this.cityOptions = [];
    const sid = Number(this.geoStateId);
    if (!sid) return;
    this.master.getCitiesByState(sid).pipe(catchError(() => of([]))).subscribe((r: any) => {
      this.cityOptions = this.rows(r).map((c: any) => ({ label: c.cityName ?? c.name ?? '', value: c.id }));
    });
  }

  close(): void {
    if (this.saving) return;
    this.closed.emit();
  }

  save(): void {
    const cfg = this.current;
    if (!cfg) { this.close(); return; }
    const name = (this.name || '').trim();
    if (!name) { this.error = `${cfg.nameLabel} is required.`; return; }
    if (cfg.needs === 'mobile') {
      // Compare on digits only, so a number typed as "012-345 6789" still validates.
      const digits = String(this.mobileNumber ?? '').replace(/\D/g, '');
      if (!digits) { this.error = 'Mobile No is required.'; return; }
      if (digits.length !== 10) { this.error = 'Mobile No must be exactly 10 digits.'; return; }
    }
    if (cfg.needs === 'location' && !this.locationId) { this.error = 'Location is required.'; return; }
    if (cfg.needs === 'categoryType' && !this.categoryType) { this.error = 'Category type is required.'; return; }
    if (cfg.needs === 'geo' && (!this.geoCountryId || !this.geoStateId || !this.geoCityId)) {
      this.error = 'Country, State and City are required.'; return;
    }

    this.error = '';
    this.saving = true;
    const payload = cfg.build(name, {
      locationId: this.locationId, categoryType: this.categoryType,
      mobileNumber: (this.mobileNumber || '').trim(),
      countryId: this.geoCountryId, stateId: this.geoStateId, cityId: this.geoCityId,
    });

    cfg.create(this.master, payload).pipe(catchError(() => of({ __err: true }))).subscribe((res: any) => {
      if (res?.__err || res?.isSuccess === false) {
        this.saving = false;
        this.error = res?.message || `Unable to add ${cfg.nameLabel.toLowerCase()}.`;
        return;
      }
      // Resolve the new id from the create response, falling back to re-reading the
      // list and matching by name (bullet-proof against varying response shapes).
      const idFromRes = this.numId(res);
      if (idFromRes) { this.finish(name, idFromRes); return; }

      cfg.list(this.master).pipe(catchError(() => of([]))).subscribe((listRes: any) => {
        const row = this.rows(listRes).find((r: any) =>
          String(r?.[cfg.nameField] ?? '').trim().toLowerCase() === name.toLowerCase());
        this.finish(name, this.numId(row) || 0);
      });
    });
  }

  private finish(name: string, id: number): void {
    this.saving = false;
    this.created.emit({
      type: this.type as QuickAddType,
      id,
      label: name,
      mobile: this.needsMobile ? this._mobileNumber : undefined
    });
    this.closed.emit();
  }

  /** Pull an array of rows out of the many response envelope shapes used across the API. */
  private rows(res: any): any[] {
    if (Array.isArray(res)) return res;
    return res?.data ?? res?.Data ?? res?.result ?? res?.rows ?? res?.items ?? [];
  }

  /** Extract a numeric id from a response/row across the common field spellings. */
  private numId(x: any): number {
    if (x == null) return 0;
    const raw = (typeof x === 'object')
      ? (x.data ?? x.Data ?? x.id ?? x.Id ?? x.ID ?? x.result ?? x)
      : x;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
}
