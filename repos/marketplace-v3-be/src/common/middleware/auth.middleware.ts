import { auditContext, writeAudit } from '../../modules/audit-log/audit-log.writer';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AppDataSource } from '../../database/data-source';
import { Admin, AdminStatus } from '../../database/entities/admin.entity';
import { AdminRoleStatus } from '../../database/entities/admin-role.entity';
import { PermissionStatus } from '../../database/entities/permission.entity';
import { User, UserStatus, UserType } from '../../database/entities/user.entity';

// Import the augmentation so the module is always included
import '../../common/types/jwt.types';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // jwtVerify() sets request.user to JwtPayload (typed via @fastify/jwt augmentation)
    await request.jwtVerify();

    const { sub, tokenType } = request.user; // sub: string — no cast needed

    if (tokenType === 'admin') {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'User token required',
      });
    }

    const userRepo = AppDataSource.getRepository(User);
    const dbUser = await userRepo.findOne({ where: { id: sub } });

    if (!dbUser) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'User not found',
      });
    }

    if (dbUser.status !== UserStatus.ACTIVE) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Account cannot perform actions',
      });
    }

    // Attach the full DB entity under a separate key so it never
    // collides with @fastify/jwt's own request.user (JwtPayload).
    request.dbUser = dbUser;
    Object.assign(auditContext.getStore() ?? {}, {actorId:dbUser.id,actorType:'user',actorEmail:dbUser.email});
  } catch {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

export function requireRole(...roles: UserType[]) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    await authenticate(request, reply);
    if (reply.sent) return; // authenticate already replied

    if (!request.dbUser || !roles.includes(request.dbUser.userType)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
    }
  };
}

export const requireAuth = authenticate;
export const requireAdmin = authenticateAdmin;
export const requireSeller = requireRole(UserType.SELLER);

export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    if (!request.dbAdmin) {
      await request.jwtVerify();
    }

    if (request.dbAdmin) return;

    const { sub, tokenType, authVersion } = request.user;

    if (tokenType !== 'admin') {
      return reply.status(403).send({
        success: false,
        statusCode: 403,
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
    }

    const adminRepo = AppDataSource.getRepository(Admin);
    const admin = await adminRepo
      .createQueryBuilder('admin')
      .addSelect('admin.authVersion')
      .leftJoinAndSelect('admin.role', 'role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .where('admin.id = :sub', { sub })
      .getOne();

    if (!admin) {
      return reply.status(401).send({
        success: false,
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Admin not found',
      });
    }

    if (admin.status === AdminStatus.PENDING) {
      return reply.status(403).send({
        success: false,
        statusCode: 403,
        error: 'Forbidden',
        code: 'ADMIN_SETUP_REQUIRED',
        message: 'Please complete your Admin account setup before signing in.',
      });
    }

    if (admin.status === AdminStatus.INACTIVE) {
      return reply.status(403).send({
        success: false,
        statusCode: 403,
        error: 'Forbidden',
        code: 'ADMIN_ACCOUNT_INACTIVE',
        message: 'Your Admin account is currently inactive.',
      });
    }

    if (typeof authVersion !== 'number' || authVersion !== admin.authVersion) {
      return reply.status(401).send({
        success: false,
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Admin session has expired',
      });
    }

    request.dbAdmin = admin;
    Object.assign(auditContext.getStore() ?? {}, {actorId:admin.id,actorType:'admin',actorEmail:admin.email});
  } catch {
    return reply.status(401).send({
      success: false,
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.dbAdmin) {
    await authenticateAdmin(request, reply);
  }
  if (reply.sent) return;

  if (!request.dbAdmin?.isSuperAdmin) {
    return reply.status(403).send({
      success: false,
      statusCode: 403,
      error: 'Forbidden',
      message: 'Super Admin access required',
    });
  }
}

export function requirePermission(permissionCode: string) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    await authenticateAdmin(request, reply);
    if (reply.sent) return;

    if (!adminHasPermission(request.dbAdmin!, permissionCode)) {
      await recordPermissionDenied(request, permissionCode);
    sendAdminPermissionDenied(reply);
    }
  };
}

export async function enforceAdminPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  permissionCode: string,
): Promise<boolean> {
  await authenticateAdmin(request, reply);
  if (reply.sent) return false;

  if (!adminHasPermission(request.dbAdmin!, permissionCode)) {
    await recordPermissionDenied(request, permissionCode);
    sendAdminPermissionDenied(reply);
    return false;
  }

  return true;
}

export function adminHasPermission(
  admin: Admin,
  permissionCode: string,
): boolean {
  if (admin.isSuperAdmin) return true;
  if (!admin.role || admin.role.status !== AdminRoleStatus.ACTIVE) return false;

  return (admin.role.rolePermissions ?? []).some(
    (rolePermission) =>
      rolePermission.permission?.status === PermissionStatus.ACTIVE &&
      rolePermission.permission.code === permissionCode,
  );
}

function sendAdminPermissionDenied(reply: FastifyReply): void {
  reply.status(403).send({
    success: false,
    statusCode: 403,
    error: 'Forbidden',
    code: 'ADMIN_PERMISSION_DENIED',
    message: 'You do not have permission to perform this action.',
  });
}

export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
    if (request.user.tokenType === 'admin') return;
    const userRepo = AppDataSource.getRepository(User);
    const dbUser = await userRepo.findOne({ where: { id: request.user.sub } });

    if (dbUser && dbUser.status === UserStatus.ACTIVE) {
      request.dbUser = dbUser;
    Object.assign(auditContext.getStore() ?? {}, {actorId:dbUser.id,actorType:'user',actorEmail:dbUser.email});
    }
  } catch {
    // Public endpoints should keep working when no token is supplied.
  }
}

async function recordPermissionDenied(request: FastifyRequest, permissionCode:string):Promise<void> {
 await writeAudit(AppDataSource.manager,{eventCode:'ADMIN_PERMISSION_DENIED',module:'security',actorType:'admin',actorId:request.dbAdmin!.id,actorEmail:request.dbAdmin!.email,metadata:{requiredPermission:permissionCode,method:request.method,route:request.routeOptions.url}});
}
