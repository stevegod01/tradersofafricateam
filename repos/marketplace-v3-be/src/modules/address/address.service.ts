import { requireActiveCountry } from '../system-settings/settings.reader';
import { AppDataSource } from '../../database/data-source';
import { UserAddress } from '../../database/entities/user-address.entity';
import { AddressCreateDto } from '../../common/utils/validation.schemas';

export class AddressService {
  private addressRepo = AppDataSource.getRepository(UserAddress);

  async getAddresses(userId: string): Promise<{ success: true; data: UserAddress[] }> {
    const addresses = await this.addressRepo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
    return { success: true, data: addresses };
  }

  async createAddress(
    userId: string,
    dto: AddressCreateDto,
  ): Promise<{ success: true; message: string; data: { id: string; isDefault: boolean } }> {
    const country=await requireActiveCountry(dto.country);
    const existingCount = await this.addressRepo.count({ where: { userId } });
    const isDefault = dto.isDefault || existingCount === 0;
    let savedAddress: UserAddress | null = null;

    await AppDataSource.transaction(async (manager) => {
      if (isDefault) {
        await manager.update(UserAddress, { userId }, { isDefault: false });
      }

      const address = manager.create(UserAddress, {
        userId,
        label: dto.label,
        recipientName: dto.recipientName,
        phoneNumber: dto.phoneNumber,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2 ?? null,
        city: dto.city,
        state: dto.state,
        country,
        postalCode: dto.postalCode ?? null,
        isDefault,
      });

      savedAddress = await manager.save(UserAddress, address);
    });

    return {
      success: true,
      message: 'Address added successfully.',
      data: {
        id: savedAddress!.id,
        isDefault: savedAddress!.isDefault,
      },
    };
  }
}
