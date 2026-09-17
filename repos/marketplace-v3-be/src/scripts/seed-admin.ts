import 'reflect-metadata';
import { z } from 'zod';
import { clearLoadedSecrets, loadAdminSeedSecrets } from '../config/key-vault';

const adminCredentialsSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(12).max(128).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    'Admin password must contain uppercase, lowercase, number and special character',
  ),
});

async function seedAdmin(): Promise<void> {
  await loadAdminSeedSecrets();
  const [{ AppDataSource }, { Admin, AdminStatus }, { hashPassword }] =
    await Promise.all([
      import('../database/data-source'),
      import('../database/entities/admin.entity'),
      import('../common/utils/token.util'),
    ]);

  const credentials = adminCredentialsSchema.parse({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  clearLoadedSecrets();

  try {
    await AppDataSource.initialize();
    const adminRepo = AppDataSource.getRepository(Admin);
    const existing = await adminRepo.findOne({
      where: { email: credentials.email },
    });
    if (existing) {
      console.log('[Seed] Configured admin already exists');
      return;
    }

    const admin = adminRepo.create({
      firstName: process.env.ADMIN_FIRST_NAME || 'Platform',
      lastName: process.env.ADMIN_LAST_NAME || 'Admin',
      email: credentials.email,
      passwordHash: await hashPassword(credentials.password),
      roleId: null,
      isSuperAdmin: true,
      status: AdminStatus.ACTIVE,
    });
    await adminRepo.save(admin);
    console.log('[Seed] Initial admin created');
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

void seedAdmin().catch((error: unknown) => {
  clearLoadedSecrets();
  console.error('[Seed] Failed:', error);
  process.exit(1);
});
