// Tenant code helpers — the unique, safe identifier for a tenant.
// Format: woork_t_<8 lowercase hex> (e.g. woork_t_01a2b3c4).
// The company name is metadata only and is NEVER used as a database name;
// tenant codes are generated, never taken from free user input.
import * as crypto from 'crypto';

const TENANT_CODE_RE = /^woork_t_[0-9a-f]{8}$/;

export function generateTenantCode(): string {
  return 'woork_t_' + crypto.randomBytes(4).toString('hex');
}

export function validateTenantCode(code: string): boolean {
  return TENANT_CODE_RE.test(code);
}

// The PostgreSQL role for a tenant database has the same name as the
// tenant code (and the database itself): woork_t_<8 hex>.
export function dbRoleForTenant(code: string): string {
  return code;
}
