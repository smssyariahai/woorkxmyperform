// CLI: provision a new tenant (master record + database + migrations +
// seed + verification). Usage:
//   npx tsx scripts/provision-tenant.ts --company "PT Contoh" --slug contoh \
//     --admin-name "Admin" --admin-email admin@contoh.id [--admin-password ...]
// If --admin-password is omitted, a random password is generated and
// printed ONCE — save it, it cannot be recovered from the output again.
import * as crypto from 'node:crypto';
import { provisionTenant } from '../lib/tenant/provisioning';

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const company = argValue('--company');
  const slug = argValue('--slug');
  const adminName = argValue('--admin-name');
  const adminEmail = argValue('--admin-email');
  let adminPassword = argValue('--admin-password');
  let generated = false;
  if (!adminPassword) {
    adminPassword = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }
  if (!company || !slug || !adminName || !adminEmail) {
    console.error(
      'Penggunaan: npx tsx scripts/provision-tenant.ts --company <nama> --slug <slug> --admin-name <nama> --admin-email <email> [--admin-password <password>]',
    );
    process.exit(1);
  }
  try {
    const result = await provisionTenant({
      companyName: company,
      slug,
      adminName,
      adminEmail,
      adminPassword,
    });
    if (generated) {
      console.log(`ADMIN PASSWORD (digenerate, simpan sekarang): ${adminPassword}`);
    }
    console.log(JSON.stringify(result));
  } catch (e: any) {
    console.error(`provisioning gagal: ${e?.message ?? e}`);
    process.exit(1);
  }
}

void main();
