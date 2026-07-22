import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

/** Mirrors AccessRank in the API. Higher wins. */
export enum AccessRank {
  User = 1,
  Admin = 2,
  SuperAdmin = 3
}

/**
 * Who may change whose access, on the client.
 *
 * This is presentation only — it decides which buttons to show. The rule that
 * actually holds is AccessControlService on the API, which answers 403; keeping
 * the same shape here just avoids offering an action that would be refused.
 *
 * Rules, same as the server:
 *   - below Admin        -> may not change anyone's access
 *   - nobody edits their own access
 *   - the target must rank strictly lower, so an Admin cannot edit another Admin
 */
@Injectable({ providedIn: 'root' })
export class AccessControlService {
  constructor(private auth: AuthService) {}

  /** Approval level names vary in spacing and case across deployments. */
  private isAdminName(name: unknown): boolean {
    const key = String(name ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
    return key === 'admin' || key === 'administrator';
  }

  private rankOf(approvalLevelNames: unknown): AccessRank {
    const names = Array.isArray(approvalLevelNames) ? approvalLevelNames : [];
    return names.some(n => this.isAdminName(n)) ? AccessRank.Admin : AccessRank.User;
  }

  /** Rank of the signed-in user. */
  callerRank(): AccessRank {
    if (this.auth.isSuperAdmin()) return AccessRank.SuperAdmin;

    let roles: string[] = [];
    try { roles = JSON.parse(localStorage.getItem('approvalRoles') || '[]'); } catch {}
    return this.rankOf(roles);
  }

  /** Rank of a row from the users list, which carries approvalLevelNames. */
  userRank(user: any): AccessRank {
    return this.rankOf(user?.approvalLevelNames ?? user?.ApprovalLevelNames);
  }

  /** True when the signed-in user may open the access editor at all. */
  canManageAccess(): boolean {
    return this.callerRank() >= AccessRank.Admin;
  }

  /** True when the signed-in user may change this particular user's access. */
  canManageUser(user: any): boolean {
    const caller = this.callerRank();
    if (caller < AccessRank.Admin) return false;

    const targetId = Number(user?.id ?? user?.Id ?? 0);
    const myId = Number(localStorage.getItem('id') || 0);
    if (targetId > 0 && targetId === myId) return false;

    return this.userRank(user) < caller;
  }

  /** Why the action is unavailable, for a tooltip. */
  blockedReason(user: any): string {
    const caller = this.callerRank();
    if (caller < AccessRank.Admin) return 'Only an administrator can change user access.';

    const targetId = Number(user?.id ?? user?.Id ?? 0);
    if (targetId > 0 && targetId === Number(localStorage.getItem('id') || 0)) {
      return 'You cannot change your own access.';
    }
    return 'Only a Super Admin can change an administrator’s access.';
  }
}
