import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SidebarService {
  private _sidebarOpen = new BehaviorSubject<boolean>(true);
  private _openMenus = new BehaviorSubject<Set<string>>(new Set());

  sidebarOpen$ = this._sidebarOpen.asObservable();
  openMenus$ = this._openMenus.asObservable();

  get sidebarOpen(): boolean { return this._sidebarOpen.value; }
  get openMenus(): Set<string> { return this._openMenus.value; }

  toggleSidebar(): void {
    this._sidebarOpen.next(!this._sidebarOpen.value);
  }

  setSidebar(open: boolean): void {
    this._sidebarOpen.next(open);
  }

  toggleMenu(label: string): void {
    const menus = new Set(this._openMenus.value);
    menus.has(label) ? menus.delete(label) : menus.add(label);
    this._openMenus.next(menus);
  }

  openMenu(label: string): void {
    const menus = new Set(this._openMenus.value);
    menus.add(label);
    this._openMenus.next(menus);
  }

  closeMenu(label: string): void {
    const menus = new Set(this._openMenus.value);
    menus.delete(label);
    this._openMenus.next(menus);
  }

  isMenuOpen(label: string): boolean {
    return this._openMenus.value.has(label);
  }
}
