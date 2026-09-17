import { RewardService } from '../reward/reward.service';
import { normalizeReferralCode } from '../reward/reward.policy';
import { getSetting } from '../system-settings/settings.reader';
import { auditedUpdate } from '../audit-log/audit-log.mutations';
import { writeAudit } from '../audit-log/audit-log.writer';
import { FastifyInstance } from 'fastify';
import { AppDataSource } from '../../database/data-source';
import { User, UserStatus, UserType } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import {
  addDays,
  addMinutes,
  comparePassword,
  generateOtp,
  generateSecureToken,
  hashPassword,
  hashRefreshToken,
  hashToken,
  isExpired,
} from '../../common/utils/token.util';
import {
  ensureEmailDeliveryEnabled,
  sendEmailVerification,
  sendPasswordReset,
} from '../../common/utils/email.service';
import { createError } from '../../common/utils/http-error.util';
import {
  databaseErrorCode,
  isDatabaseSchemaError,
  isDuplicateKeyError,
  isDuplicateKeyFor,
} from '../../common/utils/database-error.util';
import { config } from '../../config';
import {
  GoogleAuthDto,
  LoginDto,
  SignupDto,
  UserSelfStatusUpdateDto,
} from '../../common/utils/validation.schemas';
import {
  NotificationActionType,
  NotificationCategory,
} from '../../database/entities/notification.entity';
import { NotificationService } from '../notification/notification.service';
import { I18nService } from '../i18n/i18n.service';

const DOCUMENTED_JWT_EXPIRES_IN = '24h';

type LoginResult =
  | {
      token: string;
      requiresEmailVerification: true;
    }
  | {
      token: string;
      accessToken: string;
      refreshToken: string;
      user: Record<string, unknown>;
    };

type GoogleProfile = {
  email?: string;
  email_verified?: boolean | string;
  given_name?: string;
  family_name?: string;
  name?: string;
  aud?: string;
};

export class AuthService {
  private userRepo = AppDataSource.getRepository(User);
  private tokenRepo = AppDataSource.getRepository(RefreshToken);
  private i18nService = new I18nService();

  constructor(private readonly fastify: FastifyInstance) {}

  // ─── Signup ────────────────────────────────────────────────────────────────

  async signup(dto: SignupDto): Promise<{
    token: string;
    user: Record<string, unknown>;
  }> {
    ensureEmailDeliveryEnabled();

    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw createError.conflict('An account with this email already exists');
    }

    const referral = dto.referralCode
      ? await this.resolveReferral(dto.referralCode)
      : null;

    const otp = generateOtp();
    const passwordHash = await hashPassword(dto.password);
    const referralCode = await this.generateReferralCode();

    const selectedLanguage = dto.selectedLanguage
      ? (await this.i18nService.ensureSelectableLanguage(dto.selectedLanguage)).code
      : 'en';

    const user = this.userRepo.create({
      firstName: dto.firstName ?? '',
      lastName: dto.lastName ?? '',
      email: dto.email,
      passwordHash,
      phoneNumber: dto.phoneNumber ?? dto.phone ?? null,
      termsOfUse: true,
      merchantTerms: false,
      userType: UserType.BUYER,
      status: UserStatus.INACTIVE,
      isEmailVerified: false,
      selectedLanguage,
      referral,
      referralCode,
      emailVerificationToken: hashToken(otp),
      emailVerificationExpiry: addMinutes((await getSetting<number>('userOtpExpiryMinutes'))),
    });

    const saved = await this.saveNewUser(user);
    try {
      await sendEmailVerification(saved.email, saved.firstName, otp);
    } catch (error) {
      await this.userRepo.delete(saved.id);
      throw error;
    }

    return {
      token: this.signUserToken(saved),
      user: {
        id: saved.id,
        email: saved.email,
        status: saved.status,
        isEmailVerified: saved.isEmailVerified,
      },
    };
  }

  async register(dto: SignupDto): Promise<{
    token: string;
    user: Record<string, unknown>;
  }> {
    return this.signup(dto);
  }

  // ─── Verify Email ─────────────────────────────────────────────────────────

  async verifyEmail(
    token: string,
    otp: string,
  ): Promise<{ message: string; status: UserStatus.ACTIVE }> {
    const user = await this.getUserFromVerificationToken(token);

    if (!user.emailVerificationToken) {
      throw createError.badRequest('No email verification OTP is active');
    }

    if (!user.emailVerificationExpiry || isExpired(user.emailVerificationExpiry)) {
      throw createError.badRequest('OTP has expired. Please request a new one.');
    }

    if (user.emailVerificationToken !== hashToken(otp)) {
      throw createError.badRequest('Invalid OTP');
    }

    await AppDataSource.transaction(async manager => {
      await auditedUpdate(manager.getRepository(User), user.id, {
        isEmailVerified: true,
        status: UserStatus.ACTIVE,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      await new RewardService().qualify(manager, user.id, 'email_verified');
    });

    this.createAccountNotification(user.id, {
      type: 'EMAIL_VERIFIED',
      title: 'Email verified',
      message: 'Your email has been verified successfully.',
      eventId: user.id,
    });

    return {
      message: 'Email verified successfully',
      status: UserStatus.ACTIVE,
    };
  }

  // ─── Google ────────────────────────────────────────────────────────────────

  async googleAuth(dto: GoogleAuthDto): Promise<{
    token: string;
    user: { id: string; email: string; termsOfUse: boolean };
  }> {
    const profile = await this.verifyGoogleToken(dto.googleToken);
    const email = profile.email!.toLowerCase();

    let user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();

    if (user && isRestrictedStatus(user.status)) {
      throw createError.forbidden(restrictedAccountMessage(user.status));
    }

    if (!user) {
      const fallbackName = profile.name || '';
      user = this.userRepo.create({
        firstName: profile.given_name || fallbackName.split(' ')[0] || '',
        lastName: profile.family_name || fallbackName.split(' ').slice(1).join(' '),
        email,
        passwordHash: null,
        phoneNumber: null,
        termsOfUse: false,
        merchantTerms: false,
        userType: UserType.BUYER,
        status: UserStatus.INACTIVE,
        isEmailVerified: true,
        referralCode: await this.generateReferralCode(),
      });
      user = await this.saveNewUser(user);
    } else if (!user.isEmailVerified || (user.termsOfUse && user.status === UserStatus.INACTIVE)) {
      user.isEmailVerified = true;
      if (user.termsOfUse) user.status = UserStatus.ACTIVE;
      user = await AppDataSource.transaction(async manager => {
        const saved = await manager.save(User, user!);
        await new RewardService().qualify(manager, saved.id, 'email_verified');
        return saved;
      });
    }

    return {
      token: this.signUserToken(user),
      user: {
        id: user.id,
        email: user.email,
        termsOfUse: user.termsOfUse,
      },
    };
  }

  async updateTerms(
    userId: string,
    termsOfUse: true,
  ): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');
    if (isRestrictedStatus(user.status)) {
      throw createError.forbidden(restrictedAccountMessage(user.status));
    }

    await auditedUpdate(this.userRepo, user.id, {
      termsOfUse,
      status:
        user.isEmailVerified && user.status === UserStatus.INACTIVE
          ? UserStatus.ACTIVE
          : user.status,
    });

    return { message: 'Terms accepted successfully' };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<LoginResult> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .addSelect('user.failedLoginAttempts')
      .addSelect('user.lockedUntil')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user) {
      await hashPassword('dummy_to_prevent_timing_attack');
      await writeAudit(AppDataSource.manager,{eventCode:'USER_LOGIN_FAILED',module:'auth',actorType:'user'});
      throw createError.unauthorized('Invalid email or password');
    }

    if (user.lockedUntil && !isExpired(user.lockedUntil)) {
      throw createError.tooManyRequests(
        `Account temporarily locked. Try again after ${user.lockedUntil.toISOString()}`,
      );
    }

    if (isRestrictedStatus(user.status)) {
      throw createError.forbidden(restrictedAccountMessage(user.status));
    }

    if (!user.passwordHash) {
      throw createError.unauthorized('Use Google to continue with this account');
    }

    const passwordMatch = await comparePassword(dto.password, user.passwordHash);

    if (!passwordMatch) {
      const attempts = user.failedLoginAttempts + 1;
      const update: Partial<User> =
        attempts >= (await getSetting<number>('maxLoginAttempts'))
          ? {
              failedLoginAttempts: attempts,
              lockedUntil: addMinutes((await getSetting<number>('loginLockMinutes'))),
            }
          : { failedLoginAttempts: attempts };
      await auditedUpdate(this.userRepo, user.id, update);
      await writeAudit(AppDataSource.manager,{eventCode:'USER_LOGIN_FAILED',module:'auth',actorType:'user',actorId:user.id,actorEmail:user.email});
      if(attempts>=(await getSetting<number>('maxLoginAttempts'))) await writeAudit(AppDataSource.manager,{eventCode:'REPEATED_LOGIN_FAILURE',module:'security',actorType:'user',actorId:user.id});

      throw createError.unauthorized('Invalid email or password');
    }

    if (!user.isEmailVerified || user.status === UserStatus.INACTIVE) {
      await this.issueEmailOtp(user);
      await auditedUpdate(this.userRepo, user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      return {
        token: this.signUserToken(user),
        requiresEmailVerification: true,
      };
    }

    await auditedUpdate(this.userRepo, user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    const { accessToken, refreshToken } = await this.generateTokenPair(
      user,
      ipAddress,
      userAgent,
    );

    await writeAudit(AppDataSource.manager,{eventCode:'USER_LOGIN_SUCCESSFUL',module:'auth',actorType:'user',actorId:user.id,actorEmail:user.email});
    return {
      token: accessToken,
      accessToken,
      refreshToken,
      user: serializeUser(user),
    };
  }

  // ─── Refresh Tokens ───────────────────────────────────────────────────────

  async refreshTokens(
    rawRefreshToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ token: string; accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefreshToken(rawRefreshToken);

    const storedToken = await this.tokenRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!storedToken || storedToken.isRevoked || isExpired(storedToken.expiresAt)) {
      if (storedToken && storedToken.isRevoked) {
        await this.tokenRepo.update(
          { userId: storedToken.userId },
          { isRevoked: true },
        );
      }
      throw createError.unauthorized('Invalid or expired refresh token');
    }

    if (storedToken.user.status !== UserStatus.ACTIVE) {
      throw createError.forbidden('Account cannot perform actions');
    }

    await this.tokenRepo.update(storedToken.id, { isRevoked: true });

    const { accessToken, refreshToken } = await this.generateTokenPair(
      storedToken.user,
      ipAddress,
      userAgent,
    );

    return { token: accessToken, accessToken, refreshToken };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(rawRefreshToken: string): Promise<{ message: string }> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    await this.tokenRepo.update({ tokenHash }, { isRevoked: true });
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.tokenRepo.update({ userId }, { isRevoked: true });
    return { message: 'Logged out from all devices' };
  }

  // ─── Forgot / Reset Password ──────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    ensureEmailDeliveryEnabled();

    const user = await this.userRepo.findOne({ where: { email } });
    const msg = 'If that email is registered, you will receive a reset code shortly.';
    if (!user || user.status === UserStatus.DELETED) return { message: msg };

    const otp = generateOtp();

    await auditedUpdate(this.userRepo, user.id, {
      passwordResetToken: hashToken(otp),
      passwordResetExpiry: addMinutes((await getSetting<number>('passwordResetOtpExpiryMinutes'))),
    });

    try {
      await sendPasswordReset(user.email, user.firstName, otp);
    } catch (error) {
      await this.userRepo.update(user.id, {
        passwordResetToken: null,
        passwordResetExpiry: null,
      });
      throw error;
    }

    return { message: msg };
  }

  async resetPassword(
    otp: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const otpHash = hashToken(otp);

    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordResetToken')
      .addSelect('user.passwordResetExpiry')
      .where('user.passwordResetToken = :otpHash', { otpHash })
      .getOne();

    if (!user || !user.passwordResetExpiry || isExpired(user.passwordResetExpiry)) {
      throw createError.badRequest('Invalid or expired reset code');
    }

    const passwordHash = await hashPassword(newPassword);

    await auditedUpdate(this.userRepo, user.id, {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
    });

    await this.tokenRepo.update({ userId: user.id }, { isRevoked: true });

    this.createAccountNotification(user.id, {
      type: 'PASSWORD_CHANGED',
      title: 'Password changed',
      message: 'Your account password was reset successfully.',
      eventId: `reset:${Date.now()}`,
    });

    return { message: 'Password reset successful' };
  }

  // ─── Change Password (authenticated) ──────────────────────────────────────

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw createError.notFound('User not found');
    if (!user.passwordHash) {
      throw createError.badRequest('Password login is not enabled for this account');
    }

    const match = await comparePassword(oldPassword, user.passwordHash);
    if (!match) throw createError.unauthorized('Old password is incorrect');

    const passwordHash = await hashPassword(newPassword);
    await auditedUpdate(this.userRepo, userId, { passwordHash });

    await this.tokenRepo.update({ userId }, { isRevoked: true });

    this.createAccountNotification(userId, {
      type: 'PASSWORD_CHANGED',
      title: 'Password changed',
      message: 'Your account password was changed successfully.',
      eventId: `change:${Date.now()}`,
    });

    return { message: 'Password changed successfully' };
  }

  async updateOwnStatus(
    userId: string,
    dto: UserSelfStatusUpdateDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');

    await auditedUpdate(this.userRepo, userId, {
      status: UserStatus.DELETED,
      statusReason: dto.reason ?? null,
    });
    await this.tokenRepo.update({ userId }, { isRevoked: true });

    return { message: 'Account deleted successfully' };
  }

  private createAccountNotification(
    userId: string,
    details: {
      type: string;
      title: string;
      message: string;
      eventId: string;
    },
  ): void {
    new NotificationService(this.fastify)
      .createNotification({
        userId,
        type: details.type,
        category: NotificationCategory.ACCOUNT,
        title: details.title,
        message: details.message,
        actionType: NotificationActionType.NONE,
        eventId: details.eventId,
        deduplicationKey: `${details.type}:${userId}:${details.eventId}`,
        mandatory: true,
      })
      .catch((err) =>
        console.error('[AuthService] Account notification failed:', err),
      );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getUserFromVerificationToken(token: string): Promise<User> {
    let payload: { sub?: string; tokenType?: string };
    try {
      payload = this.fastify.jwt.verify(token) as { sub?: string; tokenType?: string };
    } catch {
      throw createError.unauthorized('Invalid or expired token');
    }

    if (!payload.sub || payload.tokenType === 'admin') {
      throw createError.unauthorized('Invalid verification token');
    }

    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.emailVerificationToken')
      .addSelect('user.emailVerificationExpiry')
      .where('user.id = :id', { id: payload.sub })
      .getOne();

    if (!user) throw createError.notFound('User not found');
    if (isRestrictedStatus(user.status)) {
      throw createError.forbidden(restrictedAccountMessage(user.status));
    }
    return user;
  }

  private async issueEmailOtp(user: User): Promise<void> {
    ensureEmailDeliveryEnabled();

    const otp = generateOtp();
    await auditedUpdate(this.userRepo, user.id, {
      emailVerificationToken: hashToken(otp),
      emailVerificationExpiry: addMinutes((await getSetting<number>('userOtpExpiryMinutes'))),
    });
    try {
      await sendEmailVerification(user.email, user.firstName, otp);
    } catch (error) {
      await this.userRepo.update(user.id, {
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      });
      throw error;
    }
  }

  private async resolveReferral(referralCode: string): Promise<string> {
    const referrer = await this.userRepo.createQueryBuilder('u').where('UPPER(u.referralCode) = :code', {code: normalizeReferralCode(referralCode)}).getOne();
    if (!referrer || [UserStatus.DISABLED, UserStatus.DELETED].includes(referrer.status)) throw createError.badRequest('Invalid referral code');
    return referrer.referralCode!;
  }

  private async generateReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateSecureToken().slice(0, 8).toUpperCase();
      const existing = await this.userRepo.findOne({
        where: { referralCode: code },
        select: ['id'],
      });
      if (!existing) return code;
    }
    throw createError.conflict('Unable to generate referral code');
  }

  private async saveNewUser(user: User): Promise<User> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await AppDataSource.transaction(async manager => {
          const saved = await manager.save(User, user);
          await new RewardService().attribute(manager, saved);
          return saved;
        });
      } catch (err) {
        if (isDuplicateKeyFor(err, 'referralCode') && attempt === 0) {
          user.referralCode = await this.generateReferralCode();
          continue;
        }

        if (isDuplicateKeyFor(err, 'email')) {
          throw createError.conflict('An account with this email already exists');
        }

        if (isDuplicateKeyError(err)) {
          throw createError.conflict(
            'Unable to create account because an account value already exists',
          );
        }

        this.fastify.log.error(
          {
            code: databaseErrorCode(err),
            schemaMismatch: isDatabaseSchemaError(err),
            err: config.isDev ? err : undefined,
          },
          '[AuthService] User creation failed',
        );
        throw createError.internal(
          'Unable to create account right now. Please try again later.',
          'ACCOUNT_CREATE_FAILED',
        );
      }
    }

    throw createError.conflict('Unable to generate referral code');
  }

  private signUserToken(user: User): string {
    return this.fastify.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.userType,
        tokenType: 'user',
      },
      { expiresIn: DOCUMENTED_JWT_EXPIRES_IN },
    );
  }

  private async generateTokenPair(
    user: User,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signUserToken(user);
    const rawRefreshToken = generateSecureToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);

    await this.tokenRepo.save(
      this.tokenRepo.create({
        userId: user.id,
        tokenHash,
        ipAddress,
        userAgent,
        expiresAt: addDays(7),
      }),
    );

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private async verifyGoogleToken(googleToken: string): Promise<GoogleProfile> {
    if (!config.google.clientId) {
      throw createError.serviceUnavailable(
        'Google login is not configured',
        'GOOGLE_AUTH_UNAVAILABLE',
      );
    }

    const url = new URL('https://oauth2.googleapis.com/tokeninfo');
    url.searchParams.set('id_token', googleToken);

    const response = await fetch(url);
    if (!response.ok) {
      throw createError.unauthorized('Invalid Google token');
    }

    const profile = (await response.json()) as GoogleProfile;
    if (!profile.email) {
      throw createError.unauthorized('Google token did not include an email');
    }

    if (
      profile.email_verified === false ||
      profile.email_verified === 'false'
    ) {
      throw createError.unauthorized('Google email is not verified');
    }

    if (profile.aud !== config.google.clientId) {
      throw createError.unauthorized('Google token audience is invalid');
    }

    return profile;
  }
}

export function sanitizeUser(user: User): Record<string, unknown> {
  const safe = { ...user } as Record<string, unknown>;
  delete safe.passwordHash;
  delete safe.emailVerificationToken;
  delete safe.emailVerificationExpiry;
  delete safe.passwordResetToken;
  delete safe.passwordResetExpiry;
  delete safe.failedLoginAttempts;
  delete safe.lockedUntil;
  const totalAverageReviews = safe.totalAverageReviews;
  delete safe.totalAverageReviews;

  return {
    ...safe,
    totalAverageReviews: Number(totalAverageReviews ?? 0),
  };
}

export function serializeUser(user: User): Record<string, unknown> {
  return sanitizeUser(user);
}

function isRestrictedStatus(status: UserStatus): boolean {
  return status === UserStatus.DISABLED || status === UserStatus.DELETED;
}

function restrictedAccountMessage(status: UserStatus): string {
  return status === UserStatus.DELETED
    ? 'This account has been deleted'
    : 'This account has been disabled';
}
