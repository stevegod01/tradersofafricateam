import { IsNull } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { Cart } from '../../database/entities/cart.entity';
import { CartItem } from '../../database/entities/cart-item.entity';
import {
  InventoryStatus,
  Product,
  ProductStatus,
  ProductType,
} from '../../database/entities/product.entity';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { UserStatus } from '../../database/entities/user.entity';
import { CartItemDto } from '../../common/utils/validation.schemas';
import { createError } from '../../common/utils/http-error.util';
import { resolveTranslation } from '../../common/utils/i18n.util';
import {
  calculateFinalPrice,
  roundMoney,
  toNumber,
} from '../../common/utils/pricing.util';

export type CartLineItem = {
  cartItemId: string;
  productId: string;
  variantId: string | null;
  productName: string | null;
  mainImage: string | null;
  sku: string | null;
  attributes: Record<string, string> | null;
  unitPrice: number;
  discount: number | null;
  finalUnitPrice: number;
  quantity: number;
  subtotal: number;
  currency: string;
  minimumOrder: { quantity: number; unit: string };
  availableQuantity: number;
  logistics: {
    weight: number | null;
    weightUnit: string | null;
    length: number | null;
    width: number | null;
    height: number | null;
    dimensionUnit: string | null;
  };
};

export type CartSellerGroup = {
  sellerId: string;
  storeName: string | null;
  items: CartLineItem[];
  itemsCount: number;
  productsSubtotal: number;
};

export type CartSummary = {
  cartId: string | null;
  sellerGroups: CartSellerGroup[];
  productsSubtotal: number;
  currency: string | null;
  totalCount: number;
};

export class CartService {
  private cartRepo = AppDataSource.getRepository(Cart);
  private itemRepo = AppDataSource.getRepository(CartItem);
  private productRepo = AppDataSource.getRepository(Product);
  private variantRepo = AppDataSource.getRepository(ProductVariant);

  async addItem(
    userId: string,
    dto: CartItemDto,
  ): Promise<{
    success: true;
    message: string;
    data: {
      cartItemId: string;
      productId: string;
      variantId: string | null;
      quantity: number;
      cartItemsCount: number;
    };
  }> {
    const cart = await this.getOrCreateCart(userId);
    const existing = await this.findExistingItem(
      cart.id,
      dto.productId,
      dto.variantId ?? null,
    );
    const nextQuantity = toNumber(existing?.quantity) + dto.quantity;

    await this.validatePurchasable(userId, dto.productId, dto.variantId ?? null, nextQuantity);

    const item = existing
      ? this.itemRepo.merge(existing, { quantity: nextQuantity })
      : this.itemRepo.create({
          cartId: cart.id,
          productId: dto.productId,
          variantId: dto.variantId ?? null,
          quantity: dto.quantity,
        });

    const saved = await this.itemRepo.save(item);
    const cartItemsCount = await this.itemRepo.count({ where: { cartId: cart.id } });

    return {
      success: true,
      message: 'Product added to cart.',
      data: {
        cartItemId: saved.id,
        productId: saved.productId,
        variantId: saved.variantId,
        quantity: toNumber(saved.quantity),
        cartItemsCount,
      },
    };
  }

  async getCart(userId: string, language: string): Promise<{ success: true; data: CartSummary }> {
    const summary = await this.buildCartSummary(userId, language, false);
    return { success: true, data: summary };
  }

  async updateItem(
    userId: string,
    cartItemId: string,
    quantity: number,
  ): Promise<{
    success: true;
    message: string;
    data: { cartItemId: string; quantity: number; subtotal: number };
  }> {
    const item = await this.findUserCartItem(userId, cartItemId);
    const { unitPrice, discount } = await this.validatePurchasable(
      userId,
      item.productId,
      item.variantId,
      quantity,
    );

    await this.itemRepo.update(item.id, { quantity });

    return {
      success: true,
      message: 'Cart updated successfully.',
      data: {
        cartItemId: item.id,
        quantity,
        subtotal: roundMoney(calculateFinalPrice(unitPrice, discount) * quantity),
      },
    };
  }

  async removeItem(
    userId: string,
    cartItemId: string,
  ): Promise<{ success: true; message: string }> {
    const item = await this.findUserCartItem(userId, cartItemId);
    await this.itemRepo.delete(item.id);
    return { success: true, message: 'Product removed from cart.' };
  }

  async clearCart(userId: string): Promise<{ success: true; message: string }> {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (cart) await this.itemRepo.delete({ cartId: cart.id });
    return { success: true, message: 'Cart cleared successfully.' };
  }

  async buildCartSummary(
    userId: string,
    language: string,
    strict: boolean,
  ): Promise<CartSummary> {
    const cart = await this.cartRepo.findOne({
      where: { userId },
      relations: [
        'items',
        'items.product',
        'items.product.seller',
        'items.product.images',
        'items.variant',
      ],
      order: {
        items: { createdAt: 'ASC' },
      },
    });

    if (!cart) {
      return {
        cartId: null,
        sellerGroups: [],
        productsSubtotal: 0,
        currency: null,
        totalCount: 0,
      };
    }

    const groups = new Map<string, CartSellerGroup>();
    let productsSubtotal = 0;
    let currency: string | null = null;
    let totalCount = 0;

    for (const item of cart.items || []) {
      if (strict) {
        await this.validatePurchasable(
          userId,
          item.productId,
          item.variantId,
          toNumber(item.quantity),
        );
      }

      const line = this.serializeCartItem(item, language);
      const sellerId = item.product.sellerId;
      const existingGroup = groups.get(sellerId);
      const group =
        existingGroup ||
        ({
          sellerId,
          storeName: item.product.seller.storeName || item.product.seller.companyName,
          items: [],
          itemsCount: 0,
          productsSubtotal: 0,
        } satisfies CartSellerGroup);

      group.items.push(line);
      group.itemsCount += 1;
      group.productsSubtotal = roundMoney(group.productsSubtotal + line.subtotal);
      groups.set(sellerId, group);

      productsSubtotal = roundMoney(productsSubtotal + line.subtotal);
      totalCount += 1;

      if (!currency) currency = line.currency;
      if (currency && currency !== line.currency && strict) {
        throw createError.badRequest('All cart items must use one checkout currency');
      }
    }

    return {
      cartId: cart.id,
      sellerGroups: Array.from(groups.values()),
      productsSubtotal,
      currency,
      totalCount,
    };
  }

  private async getOrCreateCart(userId: string): Promise<Cart> {
    const existing = await this.cartRepo.findOne({ where: { userId } });
    if (existing) return existing;
    return this.cartRepo.save(this.cartRepo.create({ userId }));
  }

  private async findExistingItem(
    cartId: string,
    productId: string,
    variantId: string | null,
  ): Promise<CartItem | null> {
    return this.itemRepo.findOne({
      where: {
        cartId,
        productId,
        variantId: variantId ? variantId : IsNull(),
      },
    });
  }

  private async findUserCartItem(userId: string, cartItemId: string): Promise<CartItem> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .innerJoin('item.cart', 'cart')
      .where('item.id = :cartItemId', { cartItemId })
      .andWhere('cart.userId = :userId', { userId })
      .getOne();

    if (!item) throw createError.notFound('Cart item not found');
    return item;
  }

  private async validatePurchasable(
    buyerId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
  ): Promise<{
    product: Product;
    variant: ProductVariant | null;
    unitPrice: number;
    discount: number | null;
    availableQuantity: number;
  }> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['seller', 'variants'],
    });

    if (!product || product.status !== ProductStatus.ACTIVE || product.deletedAt) {
      throw createError.badRequest('Product is not available for purchase');
    }

    if (product.inventoryStatus !== InventoryStatus.IN_STOCK) {
      throw createError.badRequest('Product is out of stock');
    }

    if (
      product.seller.status !== UserStatus.ACTIVE ||
      !product.seller.isCompanyVerified
    ) {
      throw createError.badRequest('Seller is not eligible to receive orders');
    }

    if (product.sellerId === buyerId) {
      throw createError.badRequest('You cannot purchase your own product');
    }

    if (quantity < toNumber(product.minOrdersAllowed)) {
      throw createError.badRequest('Quantity is below the minimum order quantity');
    }

    if (product.productType === ProductType.SIMPLE) {
      if (variantId) {
        throw createError.badRequest('Simple products cannot be added with a variant');
      }

      const availableQuantity = toNumber(product.quantity);
      if (quantity > availableQuantity) {
        throw createError.badRequest('Requested quantity exceeds available stock');
      }

      return {
        product,
        variant: null,
        unitPrice: toNumber(product.price),
        discount: product.discount === null ? null : toNumber(product.discount),
        availableQuantity,
      };
    }

    if (!variantId) {
      throw createError.badRequest('A valid variant is required for variable products');
    }

    const variant =
      product.variants.find((item) => item.id === variantId) ||
      (await this.variantRepo.findOne({ where: { id: variantId, productId } }));
    if (!variant) throw createError.badRequest('Variant does not belong to product');

    const availableQuantity = toNumber(variant.quantity);
    if (quantity > availableQuantity) {
      throw createError.badRequest('Requested quantity exceeds available stock');
    }

    return {
      product,
      variant,
      unitPrice: toNumber(variant.price),
      discount: variant.discount === null ? null : toNumber(variant.discount),
      availableQuantity,
    };
  }

  private serializeCartItem(item: CartItem, language: string): CartLineItem {
    const product = item.product;
    const variant = item.variant;
    const unitPrice =
      product.productType === ProductType.SIMPLE
        ? toNumber(product.price)
        : toNumber(variant?.price);
    const discount =
      product.productType === ProductType.SIMPLE
        ? product.discount === null
          ? null
          : toNumber(product.discount)
        : variant?.discount === null || variant?.discount === undefined
          ? null
          : toNumber(variant.discount);
    const finalUnitPrice = calculateFinalPrice(unitPrice, discount);
    const quantity = toNumber(item.quantity);
    const primaryImage = (product.images || []).find((image) => image.isPrimary);
    const fallbackImage = (product.images || [])[0];
    const packageWeight = variant?.weight ?? product.weight ?? null;
    const packageLength = variant?.length ?? product.length ?? null;
    const packageWidth = variant?.width ?? product.width ?? null;
    const packageHeight = variant?.height ?? product.height ?? null;

    return {
      cartItemId: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: resolveTranslation(product.productName, language),
      mainImage: variant?.image || primaryImage?.url || fallbackImage?.url || null,
      sku: variant?.sku || product.barcode || null,
      attributes: variant?.attributes || null,
      unitPrice,
      discount,
      finalUnitPrice,
      quantity,
      subtotal: roundMoney(finalUnitPrice * quantity),
      currency: product.currency,
      minimumOrder: {
        quantity: toNumber(product.minOrdersAllowed),
        unit: product.unitForMinOrder,
      },
      availableQuantity:
        product.productType === ProductType.SIMPLE
          ? toNumber(product.quantity)
          : toNumber(variant?.quantity),
      logistics: {
        weight: packageWeight === null ? null : toNumber(packageWeight),
        weightUnit: variant?.weightUnit ?? product.weightUnit,
        length: packageLength === null ? null : toNumber(packageLength),
        width: packageWidth === null ? null : toNumber(packageWidth),
        height: packageHeight === null ? null : toNumber(packageHeight),
        dimensionUnit: variant?.dimensionUnit ?? product.dimensionUnit,
      },
    };
  }
}
