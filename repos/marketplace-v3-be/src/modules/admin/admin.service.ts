import { RewardService } from '../reward/reward.service';
import { getSetting } from '../system-settings/settings.reader';
import { auditedUpdate } from '../audit-log/audit-log.mutations';
import { FastifyInstance } from 'fastify';
import { In, Repository } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { Admin, AdminStatus } from '../../database/entities/admin.entity';
import { AdminAuditEvent } from '../../database/entities/admin-audit-event.entity';
import {
  AdminRoleEntity,
  AdminRoleStatus,
} from '../../database/entities/admin-role.entity';
import { AdminRolePermission } from '../../database/entities/admin-role-permission.entity';
import {
  Permission,
  PermissionStatus,
} from '../../database/entities/permission.entity';
import { User, UserStatus } from '../../database/entities/user.entity';
import {
  CompanyVerification,
  VerificationStatus,
} from '../../database/entities/company-verification.entity';
import {
  ensureEmailDeliveryEnabled,
  sendAccountRestrictionEmail,
  sendAdminDeactivationEmail,
  sendAdminInvitationEmail,
  sendAdminPasswordChangedEmail,
  sendAdminPasswordResetEmail,
  sendAdminReactivationEmail,
  sendSellerApprovalEmail,
  sendSellerRejectionEmail,
} from '../../common/utils/email.service';
import {
  addHours,
  addMinutes,
  comparePassword,
  generateOtp,
  generateSecureToken,
  hashPassword,
  hashToken,
  isExpired,
} from '../../common/utils/token.util';
import { createError } from '../../common/utils/http-error.util';
import { config } from '../../config';
import {
  AdminChangePasswordDto,
  AdminLoginDto,
  AdminProfileUpdateDto,
  AdminRoleCreateDto,
  AdminRoleUpdateDto,
  CompleteAdminSetupDto,
  CreateAdminDto,
  UpdateAdminDto,
} from '../../common/utils/validation.schemas';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  NotificationActionType,
  NotificationCategory,
} from '../../database/entities/notification.entity';
import { NotificationService } from '../notification/notification.service';


export interface PaginationOptions {
  page: number;
  limit: number;
  status?: VerificationStatus;
  search?: string;
}

export interface AdminUserQuery {
  page: number;
  limit: number;
  search?: string;
  status?: AdminStatus;
  roleId?: string;
}

export interface AdminRoleQuery {
  page: number;
  limit: number;
  search?: string;
  status?: AdminRoleStatus;
}

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type AdminAuditInput = {
  eventType: string;
  actorAdminId?: string | null;
  targetAdminId?: string | null;
  targetUserId?: string | null;
  targetRoleId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export class AdminService {
  private adminRepo = AppDataSource.getRepository(Admin);
  private adminAuditRepo = AppDataSource.getRepository(AdminAuditEvent);
  private adminRoleRepo = AppDataSource.getRepository(AdminRoleEntity);
  private permissionRepo = AppDataSource.getRepository(Permission);
  private rolePermissionRepo = AppDataSource.getRepository(AdminRolePermission);
  private userRepo = AppDataSource.getRepository(User);
  private verificationRepo = AppDataSource.getRepository(CompanyVerification);

  constructor(private readonly fastify: FastifyInstance) {}

  // ─── Admin auth ───────────────────────────────────────────────────────────

  async completeAdminSetup(
    dto: CompleteAdminSetupDto,
  ): Promise<{ success: true; message: string }> {
    const tokenHash = hashToken(dto.token);
    const admin = await this.adminRepo
      .createQueryBuilder('admin')
      .addSelect('admin.setupTokenHash')
      .addSelect('admin.setupTokenExpiry')
      .addSelect('admin.setupTokenUsedAt')
      .where('admin.setupTokenHash = :tokenHash', { tokenHash })
      .getOne();

    if (!admin || !admin.setupTokenExpiry || isExpired(admin.setupTokenExpiry)) {
      throw createError.badRequest('Invalid or expired setup token');
    }

    if (admin.setupTokenUsedAt) {
      throw createError.badRequest('Setup token has already been used');
    }

    if (admin.status !== AdminStatus.PENDING) {
      throw createError.conflict('Admin setup has already been completed');
    }

    await auditedUpdate(this.adminRepo, admin.id, {
      passwordHash: await hashPassword(dto.password),
      status: AdminStatus.ACTIVE,
      setupTokenHash: null,
      setupTokenExpiry: null,
      setupTokenUsedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_SETUP_COMPLETED',
      targetAdminId: admin.id,
    });

    return {
      success: true,
      message: 'Your Admin account has been activated successfully.',
    };
  }

  async loginAdmin(dto: AdminLoginDto): Promise<{
    success: true;
    message: string;
    data: { token: string; admin: Record<string, unknown> };
  }> {
    const admin = await this.adminRepo
      .createQueryBuilder('admin')
      .addSelect('admin.passwordHash')
      .addSelect('admin.failedLoginAttempts')
      .addSelect('admin.lockedUntil')
      .addSelect('admin.authVersion')
      .leftJoinAndSelect('admin.role', 'role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .where('admin.email = :email', { email: dto.email })
      .getOne();

    if (!admin) {
      await hashPassword('dummy_to_prevent_timing_attack');
      throw createError.unauthorized('Invalid email or password');
    }

    if (admin.status === AdminStatus.PENDING) {
      throw createError.forbidden(
        'Please complete your Admin account setup before signing in.',
        'ADMIN_SETUP_REQUIRED',
      );
    }

    if (admin.status === AdminStatus.INACTIVE) {
      throw createError.forbidden(
        'Your Admin account is currently inactive.',
        'ADMIN_ACCOUNT_INACTIVE',
      );
    }

    if (admin.lockedUntil && !isExpired(admin.lockedUntil)) {
      throw createError.tooManyRequests(
        `Admin account temporarily locked. Try again after ${admin.lockedUntil.toISOString()}`,
      );
    }

    if (!admin.passwordHash) {
      throw createError.forbidden(
        'Please complete your Admin account setup before signing in.',
        'ADMIN_SETUP_REQUIRED',
      );
    }

    const passwordMatch = await comparePassword(dto.password, admin.passwordHash);
    if (!passwordMatch) {
      await this.recordFailedAdminLogin(admin);
      throw createError.unauthorized('Invalid email or password');
    }

    const lastLoginAt = new Date();
    await auditedUpdate(this.adminRepo, admin.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt,
    });
    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
    admin.lastLoginAt = lastLoginAt;

    const permissions = await this.getEffectivePermissionCodes(admin);
    const token = this.signAdminToken(admin);
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_LOGIN_SUCCESSFUL',
      actorAdminId: admin.id,
      targetAdminId: admin.id,
    });

    return {
      success: true,
      message: 'Login successful.',
      data: {
        token,
        admin: serializeAdmin(admin, permissions),
      },
    };
  }

  async getCurrentAdmin(adminId: string): Promise<{
    success: true;
    data: Record<string, unknown>;
  }> {
    const admin = await this.loadAdminWithRole(adminId);
    if (!admin) throw createError.notFound('Admin not found');

    return {
      success: true,
      data: serializeAdmin(admin, await this.getEffectivePermissionCodes(admin)),
    };
  }

  async updateAdminProfile(
    adminId: string,
    dto: AdminProfileUpdateDto,
  ): Promise<{ success: true; message: string }> {
    await auditedUpdate(this.adminRepo, adminId, {
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber } : {}),
    });
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_PROFILE_UPDATED',
      actorAdminId: adminId,
      targetAdminId: adminId,
    });

    return {
      success: true,
      message: 'Admin profile updated successfully.',
    };
  }

  async changeAdminPassword(
    adminId: string,
    dto: AdminChangePasswordDto,
  ): Promise<{ success: true; message: string }> {
    const admin = await this.adminRepo
      .createQueryBuilder('admin')
      .addSelect('admin.passwordHash')
      .where('admin.id = :adminId', { adminId })
      .getOne();

    if (!admin) throw createError.notFound('Admin not found');
    if (!admin.passwordHash) {
      throw createError.badRequest('Password setup has not been completed');
    }

    const match = await comparePassword(dto.oldPassword, admin.passwordHash);
    if (!match) throw createError.unauthorized('Old password is incorrect');

    await auditedUpdate(this.adminRepo, adminId, {
      passwordHash: await hashPassword(dto.newPassword),
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    await this.bumpAdminAuthVersion(adminId);
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_PASSWORD_CHANGED',
      actorAdminId: adminId,
      targetAdminId: adminId,
    });

    sendAdminPasswordChangedEmail(admin.email, admin.firstName).catch((err) =>
      console.error('[AdminService] Admin password changed email failed:', err),
    );

    return {
      success: true,
      message: 'Password changed successfully.',
    };
  }

  async forgotAdminPassword(
    email: string,
  ): Promise<{ success: true; message: string }> {
    ensureEmailDeliveryEnabled();

    const message =
      'If an eligible Admin account exists for this email, password reset instructions have been sent.';
    const admin = await this.adminRepo.findOne({ where: { email } });
    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      return { success: true, message };
    }

    const otp = generateOtp();
    await auditedUpdate(this.adminRepo, admin.id, {
      passwordResetToken: hashToken(otp),
      passwordResetExpiry: addMinutes((await getSetting<number>('adminOtpExpiryMinutes'))),
    });
    try {
      await sendAdminPasswordResetEmail(admin.email, admin.firstName, otp);
    } catch (error) {
      await this.adminRepo.update(admin.id, {
        passwordResetToken: null,
        passwordResetExpiry: null,
      });
      throw error;
    }
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_PASSWORD_RESET',
      targetAdminId: admin.id,
      metadata: { stage: 'requested' },
    });

    return { success: true, message };
  }

  async resetAdminPassword(
    otp: string,
    password: string,
  ): Promise<{ success: true; message: string }> {
    const otpHash = hashToken(otp);
    const admin = await this.adminRepo
      .createQueryBuilder('admin')
      .addSelect('admin.passwordResetToken')
      .addSelect('admin.passwordResetExpiry')
      .where('admin.passwordResetToken = :otpHash', { otpHash })
      .getOne();

    if (!admin || !admin.passwordResetExpiry || isExpired(admin.passwordResetExpiry)) {
      throw createError.badRequest('Invalid or expired reset code');
    }

    if (admin.status !== AdminStatus.ACTIVE) {
      throw createError.forbidden(
        'Your Admin account is currently inactive.',
        'ADMIN_ACCOUNT_INACTIVE',
      );
    }

    await auditedUpdate(this.adminRepo, admin.id, {
      passwordHash: await hashPassword(password),
      passwordResetToken: null,
      passwordResetExpiry: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    await this.bumpAdminAuthVersion(admin.id);
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_PASSWORD_RESET',
      targetAdminId: admin.id,
      metadata: { stage: 'completed' },
    });

    return {
      success: true,
      message: 'Password reset successful.',
    };
  }

  // ─── Admin accounts ──────────────────────────────────────────────────────

  async createAdmin(
    dto: CreateAdminDto,
    createdBy: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    ensureEmailDeliveryEnabled();

    const existingAdmin = await this.adminRepo.findOne({
      where: { email: dto.email },
    });

    if (existingAdmin) {
      throw createError.conflict('An Admin account with this email already exists');
    }

    const role = dto.roleId ? await this.getAssignableRole(dto.roleId) : null;
    const setupToken = generateSecureToken();
    const admin = this.adminRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      phoneNumber: dto.phoneNumber ?? null,
      email: dto.email,
      passwordHash: null,
      roleId: role?.id ?? null,
      isSuperAdmin: false,
      createdBy,
      status: AdminStatus.PENDING,
      setupTokenHash: hashToken(setupToken),
      setupTokenExpiry: addHours((await getSetting<number>('adminSetupTokenExpiryHours'))),
    });

    const saved = await this.adminRepo.save(admin);
    saved.role = role;
    try {
      await sendAdminInvitationEmail(
        saved.email,
        saved.firstName,
        role?.name ?? null,
        this.buildAdminSetupLink(setupToken),
      );
    } catch (error) {
      await this.adminRepo.delete(saved.id);
      throw error;
    }
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_CREATED',
      actorAdminId: createdBy,
      targetAdminId: saved.id,
      metadata: { roleId: saved.roleId },
    });
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_INVITATION_SENT',
      actorAdminId: createdBy,
      targetAdminId: saved.id,
    });

    return {
      success: true,
      message: 'Admin account created successfully.',
      data: serializeAdminForList(saved),
    };
  }

  async getAdminUsers(query: AdminUserQuery): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Pagination;
  }> {
    const qb = this.adminRepo
      .createQueryBuilder('admin')
      .leftJoinAndSelect('admin.role', 'role')
      .orderBy('admin.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.status) {
      qb.andWhere('admin.status = :status', { status: query.status });
    }

    if (query.roleId) {
      qb.andWhere('admin.roleId = :roleId', { roleId: query.roleId });
    }

    if (query.search) {
      qb.andWhere(
        '(LOWER(admin.email) LIKE :search OR LOWER(admin.firstName) LIKE :search OR LOWER(admin.lastName) LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    const [admins, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: admins.map(serializeAdminForList),
      pagination: this.pagination(query.page, query.limit, total),
    };
  }

  async getAdminDetails(adminId: string): Promise<{
    success: true;
    data: Record<string, unknown>;
  }> {
    const admin = await this.loadAdminWithRole(adminId);
    if (!admin) throw createError.notFound('Admin not found');

    return {
      success: true,
      data: serializeAdmin(admin, await this.getEffectivePermissionCodes(admin)),
    };
  }

  async updateAdmin(
    adminId: string,
    dto: UpdateAdminDto,
    requestingAdmin: Admin,
  ): Promise<{ success: true; message: string }> {
    const target = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!target) throw createError.notFound('Admin not found');

    if (target.isSuperAdmin && !requestingAdmin.isSuperAdmin) {
      throw createError.forbidden('Super Admin accounts are protected');
    }

    const update: Partial<Admin> = {
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber } : {}),
    };

    let roleChanged = false;
    if (dto.roleId !== undefined) {
      if (target.isSuperAdmin) {
        throw createError.forbidden('Super Admin role cannot be modified');
      }
      const role = dto.roleId ? await this.getAssignableRole(dto.roleId) : null;
      update.roleId = role?.id ?? null;
      roleChanged = target.roleId !== update.roleId;
    }

    await auditedUpdate(this.adminRepo, adminId, update);
    if (roleChanged) {
      await this.bumpAdminAuthVersion(adminId);
    }
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_UPDATED',
      actorAdminId: requestingAdmin.id,
      targetAdminId: adminId,
      metadata: { roleChanged },
    });
    if (roleChanged) {
      await this.recordAdminAuditEvent({
        eventType: 'ADMIN_ROLE_CHANGED',
        actorAdminId: requestingAdmin.id,
        targetAdminId: adminId,
        metadata: { previousRoleId: target.roleId, newRoleId: update.roleId },
      });
    }

    return {
      success: true,
      message: 'Admin account updated successfully.',
    };
  }

  async deactivateAdmin(
    adminId: string,
    reason: string | undefined,
    deactivatedBy: string,
  ): Promise<{ success: true; message: string }> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw createError.notFound('Admin not found');

    if (admin.id === deactivatedBy) {
      throw createError.badRequest('You cannot deactivate your own Admin account');
    }

    if (admin.isSuperAdmin) {
      throw createError.forbidden('Protected Super Admin accounts cannot be deactivated');
    }

    await auditedUpdate(this.adminRepo, adminId, {
      status: AdminStatus.INACTIVE,
      deactivatedBy,
      deactivatedAt: new Date(),
      deactivationReason: reason ?? null,
      setupTokenHash: null,
      setupTokenExpiry: null,
      passwordResetToken: null,
      passwordResetExpiry: null,
    });
    await this.bumpAdminAuthVersion(adminId);
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_DEACTIVATED',
      actorAdminId: deactivatedBy,
      targetAdminId: adminId,
      metadata: { reason: reason ?? null },
    });

    sendAdminDeactivationEmail(admin.email, admin.firstName).catch((err) =>
      console.error('[AdminService] Admin deactivation email failed:', err),
    );

    return {
      success: true,
      message: 'Admin account deactivated successfully.',
    };
  }

  async reactivateAdmin(
    adminId: string,
    activatedBy: string,
  ): Promise<{ success: true; message: string }> {
    const admin = await this.adminRepo
      .createQueryBuilder('admin')
      .addSelect('admin.passwordHash')
      .where('admin.id = :adminId', { adminId })
      .getOne();

    if (!admin) throw createError.notFound('Admin not found');
    if (admin.status === AdminStatus.PENDING || !admin.passwordHash) {
      throw createError.conflict('Pending Admins must complete invitation setup first');
    }

    await auditedUpdate(this.adminRepo, adminId, {
      status: AdminStatus.ACTIVE,
      deactivatedBy: null,
      deactivatedAt: null,
      deactivationReason: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    await this.bumpAdminAuthVersion(adminId);
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_REACTIVATED',
      actorAdminId: activatedBy,
      targetAdminId: adminId,
    });

    sendAdminReactivationEmail(admin.email, admin.firstName).catch((err) =>
      console.error('[AdminService] Admin reactivation email failed:', err),
    );

    return {
      success: true,
      message: 'Admin account activated successfully.',
    };
  }

  async resendAdminInvitation(
    adminId: string,
    requestedBy: string,
  ): Promise<{ success: true; message: string }> {
    ensureEmailDeliveryEnabled();

    const admin = await this.loadAdminWithRole(adminId);
    if (!admin) throw createError.notFound('Admin not found');

    if (admin.status !== AdminStatus.PENDING) {
      throw createError.conflict('Only pending Admin accounts can receive setup invitations');
    }

    const previousSetup = await this.adminRepo
      .createQueryBuilder('admin')
      .addSelect('admin.setupTokenHash')
      .addSelect('admin.setupTokenExpiry')
      .addSelect('admin.setupTokenUsedAt')
      .where('admin.id = :adminId', { adminId })
      .getOneOrFail();

    const setupToken = generateSecureToken();
    await auditedUpdate(this.adminRepo, adminId, {
      setupTokenHash: hashToken(setupToken),
      setupTokenExpiry: addHours((await getSetting<number>('adminSetupTokenExpiryHours'))),
      setupTokenUsedAt: null,
    });

    try {
      await sendAdminInvitationEmail(
        admin.email,
        admin.firstName,
        admin.role?.name ?? null,
        this.buildAdminSetupLink(setupToken),
      );
    } catch (error) {
      await this.adminRepo.update(adminId, {
        setupTokenHash: previousSetup.setupTokenHash,
        setupTokenExpiry: previousSetup.setupTokenExpiry,
        setupTokenUsedAt: previousSetup.setupTokenUsedAt,
      });
      throw error;
    }
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_INVITATION_RESENT',
      actorAdminId: requestedBy,
      targetAdminId: adminId,
    });

    return {
      success: true,
      message: 'Admin invitation resent successfully.',
    };
  }

  // ─── Admin roles and permissions ─────────────────────────────────────────

  async createRole(
    dto: AdminRoleCreateDto,
    createdBy: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    await this.ensureRoleNameAvailable(dto.name);
    const permissions = await this.validatePermissionIds(dto.permissionIds);

    const saved = await AppDataSource.transaction(async (manager) => {
      const roleRepo = manager.getRepository(AdminRoleEntity);
      const rolePermissionRepo = manager.getRepository(AdminRolePermission);
      const role = await roleRepo.save(
        roleRepo.create({
          name: dto.name,
          description: dto.description ?? null,
          status: AdminRoleStatus.ACTIVE,
          createdBy,
        }),
      );

      if (permissions.length > 0) {
        await rolePermissionRepo.save(
          permissions.map((permission) =>
            rolePermissionRepo.create({
              roleId: role.id,
              permissionId: permission.id,
            }),
          ),
        );
      }

      return role;
    });
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_ROLE_CREATED',
      actorAdminId: createdBy,
      targetRoleId: saved.id,
      metadata: { permissionCount: permissions.length },
    });

    return {
      success: true,
      message: 'Admin role created successfully.',
      data: {
        id: saved.id,
        name: saved.name,
        status: saved.status,
      },
    };
  }

  async getRoles(query: AdminRoleQuery): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Pagination;
  }> {
    const qb = this.adminRoleRepo
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .orderBy('role.createdAt', 'DESC')
      .addOrderBy('permission.module', 'ASC')
      .addOrderBy('permission.code', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.status) {
      qb.andWhere('role.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(LOWER(role.name) LIKE :search OR LOWER(role.description) LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    const [roles, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: roles.map(serializeRoleWithPermissions),
      pagination: this.pagination(query.page, query.limit, total),
    };
  }

  async getRoleDetails(roleId: string): Promise<{
    success: true;
    data: Record<string, unknown>;
  }> {
    const role = await this.loadRoleWithPermissions(roleId);
    if (!role) throw createError.notFound('Admin role not found');

    return {
      success: true,
      data: serializeRoleWithPermissions(role),
    };
  }

  async updateRole(
    roleId: string,
    dto: AdminRoleUpdateDto,
    updatedBy: string,
  ): Promise<{ success: true; message: string }> {
    const role = await this.adminRoleRepo.findOne({ where: { id: roleId } });
    if (!role) throw createError.notFound('Admin role not found');

    if (dto.name !== undefined) {
      await this.ensureRoleNameAvailable(dto.name, roleId);
    }

    const permissions =
      dto.permissionIds !== undefined
        ? await this.validatePermissionIds(dto.permissionIds)
        : null;

    await AppDataSource.transaction(async (manager) => {
      await auditedUpdate(manager.getRepository(AdminRoleEntity), roleId, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description ?? null }
          : {}),
      });

      if (permissions) {
        const rolePermissionRepo = manager.getRepository(AdminRolePermission);
        await rolePermissionRepo.remove(await rolePermissionRepo.findBy({ roleId }));
        if (permissions.length > 0) {
          await rolePermissionRepo.save(
            permissions.map((permission) =>
              rolePermissionRepo.create({
                roleId,
                permissionId: permission.id,
              }),
            ),
          );
        }
        await this.bumpAuthVersionForRole(roleId, manager.getRepository(Admin));
      }
    });
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_ROLE_UPDATED',
      actorAdminId: updatedBy,
      targetRoleId: roleId,
      metadata: { permissionsChanged: Boolean(permissions) },
    });
    if (permissions) {
      await this.recordAdminAuditEvent({
        eventType: 'ADMIN_ROLE_PERMISSIONS_UPDATED',
        actorAdminId: updatedBy,
        targetRoleId: roleId,
        metadata: { permissionCount: permissions.length },
      });
    }

    return {
      success: true,
      message: 'Admin role updated successfully.',
    };
  }

  async updateRoleStatus(
    roleId: string,
    status: AdminRoleStatus,
    updatedBy: string,
  ): Promise<{ success: true; message: string }> {
    const role = await this.adminRoleRepo.findOne({ where: { id: roleId } });
    if (!role) throw createError.notFound('Admin role not found');

    if (status === AdminRoleStatus.INACTIVE) {
      const activeAdminCount = await this.adminRepo.count({
        where: { roleId, status: AdminStatus.ACTIVE },
      });
      if (activeAdminCount > 0) {
        throw createError.conflict(
          'Role cannot be deactivated while active Admins are assigned to it',
        );
      }
    }

    await auditedUpdate(this.adminRoleRepo, roleId, { status });
    await this.bumpAuthVersionForRole(roleId);
    await this.recordAdminAuditEvent({
      eventType:
        status === AdminRoleStatus.INACTIVE
          ? 'ADMIN_ROLE_DEACTIVATED'
          : 'ADMIN_ROLE_UPDATED',
      actorAdminId: updatedBy,
      targetRoleId: roleId,
      metadata: { status },
    });

    return {
      success: true,
      message:
        status === AdminRoleStatus.INACTIVE
          ? 'Admin role deactivated successfully.'
          : 'Admin role activated successfully.',
    };
  }

  async assignPermissionsToRole(
    roleId: string,
    permissionIds: string[],
    updatedBy: string,
  ): Promise<{ success: true; message: string }> {
    const role = await this.adminRoleRepo.findOne({ where: { id: roleId } });
    if (!role) throw createError.notFound('Admin role not found');

    const permissions = await this.validatePermissionIds(permissionIds);

    await AppDataSource.transaction(async (manager) => {
      const rolePermissionRepo = manager.getRepository(AdminRolePermission);
      await rolePermissionRepo.remove(await rolePermissionRepo.findBy({ roleId }));
      if (permissions.length > 0) {
        await rolePermissionRepo.save(
          permissions.map((permission) =>
            rolePermissionRepo.create({
              roleId,
              permissionId: permission.id,
            }),
          ),
        );
      }
      await this.bumpAuthVersionForRole(roleId, manager.getRepository(Admin));
    });
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_ROLE_PERMISSIONS_UPDATED',
      actorAdminId: updatedBy,
      targetRoleId: roleId,
      metadata: { permissionCount: permissions.length },
    });

    return {
      success: true,
      message: 'Role permissions updated successfully.',
    };
  }

  async getPermissions(): Promise<{
    success: true;
    data: Array<{ module: string; permissions: Record<string, unknown>[] }>;
  }> {
    const permissions = await this.permissionRepo.find({
      where: { status: PermissionStatus.ACTIVE },
      order: { module: 'ASC', code: 'ASC' },
    });

    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const permission of permissions) {
      const group = grouped.get(permission.module) || [];
      group.push(serializePermission(permission));
      grouped.set(permission.module, group);
    }

    return {
      success: true,
      data: Array.from(grouped.entries()).map(([module, modulePermissions]) => ({
        module,
        permissions: modulePermissions,
      })),
    };
  }

  // ─── Seller verifications ────────────────────────────────────────────────

  async getSellerVerifications(opts: PaginationOptions): Promise<{
    data: Partial<CompanyVerification>[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { page, limit, status, search } = opts;
    const skip = (page - 1) * limit;

    const qb = this.verificationRepo
      .createQueryBuilder('v')
      .leftJoin('v.user', 'u')
      .select([
        'v.id',
        'v.companyName',
        'v.registrationNumber',
        'v.userId',
        'v.verificationStatus',
        'v.submittedAt',
        'v.businessType',
        'v.country',
        'u.firstName',
        'u.lastName',
        'u.email',
      ])
      .orderBy('v.submittedAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      qb.andWhere('v.verificationStatus = :status', { status });
    }

    if (search) {
      qb.andWhere(
        '(LOWER(v.companyName) LIKE :search OR LOWER(v.registrationNumber) LIKE :search OR LOWER(u.firstName) LIKE :search OR LOWER(u.lastName) LIKE :search OR LOWER(u.email) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSellerVerificationSummary(): Promise<{
    success: true;
    data: { total: number; pending: number; approved: number; rejected: number };
  }> {
    const rows = await this.verificationRepo
      .createQueryBuilder('v')
      .select('v.verificationStatus', 'status')
      .addSelect('COUNT(v.id)', 'count')
      .groupBy('v.verificationStatus')
      .getRawMany<{ status: VerificationStatus; count: string }>();

    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }

    return {
      success: true,
      data: { total: counts.pending + counts.approved + counts.rejected, ...counts },
    };
  }

  async getSellerVerificationById(
    verificationId: string,
  ): Promise<CompanyVerification> {
    const verification = await this.verificationRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.user', 'u')
      .leftJoin('v.reviewer', 'r')
      .addSelect(['r.firstName', 'r.lastName', 'r.email'])
      .where('v.id = :id', { id: verificationId })
      .getOne();

    if (!verification) {
      throw createError.notFound('Verification record not found');
    }

    return verification;
  }

  async approveSeller(
    verificationId: string,
    adminId: string,
    notes?: string,
  ): Promise<{ message: string }> {
    const verification = await this.verificationRepo.findOne({
      where: { id: verificationId },
      relations: ['user'],
    });

    if (!verification) throw createError.notFound('Verification record not found');

    if (verification.verificationStatus === VerificationStatus.APPROVED) {
      throw createError.conflict('Seller is already approved');
    }

    await AppDataSource.transaction(async (manager) => {
      await auditedUpdate(manager.getRepository(CompanyVerification), verificationId, {
        verificationStatus: VerificationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: adminId,
        adminNotes: notes ?? null,
        rejectionReason: null,
      });

      await auditedUpdate(manager.getRepository(User), verification.userId, {
        isCompanyVerified: true,
      });
      await new RewardService().qualify(manager, verification.userId, 'company_verified');
    });
    await this.recordAdminAuditEvent({
      eventType: 'SELLER_VERIFIED_BY_ADMIN',
      actorAdminId: adminId,
      targetUserId: verification.userId,
      metadata: { verificationId },
    });
    await new SubscriptionService(this.fastify).assignDefaultSubscription(
      verification.userId,
      adminId,
    );

    sendSellerApprovalEmail(verification.user.email, verification.user.firstName)
      .catch((err) => console.error('[AdminService] Approval email failed:', err));
    new NotificationService(this.fastify)
      .createNotification({
        userId: verification.userId,
        type: 'SELLER_APPLICATION_APPROVED',
        category: NotificationCategory.SELLER,
        title: 'Seller application approved',
        message: 'Your seller application has been approved.',
        actionType: NotificationActionType.SELLER,
        actionId: verification.userId,
        actionUrl: '/seller/dashboard',
        eventId: verificationId,
        deduplicationKey: `SELLER_APPLICATION_APPROVED:${verification.userId}:${verificationId}`,
        mandatory: true,
      })
      .catch((err) =>
        console.error('[AdminService] Seller approval notification failed:', err),
      );

    return { message: 'Seller approved successfully' };
  }

  async rejectSeller(
    verificationId: string,
    adminId: string,
    reason: string,
  ): Promise<{ message: string }> {
    const verification = await this.verificationRepo.findOne({
      where: { id: verificationId },
      relations: ['user'],
    });

    if (!verification) throw createError.notFound('Verification record not found');

    if (verification.verificationStatus === VerificationStatus.REJECTED) {
      throw createError.conflict('Verification is already rejected');
    }

    await AppDataSource.transaction(async (manager) => {
      await auditedUpdate(manager.getRepository(CompanyVerification), verificationId, {
        verificationStatus: VerificationStatus.REJECTED,
        rejectionReason: reason,
        reviewedAt: new Date(),
        reviewedBy: adminId,
      });

      await auditedUpdate(manager.getRepository(User), verification.userId, {
        isCompanyVerified: false,
      });
    });
    await this.recordAdminAuditEvent({
      eventType: 'SELLER_REJECTED_BY_ADMIN',
      actorAdminId: adminId,
      targetUserId: verification.userId,
      metadata: { verificationId, reason },
    });

    sendSellerRejectionEmail(verification.user.email, verification.user.firstName, reason)
      .catch((err) => console.error('[AdminService] Rejection email failed:', err));
    new NotificationService(this.fastify)
      .createNotification({
        userId: verification.userId,
        type: 'SELLER_APPLICATION_REJECTED',
        category: NotificationCategory.SELLER,
        title: 'Seller application rejected',
        message: 'Your seller application was not approved. Please review the feedback and resubmit.',
        actionType: NotificationActionType.SELLER,
        actionId: verification.userId,
        actionUrl: '/seller/verification',
        eventId: verificationId,
        deduplicationKey: `SELLER_APPLICATION_REJECTED:${verification.userId}:${verificationId}`,
        mandatory: true,
      })
      .catch((err) =>
        console.error('[AdminService] Seller rejection notification failed:', err),
      );

    return { message: 'Seller rejected successfully' };
  }

  // ─── User management ─────────────────────────────────────────────────────

  async getUsers(opts: { page: number; limit: number; search?: string }): Promise<{
    data: Partial<User>[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { page, limit, search } = opts;
    const skip = (page - 1) * limit;

    const qb = this.userRepo
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.firstName',
        'u.lastName',
        'u.email',
        'u.phoneNumber',
        'u.userType',
        'u.status',
        'u.isEmailVerified',
        'u.isCompanyVerified',
        'u.totalPoints',
        'u.createdAt',
      ])
      .orderBy('u.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (search) {
      qb.where(
        'u.email LIKE :s OR u.firstName LIKE :s OR u.lastName LIKE :s',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['verification'],
    });

    if (!user) throw createError.notFound('User not found');
    return user;
  }

  async disableUser(
    userId: string,
    disabledBy: string,
    reason?: string,
  ): Promise<{
    success: true;
    message: string;
    data: { userId: string; status: UserStatus.DISABLED };
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');
    if (user.status === UserStatus.DELETED) {
      throw createError.forbidden('Deleted users cannot be disabled');
    }

    await auditedUpdate(this.userRepo, userId, {
      status: UserStatus.DISABLED,
      statusReason: reason ?? null,
      disabledBy,
      disabledAt: new Date(),
    });
    await this.recordAdminAuditEvent({
      eventType: 'USER_DISABLED_BY_ADMIN',
      actorAdminId: disabledBy,
      targetUserId: userId,
      metadata: { reason: reason ?? null },
    });

    sendAccountRestrictionEmail(user.email, user.firstName, reason).catch((err) =>
      console.error('[AdminService] Restriction email failed:', err),
    );
    new NotificationService(this.fastify)
      .createNotification({
        userId,
        type: 'ACCOUNT_DISABLED',
        category: NotificationCategory.ACCOUNT,
        title: 'Account disabled',
        message: 'Your account has been disabled. Please contact support for assistance.',
        actionType: NotificationActionType.NONE,
        eventId: `${userId}:${Date.now()}`,
        deduplicationKey: `ACCOUNT_DISABLED:${userId}:${Date.now()}`,
        mandatory: true,
        allowInactiveRecipient: true,
      })
      .catch((err) =>
        console.error('[AdminService] Account disabled notification failed:', err),
      );

    return {
      success: true,
      message: 'User account disabled successfully.',
      data: { userId, status: UserStatus.DISABLED },
    };
  }

  async activateUser(
    userId: string,
    activatedBy?: string,
  ): Promise<{ success: true; message: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');
    if (user.status === UserStatus.DELETED) {
      throw createError.forbidden('Deleted users cannot be reactivated');
    }
    if (!user.isEmailVerified) {
      throw createError.badRequest('User email verification must be completed before activation');
    }

    await auditedUpdate(this.userRepo, userId, {
      status: UserStatus.ACTIVE,
      statusReason: null,
    });
    await this.recordAdminAuditEvent({
      eventType: 'USER_REACTIVATED_BY_ADMIN',
      actorAdminId: activatedBy ?? null,
      targetUserId: userId,
    });
    new NotificationService(this.fastify)
      .createNotification({
        userId,
        type: 'ACCOUNT_REACTIVATED',
        category: NotificationCategory.ACCOUNT,
        title: 'Account reactivated',
        message: 'Your account has been reactivated.',
        actionType: NotificationActionType.NONE,
        eventId: `${userId}:${Date.now()}`,
        deduplicationKey: `ACCOUNT_REACTIVATED:${userId}:${Date.now()}`,
        mandatory: true,
      })
      .catch((err) =>
        console.error('[AdminService] Account reactivation notification failed:', err),
      );

    return {
      success: true,
      message: 'User account activated successfully.',
    };
  }

  async updateUserStatus(
    userId: string,
    status: UserStatus,
    reason?: string,
    adminId?: string,
  ): Promise<{ message: string }> {
    if (status === UserStatus.DISABLED) {
      const result = await this.disableUser(userId, adminId ?? '', reason);
      return { message: result.message };
    }

    if (status === UserStatus.ACTIVE) {
      const result = await this.activateUser(userId, adminId);
      return { message: result.message };
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');

    await auditedUpdate(this.userRepo, userId, {
      status,
      statusReason: reason ?? null,
    });
    return { message: `User status updated to ${status}` };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async loadAdminWithRole(adminId: string): Promise<Admin | null> {
    return this.adminRepo
      .createQueryBuilder('admin')
      .leftJoinAndSelect('admin.role', 'role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .where('admin.id = :adminId', { adminId })
      .orderBy('permission.module', 'ASC')
      .addOrderBy('permission.code', 'ASC')
      .getOne();
  }

  private async loadRoleWithPermissions(
    roleId: string,
  ): Promise<AdminRoleEntity | null> {
    return this.adminRoleRepo
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .where('role.id = :roleId', { roleId })
      .orderBy('permission.module', 'ASC')
      .addOrderBy('permission.code', 'ASC')
      .getOne();
  }

  private async getAssignableRole(roleId: string): Promise<AdminRoleEntity> {
    const role = await this.adminRoleRepo.findOne({ where: { id: roleId } });
    if (!role) throw createError.badRequest('Selected Admin role does not exist');
    if (role.status !== AdminRoleStatus.ACTIVE) {
      throw createError.badRequest('Inactive Admin roles cannot be assigned');
    }
    return role;
  }

  private async ensureRoleNameAvailable(
    name: string,
    exceptRoleId?: string,
  ): Promise<void> {
    const qb = this.adminRoleRepo
      .createQueryBuilder('role')
      .where('LOWER(role.name) = :name', { name: name.toLowerCase() });

    if (exceptRoleId) {
      qb.andWhere('role.id != :exceptRoleId', { exceptRoleId });
    }

    const existing = await qb.getOne();
    if (existing) throw createError.conflict('An Admin role with this name already exists');
  }

  private async validatePermissionIds(permissionIds: string[]): Promise<Permission[]> {
    const uniquePermissionIds = Array.from(new Set(permissionIds));
    if (uniquePermissionIds.length !== permissionIds.length) {
      throw createError.badRequest('Duplicate Permission IDs are not allowed');
    }

    if (uniquePermissionIds.length === 0) return [];

    const permissions = await this.permissionRepo.find({
      where: {
        id: In(uniquePermissionIds),
        status: PermissionStatus.ACTIVE,
      },
    });

    if (permissions.length !== uniquePermissionIds.length) {
      throw createError.badRequest('Every Permission ID must exist and be active');
    }

    return permissions;
  }

  private async getEffectivePermissionCodes(admin: Admin): Promise<string[]> {
    if (admin.isSuperAdmin) {
      const permissions = await this.permissionRepo.find({
        where: { status: PermissionStatus.ACTIVE },
        order: { module: 'ASC', code: 'ASC' },
      });
      return permissions.map((permission) => permission.code);
    }

    if (!admin.role || admin.role.status !== AdminRoleStatus.ACTIVE) return [];

    return Array.from(
      new Set(
        (admin.role.rolePermissions ?? [])
          .filter(
            (rolePermission) =>
              rolePermission.permission?.status === PermissionStatus.ACTIVE,
          )
          .map((rolePermission) => rolePermission.permission.code),
      ),
    ).sort();
  }

  private async recordFailedAdminLogin(admin: Admin): Promise<void> {
    const failedLoginAttempts = (admin.failedLoginAttempts ?? 0) + 1;
    const lockedUntil =
      failedLoginAttempts >= (await getSetting<number>('maxLoginAttempts'))
        ? addMinutes((await getSetting<number>('loginLockMinutes')))
        : null;

    await auditedUpdate(this.adminRepo, admin.id, {
      failedLoginAttempts,
      lockedUntil,
    });
    await this.recordAdminAuditEvent({
      eventType: 'ADMIN_LOGIN_FAILED',
      targetAdminId: admin.id,
      metadata: { failedLoginAttempts },
    });

    if (lockedUntil) {
      await this.recordAdminAuditEvent({
        eventType: 'ADMIN_ACCOUNT_LOCKED',
        targetAdminId: admin.id,
        metadata: { lockedUntil: lockedUntil.toISOString() },
      });
    }
  }

  private signAdminToken(admin: Admin): string {
    return this.fastify.jwt.sign(
      {
        sub: admin.id,
        email: admin.email,
        role: admin.roleId,
        isSuperAdmin: admin.isSuperAdmin,
        authVersion: admin.authVersion,
        tokenType: 'admin',
      },
      { expiresIn: config.jwt.accessExpiresIn },
    );
  }

  private buildAdminSetupLink(token: string): string {
    const url = new URL('/admin/setup', config.app.frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private pagination(page: number, limit: number, total: number): Pagination {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async bumpAdminAuthVersion(adminId: string): Promise<void> {
    await this.adminRepo
      .createQueryBuilder()
      .update(Admin)
      .set({ authVersion: () => '`authVersion` + 1' })
      .where('id = :adminId', { adminId })
      .execute();
  }

  private async bumpAuthVersionForRole(
    roleId: string,
    repo: Repository<Admin> = this.adminRepo,
  ): Promise<void> {
    await repo
      .createQueryBuilder()
      .update(Admin)
      .set({ authVersion: () => '`authVersion` + 1' })
      .where('roleId = :roleId', { roleId })
      .execute();
  }

  private async recordAdminAuditEvent(input: AdminAuditInput): Promise<void> {
    await this.adminAuditRepo.save(
      this.adminAuditRepo.create({
        eventType: input.eventType,
        actorAdminId: input.actorAdminId ?? null,
        targetAdminId: input.targetAdminId ?? null,
        targetUserId: input.targetUserId ?? null,
        targetRoleId: input.targetRoleId ?? null,
        metadata: input.metadata ?? null,
      }),
    );
  }
}

function serializeAdmin(admin: Admin, permissions: string[]): Record<string, unknown> {
  return {
    ...serializeAdminForList(admin),
    permissions,
  };
}

function serializeAdminForList(admin: Admin): Record<string, unknown> {
  return {
    id: admin.id,
    firstName: admin.firstName,
    lastName: admin.lastName,
    email: admin.email,
    phoneNumber: admin.phoneNumber,
    status: admin.status,
    isSuperAdmin: admin.isSuperAdmin,
    role: admin.role ? serializeRoleSummary(admin.role) : null,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
  };
}

function serializeRoleSummary(role: AdminRoleEntity): Record<string, unknown> {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    status: role.status,
  };
}

function serializeRoleWithPermissions(role: AdminRoleEntity): Record<string, unknown> {
  return {
    ...serializeRoleSummary(role),
    permissions: (role.rolePermissions ?? [])
      .filter(
        (rolePermission) =>
          rolePermission.permission?.status === PermissionStatus.ACTIVE,
      )
      .map((rolePermission) => serializePermission(rolePermission.permission)),
  };
}

function serializePermission(permission: Permission): Record<string, unknown> {
  return {
    id: permission.id,
    code: permission.code,
    name: permission.name,
    description: permission.description,
    module: permission.module,
  };
}
