import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

const blank = () => ({ name: '', countryId: null as any, stateId: null as any, cityId: null as any, contactNumber: '' });

@Component({ selector: 'erp-location', standalone: false, templateUrl: './location.component.html', styleUrls: ['./location.component.scss'] })
export class LocationComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  searchText = ''; pageSize = 10; sortField = ''; sortAsc = true;

  countries: any[] = [];
  allStates: any[] = [];
  allCities: any[] = [];
  filteredStates: any[] = [];
  filteredCities: any[] = [];

  form = blank();

  get filteredItems(): any[] {
    let list = this.items;
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      list = list.filter(i => Object.values(i).join(' ').toLowerCase().includes(q));
    }
    if (this.sortField) {
      list = [...list].sort((a, b) => {
        const va = (a[this.sortField] || '').toString().toLowerCase();
        const vb = (b[this.sortField] || '').toString().toLowerCase();
        return this.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }

  get pagedItems(): any[] { return this.filteredItems.slice(0, this.pageSize); }

  constructor(private masterSvc: MasterService) {}

  ngOnInit(): void {
    this.load();
    this.masterSvc.getCountries().subscribe({ next: (r: any) => { this.countries = r?.data || r || []; }, error: () => {} });
    this.masterSvc.getStates().subscribe({ next: (r: any) => { this.allStates = r?.data || r || []; }, error: () => {} });
    this.masterSvc.getCities().subscribe({ next: (r: any) => { this.allCities = r?.data || r || []; }, error: () => {} });
  }

  load(): void {
    this.loading = true;
    this.masterSvc.getLocations().subscribe({
      next: (res: any) => { this.items = res?.data || res || []; this.loading = false; },
      error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; }
    });
  }

  onCountryChange(countryId: any): void {
    this.form.stateId = null;
    this.form.cityId = null;
    this.filteredCities = [];
    this.filteredStates = this.allStates.filter(s => s.countryId === Number(countryId) || s.countryID === Number(countryId));
  }

  onStateChange(stateId: any): void {
    this.form.cityId = null;
    this.filteredCities = this.allCities.filter(c => c.stateId === Number(stateId) || c.stateID === Number(stateId));
  }

  getCountryName(id: any): string {
    const c = this.countries.find(x => x.id === id || x.id === Number(id));
    return c ? (c.countryName || c.name || '') : (id || '');
  }
  getStateName(id: any): string {
    const s = this.allStates.find(x => x.id === id || x.id === Number(id));
    return s ? (s.stateName || s.name || '') : (id || '');
  }
  getCityName(id: any): string {
    const c = this.allCities.find(x => x.id === id || x.id === Number(id));
    return c ? (c.cityName || c.name || '') : (id || '');
  }

  applyFilter(): void {}
  sortBy(field: string): void { if (this.sortField === field) { this.sortAsc = !this.sortAsc; } else { this.sortField = field; this.sortAsc = true; } }

  showForm(): void {
    this.isFormVisible = true; this.isEditMode = false; this.form = blank();
    this.filteredStates = []; this.filteredCities = []; this.message = '';
  }

  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    const cId = item.countryId || null;
    const sId = item.stateId || null;
    if (cId) this.filteredStates = this.allStates.filter(s => s.countryId === Number(cId) || s.countryID === Number(cId));
    if (sId) this.filteredCities = this.allCities.filter(c => c.stateId === Number(sId) || c.stateID === Number(sId));
    this.form = {
      name: item.name || item.locationName || '',
      countryId: cId,
      stateId: sId,
      cityId: item.cityId || null,
      contactNumber: item.contactNumber || ''
    };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = blank(); this.filteredStates = []; this.filteredCities = []; }

  onSubmit(): void {
    if (!this.form.name?.trim()) { this.message = 'Location Name is required.'; this.isError = true; return; }
    const payload = {
      name: this.form.name,
      countryId: this.form.countryId,
      stateId: this.form.stateId,
      cityId: this.form.cityId,
      contactNumber: this.form.contactNumber
    };
    const obs = this.isEditMode ? this.masterSvc.updateLocation(this.selectedId, payload) : this.masterSvc.createLocation(payload);
    obs.subscribe({ next: () => { this.message = this.isEditMode ? 'Updated.' : 'Created.'; this.isError = false; this.cancel(); this.load(); }, error: () => { this.message = 'Save failed.'; this.isError = true; } });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteLocation(this.itemToDelete.id).subscribe({ next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); }, error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; } });
  }
}
