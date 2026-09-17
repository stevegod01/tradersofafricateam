import { auditedUpdate } from '../audit-log/audit-log.mutations';
import { FastifyInstance } from 'fastify';
import { AppDataSource } from '../../database/data-source';
import { User, UserType } from '../../database/entities/user.entity';
import {
  CompanyVerification,
  VerificationStatus,
} from '../../database/entities/company-verification.entity';
import {
  UpgradeToSellerDto,
  UserProfileUpdateDto,
} from '../../common/utils/validation.schemas';
import {
  processUpload,
  UploadValidationError,
  UploadedFile,
} from '../../common/utils/file-upload.util';
import { sanitizeUser } from '../auth/auth.service';
import { createError } from '../../common/utils/http-error.util';
import { I18nService } from '../i18n/i18n.service';

export class SellerService {
  private userRepo = AppDataSource.getRepository(User);
  private verificationRepo = AppDataSource.getRepository(CompanyVerification);
  private i18nService = new I18nService();

  // fastify kept for potential future use (e.g. events, logger)
  constructor(private readonly _fastify: FastifyInstance) {}

  // ─── Upgrade to Seller / Submit Verification ──────────────────────────────

  async upgradeToSeller(
    userId: string,
    dto: UpgradeToSellerDto,
    logoFile?: UploadedFile,
  ): Promise<{ message: string; status: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');

    const existing = await this.verificationRepo.findOne({ where: { userId } });

    if (existing) {
      if (existing.verificationStatus === VerificationStatus.PENDING) {
        throw createError.conflict('You already have a pending verification submission');
      }
      if (existing.verificationStatus === VerificationStatus.APPROVED) {
        throw createError.conflict('Your business is already verified');
      }
      return this.resubmitVerification(user, existing, dto, logoFile);
    }

    let logoUrl: string | null = null;
    if (logoFile) {
      const processed = await this.processLogoUpload(logoFile);
      logoUrl = processed.url;
    }

    await AppDataSource.transaction(async (manager) => {
      await auditedUpdate(manager.getRepository(User), userId, {
        userType: UserType.SELLER,
        storeName: dto.storeName,
        companyName: dto.companyName,
        registrationNumber: dto.registrationNumber ?? null,
        businessType: dto.businessType,
        yearsOfBusiness: dto.yearsOfBusiness,
        companyAddress: dto.companyAddress,
        pickupAddress: dto.pickupAddress,
        companyBio: dto.companyBio ?? null,
        country: dto.country,
        companyLogo: logoUrl,
      });

      const verification = manager.create(CompanyVerification, {
        userId,
        companyName: dto.companyName,
        registrationNumber: dto.registrationNumber ?? null,
        businessType: dto.businessType,
        yearsOfBusiness: dto.yearsOfBusiness,
        companyAddress: dto.companyAddress,
        pickupAddress: dto.pickupAddress,
        companyBio: dto.companyBio ?? null,
        country: dto.country,
        companyLogo: logoUrl,
        verificationStatus: VerificationStatus.PENDING,
      });

      await manager.save(CompanyVerification, verification);
    });

    return { message: 'Verification submitted successfully', status: 'pending' };
  }

  // ─── Resubmit after rejection ─────────────────────────────────────────────

  private async resubmitVerification(
    user: User,
    existing: CompanyVerification,
    dto: UpgradeToSellerDto,
    logoFile?: UploadedFile,
  ): Promise<{ message: string; status: string }> {
    let logoUrl = existing.companyLogo;
    if (logoFile) {
      const processed = await this.processLogoUpload(logoFile);
      logoUrl = processed.url;
    }

    await AppDataSource.transaction(async (manager) => {
      await auditedUpdate(manager.getRepository(User), user.id, {
        userType: UserType.SELLER,
        storeName: dto.storeName,
        companyName: dto.companyName,
        registrationNumber: dto.registrationNumber ?? null,
        businessType: dto.businessType,
        yearsOfBusiness: dto.yearsOfBusiness,
        companyAddress: dto.companyAddress,
        pickupAddress: dto.pickupAddress,
        companyBio: dto.companyBio ?? null,
        country: dto.country,
        companyLogo: logoUrl,
      });

      await auditedUpdate(manager.getRepository(CompanyVerification), existing.id, {
        companyName: dto.companyName,
        registrationNumber: dto.registrationNumber ?? null,
        businessType: dto.businessType,
        yearsOfBusiness: dto.yearsOfBusiness,
        companyAddress: dto.companyAddress,
        pickupAddress: dto.pickupAddress,
        companyBio: dto.companyBio ?? null,
        country: dto.country,
        companyLogo: logoUrl,
        verificationStatus: VerificationStatus.PENDING,
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
      });
    });

    return { message: 'Verification resubmitted successfully', status: 'pending' };
  }

  private async processLogoUpload(logoFile: UploadedFile): Promise<{ url: string }> {
    try {
      return await processUpload(logoFile, { pathPrefix: 'seller-logos' });
    } catch (err) {
      if (err instanceof UploadValidationError) {
        throw createError.badRequest(err.message);
      }
      console.error('[SellerService] Company logo upload failed:', err);
      throw createError.internal('File storage upload failed');
    }
  }

  // ─── Get Current User's Verification Status ───────────────────────────────

  async getMyVerificationStatus(userId: string): Promise<{
    verificationStatus: string;
    submittedAt: Date | null;
    rejectionReason: string | null;
  }> {
    const verification = await this.verificationRepo.findOne({
      where: { userId },
      select: ['verificationStatus', 'submittedAt', 'rejectionReason'],
    });

    if (!verification) {
      return { verificationStatus: 'not_submitted', submittedAt: null, rejectionReason: null };
    }

    return {
      verificationStatus: verification.verificationStatus,
      submittedAt: verification.submittedAt,
      rejectionReason: verification.rejectionReason,
    };
  }

  // ─── Get My Profile ───────────────────────────────────────────────────────

  async updateProfile(
    userId: string,
    dto: UserProfileUpdateDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');

    if (dto.selectedLanguage) {
      const language = await this.i18nService.ensureSelectableLanguage(dto.selectedLanguage);
      dto.selectedLanguage = language.code;
    }

    await auditedUpdate(this.userRepo, userId, dto);
    return { message: 'Profile updated successfully' };
  }

  async getMyProfile(userId: string): Promise<Record<string, unknown>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');
    return sanitizeUser(user);
  }
}
