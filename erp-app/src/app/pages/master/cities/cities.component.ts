import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

@Component({ selector: 'erp-cities', standalone: false, templateUrl: './cities.component.html', styleUrls: ['./cities.component.scss'] })
export class CitiesComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  countries: any[] = [];
  allStates: any[] = [];
  filteredStates: any[] = [];
  form: { cityName: string; countryId: any; stateId: any } = { cityName: '', countryId: null, stateId: null };
  constructor(private masterSvc: MasterService) {}
  ngOnInit(): void {
    this.load();
    this.masterSvc.getCountries().subscribe({ next: (res: any) => { this.countries = res?.data || res || []; }, error: () => {} });
    this.masterSvc.getStates().subscribe({ next: (res: any) => { this.allStates = res?.data || res || []; }, error: () => {} });
  }
  onCountryChange(countryId: any): void {
    this.filteredStates = this.allStates.filter(s => s.countryId === countryId);
    this.form.stateId = null;
  }
  load(): void { this.loading = true; this.masterSvc.getCities().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { cityName: '', countryId: null, stateId: null }; this.filteredStates = []; this.message = ''; }
  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    const cid = item.countryId || null;
    this.filteredStates = cid ? this.allStates.filter(s => s.countryId === cid) : [];
    this.form = { cityName: item.cityName || '', countryId: cid, stateId: item.stateId || null };
    this.message = '';
  }
  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { cityName: '', countryId: null, stateId: null }; this.filteredStates = []; }
  onSubmit(): void {
    if (!this.form.cityName?.trim()) { this.message = 'City Name is required.'; this.isError = true; return; }
    const payload: any = { cityName: this.form.cityName, countryId: this.form.countryId, stateId: this.form.stateId };
    const obs = this.isEditMode ? this.masterSvc.updateCity(this.selectedId, payload) : this.masterSvc.createCity(payload);
    obs.subscribe({ next: () => { this.message = this.isEditMode ? 'Updated.' : 'Created.'; this.isError = false; this.cancel(); this.load(); }, error: () => { this.message = 'Save failed.'; this.isError = true; } });
  }
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteCity(this.itemToDelete.id).subscribe({ next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); }, error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; } });
  }
}
