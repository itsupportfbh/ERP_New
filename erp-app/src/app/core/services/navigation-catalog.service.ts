import { Injectable } from '@angular/core';

export interface NavigationMenuItem {
  label: string;
  icon?: string;
  route?: string;
  queryParams?: Record<string, string>;
  children?: NavigationMenuItem[];
  /** Permission-only children; shown in Roles & Permissions, not in the sidebar. */
  permissionChildren?: NavigationMenuItem[];
  permId?: string;
  hidden?: boolean;
}

/** Shared runtime source for the sidebar and both permission editors. */
@Injectable({ providedIn: 'root' })
export class NavigationCatalogService {
  private menuTree: NavigationMenuItem[] = [];

  register(items: NavigationMenuItem[]): void { this.menuTree = items; }
  snapshot(): NavigationMenuItem[] { return this.menuTree; }

  moduleId(item: NavigationMenuItem): string {
    const known: Record<string, string> = {
      dashboard: 'general', master: 'master', 'business partners': 'businesspartners',
      sales: 'sales', purchase: 'purchase', inventory: 'inventory',
      financial: 'financial', recipe: 'recipe'
    };
    return known[item.label.trim().toLowerCase()] || this.slug(item.label);
  }

  functionId(item: NavigationMenuItem): string {
    if (item.permId?.trim()) return item.permId.trim();
    if (item.label.trim().toLowerCase() === 'dashboard') return 'home';
    const routePart = (item.route || '').split('?')[0].split('/').filter(Boolean).pop() || '';
    return routePart && !/^(:|new$)/i.test(routePart) ? routePart : this.slug(item.label);
  }

  private slug(value: string): string {
    return value.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
