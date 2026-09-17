import { z } from 'zod';

export const LanguageCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[a-z]{2,8}([_-][a-z0-9]{2,8})?$/i, 'Invalid language code')
  .transform((value) => value.toLowerCase().replace(/_/g, '-'));

export const SupportedLanguageSchema = LanguageCodeSchema;

const PasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    'Password must contain uppercase, lowercase, number and special character',
  );

// ─── Auth ──────────────────────────────────────────────────────────────────────

export const SignupSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  email: z.string().email().toLowerCase().trim(),
  password: PasswordSchema,
  referralCode: z.string().trim().min(1).max(50).optional(),
  termsOfUse: z.literal(true, {
    errorMap: () => ({ message: 'Terms of Use must be accepted' }),
  }),
  phoneNumber: z.string().min(7).max(30).trim().optional(),
  phone: z.string().min(7).max(20).optional(),
  selectedLanguage: SupportedLanguageSchema.optional(),
});

export const RegisterSchema = SignupSchema;

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export const GoogleAuthSchema = z.object({
  googleToken: z.string().min(1),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const UpdateTermsSchema = z.object({
  termsOfUse: z.literal(true, {
    errorMap: () => ({ message: 'Terms of Use must be accepted' }),
  }),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const ResetPasswordSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits').optional(),
  token: z.string().min(1).optional(),
  password: PasswordSchema,
}).refine((value) => value.otp || value.token, {
  message: 'OTP is required',
  path: ['otp'],
});

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: PasswordSchema,
}).refine((value) => value.oldPassword || value.currentPassword, {
  message: 'Old password is required',
  path: ['oldPassword'],
});

// ─── Shared primitives ────────────────────────────────────────────────────────

export const TranslationInputSchema = z.union([
  z.string().min(1).max(2000).trim(),
  z
    .record(LanguageCodeSchema, z.string().min(1).max(2000).trim())
    .refine((value) => Object.keys(value).length > 0, 'At least one translation is required'),
]);

const ProductTypeInputSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.toLowerCase() : value),
  z.enum(['simple', 'variable']),
);

const NullablePositiveMoneySchema = z
  .preprocess((value) => (value === '' ? null : value), z.coerce.number().positive().nullable())
  .optional();

const NullableDiscountSchema = z
  .preprocess((value) => (value === '' ? null : value), z.coerce.number().gt(0).lt(100).nullable())
  .optional();

const NullableQuantitySchema = z
  .preprocess((value) => (value === '' ? null : value), z.coerce.number().min(0).nullable())
  .optional();

const NullablePositiveMeasureSchema = z
  .preprocess((value) => (value === '' ? null : value), z.coerce.number().positive().nullable())
  .optional();

const NullableShortUnitSchema = z.string().min(1).max(20).trim().optional().nullable();

const BooleanInputSchema = z.preprocess((value) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}, z.boolean());

const CsvStringArraySchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}, z.array(z.string().min(1)));

const UuidListQuerySchema = CsvStringArraySchema.pipe(
  z.array(z.string().uuid()).min(1).max(20),
);

// ─── Seller upgrade (multipart — field values come as strings) ─────────────────

export const UpgradeToSellerSchema = z.object({
  storeName: z.string().min(2).max(255).trim(),
  companyName: z.string().min(2).max(255).trim(),
  registrationNumber: z.string().max(100).trim().optional(),
  businessType: z.string().min(1).max(100).trim(),
  yearsOfBusiness: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0).max(200)),
  companyAddress: z.string().min(5).max(500).trim(),
  pickupAddress: z.string().min(5).max(500).trim(),
  companyBio: z.string().max(2000).trim().optional(),
  country: z.string().min(2).max(100).trim(),
});

// ─── Users ────────────────────────────────────────────────────────────────────

export const UserProfileUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  phoneNumber: z.string().min(7).max(30).trim().optional(),
  selectedLanguage: SupportedLanguageSchema.optional(),
  deliveryAddress: z.string().min(3).max(500).trim().optional(),
  companyBio: z.string().max(2000).trim().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const UserSelfStatusUpdateSchema = z.object({
  status: z.enum(['delete', 'deleted']),
  reason: z.string().min(3).max(1000).trim().optional(),
});

// ─── Admin ────────────────────────────────────────────────────────────────────

export const CreateAdminSchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  phoneNumber: z.string().min(7).max(30).trim().optional(),
  email: z.string().email().toLowerCase().trim(),
  roleId: z.string().uuid().optional().nullable(),
});

export const AdminLoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export const CompleteAdminSetupSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema,
});

const AdminProfileFieldsSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  phoneNumber: z.string().min(7).max(30).trim().optional().nullable(),
});

export const AdminProfileUpdateSchema = AdminProfileFieldsSchema.refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const UpdateAdminSchema = AdminProfileFieldsSchema.extend({
  roleId: z.string().uuid().optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const AdminChangePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: PasswordSchema,
});

export const AdminForgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const AdminResetPasswordSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  password: PasswordSchema,
});

export const AdminRoleCreateSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  description: z.string().max(1000).trim().optional().nullable(),
  permissionIds: z.array(z.string().uuid()).max(200).default([]),
});

export const AdminRoleUpdateSchema = z.object({
  name: z.string().min(2).max(120).trim().optional(),
  description: z.string().max(1000).trim().optional().nullable(),
  permissionIds: z.array(z.string().uuid()).max(200).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const AdminRoleStatusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

export const RolePermissionAssignmentSchema = z.object({
  permissionIds: z.array(z.string().uuid()).max(200),
});

export const AdminDisableUserSchema = z.object({
  reason: z.string().min(3).max(1000).trim().optional(),
});

export const DeactivateAdminSchema = z.object({
  reason: z.string().min(3).max(1000).trim().optional(),
});

export const AdminUserStatusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive', 'disabled', 'deleted']),
  reason: z.string().min(3).max(1000).trim().optional(),
});

export const ApproveSellerSchema = z.object({
  notes: z.string().max(1000).trim().optional(),
});

export const RejectSellerSchema = z.object({
  reason: z.string().min(10).max(1000).trim(),
});

export const PaginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => parseInt(v || '1', 10))
    .pipe(z.number().int().min(1).default(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => parseInt(v || '20', 10))
    .pipe(z.number().int().min(1).max(100).default(20)),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

// ─── Categories ───────────────────────────────────────────────────────────────

export const CategoryCreateSchema = z.object({
  name: TranslationInputSchema,
  description: TranslationInputSchema.optional().nullable(),
  sourceLanguage: LanguageCodeSchema.optional(),
  parentId: z.string().uuid().optional().nullable(),
  icon: z.string().min(1).max(100).trim().optional().nullable(),
  image: z.string().url().max(500).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const CategoryUpdateSchema = CategoryCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
);

export const CategoryStatusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive', 'archived', 'deleted']),
  reason: z.string().min(3).max(1000).trim().optional(),
});

export const CategoryQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
  search: z.string().min(1).max(120).trim().optional(),
  lang: LanguageCodeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'archived', 'deleted']).optional(),
});

// ─── Products ─────────────────────────────────────────────────────────────────

export const ProductVariantOptionInputSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  values: z.array(z.string().min(1).max(80).trim()).min(1).max(20),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const ProductVariantInputSchema = z.object({
  attributes: z.record(z.string().min(1).max(80).trim()),
  price: z.coerce.number().positive(),
  discount: NullableDiscountSchema,
  quantity: z.coerce.number().min(0),
  weight: NullablePositiveMeasureSchema,
  weightUnit: NullableShortUnitSchema,
  length: NullablePositiveMeasureSchema,
  width: NullablePositiveMeasureSchema,
  height: NullablePositiveMeasureSchema,
  dimensionUnit: NullableShortUnitSchema,
  image: z.string().url().max(500).optional().nullable(),
});

export const ProductImageInputSchema = z.object({
  url: z.string().url().max(500),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isPrimary: z.coerce.boolean().default(false),
});

export const ProductCreateSchema = z.object({
  productName: TranslationInputSchema,
  productDescription: TranslationInputSchema,
  sourceLanguage: LanguageCodeSchema.optional(),
  categoryIds: z.array(z.string().uuid()).min(1).max(5),
  countryOfOrigin: z.string().min(2).max(100).trim(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()),
  productType: ProductTypeInputSchema,
  price: NullablePositiveMoneySchema,
  discount: NullableDiscountSchema,
  quantity: NullableQuantitySchema,
  weight: NullablePositiveMeasureSchema,
  weightUnit: NullableShortUnitSchema,
  length: NullablePositiveMeasureSchema,
  width: NullablePositiveMeasureSchema,
  height: NullablePositiveMeasureSchema,
  dimensionUnit: NullableShortUnitSchema,
  barcode: z.string().max(100).trim().optional().nullable(),
  supplyCapacity: z.coerce.number().positive(),
  unitForSupplyCapacity: z.string().min(1).max(40).trim(),
  minOrdersAllowed: z.coerce.number().positive(),
  unitForMinOrder: z.string().min(1).max(40).trim(),
  minDuration: z.coerce.number().int().min(0),
  maxDuration: z.coerce.number().int().min(0),
  durationUnit: z.string().min(1).max(40).trim(),
  images: z.array(ProductImageInputSchema).max(20).default([]),
  variantOptions: z.array(ProductVariantOptionInputSchema).max(3).default([]),
  variants: z.array(ProductVariantInputSchema).default([]),
});

export const ProductUpdateSchema = ProductCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
);

export const ProductStatusUpdateSchema = z.object({
  status: z.enum(['draft', 'active', 'inactive', 'archived', 'deleted']),
});

export const ProductInventoryUpdateSchema = z.object({
  quantity: z.coerce.number().min(0).optional(),
  variants: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.coerce.number().min(0),
      }),
    )
    .optional(),
});

export const ProductQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['draft', 'active', 'inactive', 'archived', 'deleted']).optional(),
    categoryId: z.string().uuid().optional(),
    categoryIds: UuidListQuerySchema.optional(),
    sellerId: z.string().uuid().optional(),
    countryOfOrigin: z.string().min(2).max(100).trim().optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    currency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    inventoryStatus: z.enum(['in_stock', 'out_of_stock']).optional(),
    hasDiscount: BooleanInputSchema.optional(),
    sortBy: z
      .enum([
        'relevance',
        'ranking',
        'newest',
        'price_low_to_high',
        'price_high_to_low',
        'highest_rating',
        'most_reviewed',
      ])
      .optional(),
    search: z.string().min(1).max(120).trim().optional(),
    lang: LanguageCodeSchema.optional(),
  })
  .refine((value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, {
    message: 'minPrice must be less than or equal to maxPrice',
    path: ['minPrice'],
  })
  .refine((value) => (value.minPrice === undefined && value.maxPrice === undefined) || Boolean(value.currency), {
    message: 'currency is required when filtering by price range',
    path: ['currency'],
  });

// ─── Addresses ────────────────────────────────────────────────────────────────

export const AddressCreateSchema = z.object({
  label: z.string().min(1).max(80).trim(),
  recipientName: z.string().min(2).max(160).trim(),
  phoneNumber: z.string().min(7).max(30).trim(),
  addressLine1: z.string().min(3).max(255).trim(),
  addressLine2: z.string().max(255).trim().optional().nullable(),
  city: z.string().min(1).max(100).trim(),
  state: z.string().min(1).max(100).trim(),
  country: z.string().min(2).max(100).trim(),
  postalCode: z.string().max(20).trim().optional().nullable(),
  isDefault: z.coerce.boolean().default(false),
});

// ─── Cart / Checkout ─────────────────────────────────────────────────────────

export const CartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive(),
});

export const CartItemUpdateSchema = z.object({
  quantity: z.coerce.number().positive(),
});

export const CheckoutAddressSchema = z.object({
  deliveryAddressId: z.string().uuid(),
});

export const DeliveryOptionsSchema = z.object({
  deliveryAddressId: z.string().uuid(),
});

export const ApplyDeliveryProviderSchema = z.object({
  providerId: z.string().min(1).max(80).trim(),
  applyTo: z.enum(['eligible_seller_groups']).default('eligible_seller_groups'),
});

export const DeliverySelectionSchema = z.object({
  sellerSelections: z.array(
    z.object({
      sellerId: z.string().uuid(),
      type: z.enum(['integrated_logistics', 'seller_arranged', 'buyer_arranged']),
      quoteId: z.string().min(1).max(120).nullable(),
    }),
  ).min(1),
});

export const PaymentMethodSchema = z.object({
  paymentMethod: z.enum([
    'direct_bank_transfer',
    'paystack',
    'flutterwave',
    'papss',
    'transactworld',
    'telegraphic_transfer',
    'letter_of_credit',
  ]),
});

export const PaymentSourceSchema = z.object({
  sourceType: z.string().min(1).max(80).trim(),
  sourceId: z.string().min(1).max(80).trim(),
});

export const CreatePaymentSchema = PaymentSourceSchema.extend({
  paymentMethod: z.enum([
    'direct_bank_transfer',
    'paystack',
    'flutterwave',
    'papss',
    'transactworld',
    'telegraphic_transfer',
    'letter_of_credit',
  ]),
});

export const PaymentMethodsQuerySchema = PaymentSourceSchema;

export const PaymentProofFieldsSchema = z.object({
  transactionReference: z.string().min(1).max(160).trim().optional(),
  notes: z.string().max(1000).trim().optional(),
});

export const PaymentQuerySchema = z.object({
  sourceType: z.string().min(1).max(80).trim().optional(),
  purpose: z.string().min(1).max(80).trim().optional(),
  status: z.enum([
    'pending',
    'awaiting_payment',
    'processing',
    'proof_uploaded',
    'under_review',
    'confirmed',
    'failed',
    'rejected',
    'expired',
    'cancelled',
  ]).optional(),
  paymentMethod: z.string().min(1).max(80).trim().optional(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
  search: z.string().min(1).max(120).trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const CancelPaymentSchema = z.object({
  reason: z.string().min(3).max(1000).trim().optional(),
});

export const AdminPaymentConfirmSchema = z.object({
  notes: z.string().max(1000).trim().optional(),
  receivedAmount: z.coerce.number().positive().optional(),
  receivedCurrency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
});

export const AdminPaymentRejectSchema = z.object({
  reason: z.string().min(10).max(1000).trim(),
  allowResubmission: z.coerce.boolean().default(true),
});

export const PaymentWebhookSchema = z.object({
  providerReference: z.string().min(1).max(160),
  paymentReference: z.string().min(1).max(40).optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()),
  status: z.enum(['success', 'confirmed', 'failed']),
  failureReason: z.string().max(1000).optional(),
  eventId: z.string().max(160).optional(),
});

export const OrderQuerySchema = z.object({
  type: z.enum(['incoming', 'outgoing']).optional(),
  status: z.enum([
    'paid',
    'processing',
    'ready_for_shipment',
    'shipped',
    'delivered',
    'received',
    'completed',
    'cancelled',
  ]).optional(),
  sourceType: z.enum(['cart', 'direct_rfq', 'market_rfq']).optional(),
  search: z.string().min(1).max(120).trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const OrderStatusUpdateSchema = z.object({
  status: z.enum([
    'processing',
    'ready_for_shipment',
    'delivered',
    'completed',
    'cancelled',
  ]),
  notes: z.string().max(1000).trim().optional(),
  reason: z.string().min(3).max(1000).trim().optional(),
});

export const OrderShipSchema = z.object({
  providerName: z.string().min(1).max(160).trim().nullable().optional(),
  trackingId: z.string().min(1).max(160).trim().nullable().optional(),
  trackingUrl: z.string().url().max(500).nullable().optional(),
  deliveryContact: z.string().min(5).max(160).trim().nullable().optional(),
  estimatedDelivery: z.object({}).passthrough().nullable().optional(),
  handoverTo: z.string().min(1).max(160).trim().optional(),
  handoverReference: z.string().min(1).max(160).trim().nullable().optional(),
  notes: z.string().max(1000).trim().optional(),
});

export const BuyerLogisticsSchema = z.object({
  providerName: z.string().min(1).max(160).trim().nullable().optional(),
  contactName: z.string().min(1).max(160).trim(),
  phoneNumber: z.string().min(5).max(160).trim(),
  email: z.string().email().max(255).nullable().optional(),
  trackingReference: z.string().min(1).max(160).trim().nullable().optional(),
  expectedPickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).trim().optional(),
});

export const ConfirmReceiptSchema = z.object({
  notes: z.string().max(1000).trim().optional(),
});

export const OrderCancellationRequestSchema = z.object({
  reason: z.string().min(3).max(500).trim(),
  notes: z.string().max(1000).trim().optional(),
});

export const AdminOrderCancellationReviewSchema = z.object({
  notes: z.string().max(1000).trim().optional(),
});

// ─── Dispute Management ─────────────────────────────────────────────────────

const DisputeStatusSchema = z.enum([
  'open',
  'under_review',
  'awaiting_buyer',
  'awaiting_seller',
  'resolved',
  'closed',
]);

const DisputeRaisedByTypeSchema = z.enum(['buyer', 'seller']);

const DisputeResolutionTypeSchema = z.enum([
  'buyer_favour',
  'seller_favour',
  'partial_resolution',
  'mutual_resolution',
  'no_action',
]);

const DisputeEvidenceReferenceSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { fileId: value } : value),
  z.object({
    fileId: z.string().uuid(),
    description: z.string().max(500).trim().optional().nullable(),
  }),
);

const DisputedItemInputSchema = z.object({
  orderItemId: z.string().uuid(),
  quantityAffected: z.coerce.number().positive(),
});

export const CreateDisputeSchema = z.object({
  returnId: z.string().uuid().optional(),
  sellerOrderId: z.string().uuid(),
  reason: z.string().min(3).max(160).trim(),
  description: z.string().min(10).max(5000).trim(),
  disputedItems: z.array(DisputedItemInputSchema).max(100).default([]),
  evidence: z.array(DisputeEvidenceReferenceSchema).max(10).default([]),
});

export const DisputeMessageSchema = z.object({
  message: z.string().min(1).max(5000).trim(),
  attachments: z.array(DisputeEvidenceReferenceSchema).max(10).default([]),
});

export const DisputeQuerySchema = z.object({
  status: DisputeStatusSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminDisputeQuerySchema = DisputeQuerySchema.extend({
  search: z.string().min(1).max(120).trim().optional(),
  reason: z.string().min(1).max(160).trim().optional(),
  raisedByType: DisputeRaisedByTypeSchema.optional(),
  buyerId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  assignedAdminId: z.string().uuid().optional(),
});

export const AssignDisputeSchema = z.object({
  adminId: z.string().uuid(),
});

export const AdminDisputeStatusUpdateSchema = z.object({
  status: z.literal('under_review'),
  notes: z.string().max(1000).trim().optional(),
});

export const RequestDisputeInformationSchema = z.object({
  from: z.enum(['buyer', 'seller']),
  message: z.string().min(1).max(5000).trim(),
});

const DisputeFinancialActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('none'),
  }),
  z.object({
    type: z.literal('refund'),
    amount: z.coerce.number().positive(),
    currency: z.string().length(3).trim().transform((value) => value.toUpperCase()),
  }),
  z.object({
    type: z.literal('partial_refund'),
    amount: z.coerce.number().positive(),
    currency: z.string().length(3).trim().transform((value) => value.toUpperCase()),
  }),
]);

export const ResolveDisputeSchema = z.object({
  resolutionType: DisputeResolutionTypeSchema,
  resolutionNotes: z.string().min(10).max(5000).trim(),
  financialAction: DisputeFinancialActionSchema.default({ type: 'none' }),
});

export const CloseDisputeSchema = z.object({
  notes: z.string().max(1000).trim().optional(),
});

// ─── Logistics / Delivery Management ──────────────────────────────────────────

const LogisticsAddressSnapshotSchema = z
  .object({
    recipientName: z.string().min(1).max(160).trim().optional(),
    phoneNumber: z.string().min(5).max(160).trim().optional(),
    addressLine1: z.string().min(3).max(255).trim().optional(),
    addressLine2: z.string().max(255).trim().optional().nullable(),
    city: z.string().min(1).max(100).trim().optional(),
    state: z.string().min(1).max(100).trim().optional(),
    country: z.string().min(2).max(100).trim(),
    postalCode: z.string().max(20).trim().optional().nullable(),
  })
  .passthrough();

export const LogisticsQuoteRequestSchema = z.object({
  sellerId: z.string().uuid(),
  deliveryAddressId: z.string().uuid(),
  items: z.array(CartItemSchema).min(1).max(100),
});

export const CreateShipmentSchema = z.object({
  notes: z.string().max(1000).trim().optional(),
});

export const CancelShipmentSchema = z.object({
  reason: z.string().max(500).trim().optional(),
});

export const LogisticsWebhookSchema = z.object({
  providerEventId: z.string().min(1).max(160).trim().optional(),
  eventId: z.string().min(1).max(160).trim().optional(),
  externalShipmentId: z.string().min(1).max(160).trim().optional(),
  trackingId: z.string().min(1).max(160).trim().optional(),
  shipmentReference: z.string().min(1).max(60).trim().optional(),
  status: z.enum([
    'pending',
    'shipment_created',
    'created',
    'awaiting_pickup',
    'ready_for_pickup',
    'picked_up',
    'pickup',
    'in_transit',
    'transit',
    'out_for_delivery',
    'delivered',
    'failed',
    'delivery_failed',
    'cancelled',
    'canceled',
  ]),
  description: z.string().max(255).trim().optional(),
  location: z.string().max(160).trim().optional(),
  failureReason: z.string().max(1000).trim().optional(),
  occurredAt: z.coerce.date().optional(),
});

export const LogisticsProviderStatusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

export const LogisticsShipmentQuerySchema = z.object({
  status: z.enum([
    'pending',
    'shipment_created',
    'awaiting_pickup',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'delivery_failed',
    'cancelled',
  ]).optional(),
  providerId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  search: z.string().min(1).max(120).trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const B2BLogisticsRequestSchema = z.object({
  sourceType: z.enum(['direct_rfq', 'market_rfq', 'other']).default('other'),
  sourceId: z.string().min(1).max(120).trim().optional().nullable(),
  cargoType: z.string().min(2).max(120).trim(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(40).trim(),
  weight: NullablePositiveMeasureSchema,
  weightUnit: NullableShortUnitSchema,
  volume: NullablePositiveMeasureSchema,
  volumeUnit: NullableShortUnitSchema,
  pickupAddress: LogisticsAddressSnapshotSchema,
  deliveryAddress: LogisticsAddressSnapshotSchema,
  specialInstructions: z.string().max(2000).trim().optional().nullable(),
});

// ─── Direct RFQ Management ────────────────────────────────────────────────────

export const DirectRFQCreateSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(40).trim(),
  description: TranslationInputSchema,
  sourceLanguage: LanguageCodeSchema.optional(),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  deliveryAddressId: z.string().uuid(),
  deliveryType: z.enum([
    'integrated_logistics',
    'seller_arranged',
    'buyer_arranged',
    'b2b_logistics',
  ]),
  currencyPreference: z
    .string()
    .length(3)
    .trim()
    .transform((value) => value.toUpperCase())
    .optional()
    .nullable(),
  buyerNotes: TranslationInputSchema.optional().nullable(),
});

const DirectRFQDeliveryTermsSchema = z.object({
  type: z.enum([
    'integrated_logistics',
    'seller_arranged',
    'buyer_arranged',
    'b2b_logistics',
  ]),
  logisticsAmount: NullablePositiveMoneySchema,
});

export const DirectRFQQuoteTermsSchema = z.object({
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(40).trim(),
  pricePerUnit: z.coerce.number().positive(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()),
  delivery: DirectRFQDeliveryTermsSchema,
  estimatedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  validUntil: z.coerce.date(),
  message: z.string().max(2000).trim().optional().nullable(),
});

export const DirectRFQCounterOfferSchema = DirectRFQQuoteTermsSchema;

export const DirectRFQAcceptQuoteSchema = z.object({
  quoteVersionId: z.string().uuid(),
});

export const DirectRFQRejectQuoteSchema = z.object({
  reason: z.string().min(3).max(1000).trim(),
});

export const DirectRFQCancelSchema = z.object({
  reason: z.string().min(3).max(1000).trim(),
});

export const DirectRFQQuerySchema = z.object({
  type: z.enum(['incoming', 'outgoing']).optional(),
  status: z.enum([
    'open',
    'viewed',
    'quoted',
    'negotiating',
    'accepted',
    'rejected',
    'cancelled',
    'expired',
  ]).optional(),
  search: z.string().min(1).max(120).trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  lang: LanguageCodeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminDirectRFQQuerySchema = DirectRFQQuerySchema.omit({
  type: true,
  lang: true,
}).extend({
  buyerId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  deliveryType: z.enum([
    'integrated_logistics',
    'seller_arranged',
    'buyer_arranged',
    'b2b_logistics',
  ]).optional(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
});

// ─── Market RFQ Management ────────────────────────────────────────────────────

const MarketRFQStatusSchema = z.enum([
  'open',
  'quoted',
  'negotiating',
  'awarded',
  'cancelled',
  'expired',
]);

const MarketRFQQuoteStatusSchema = z.enum([
  'active',
  'accepted',
  'rejected',
  'expired',
  'closed',
]);

const MarketRFQDeliveryTypeSchema = z.enum([
  'integrated_logistics',
  'seller_arranged',
  'buyer_arranged',
  'b2b_logistics',
]);

const MarketRFQDeliveryTermsSchema = z.object({
  type: MarketRFQDeliveryTypeSchema,
  logisticsAmount: NullablePositiveMoneySchema,
});

export const MarketRFQCreateSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  variantId: z.string().uuid().optional().nullable(),
  categoryIds: z.array(z.string().uuid()).min(1).max(5),
  requirementTitle: TranslationInputSchema,
  description: TranslationInputSchema,
  sourceLanguage: LanguageCodeSchema.optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(40).trim(),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  deliveryAddressId: z.string().uuid(),
  deliveryType: MarketRFQDeliveryTypeSchema,
  currencyPreference: z
    .string()
    .length(3)
    .trim()
    .transform((value) => value.toUpperCase())
    .optional()
    .nullable(),
  submissionDeadline: z.coerce.date(),
  buyerNotes: TranslationInputSchema.optional().nullable(),
});

export const MarketRFQQuoteTermsSchema = z.object({
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(40).trim(),
  pricePerUnit: z.coerce.number().positive(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()),
  delivery: MarketRFQDeliveryTermsSchema,
  estimatedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  validUntil: z.coerce.date(),
  message: z.string().max(2000).trim().optional().nullable(),
});

export const MarketRFQCounterOfferSchema = MarketRFQQuoteTermsSchema;

export const MarketRFQAcceptQuoteSchema = z.object({
  quoteVersionId: z.string().uuid(),
});

export const MarketRFQRejectQuoteSchema = z.object({
  reason: z.string().min(3).max(1000).trim(),
});

export const MarketRFQCancelSchema = z.object({
  reason: z.string().min(3).max(1000).trim(),
});

export const MarketRFQQuerySchema = z.object({
  status: MarketRFQStatusSchema.optional(),
  search: z.string().min(1).max(120).trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  lang: LanguageCodeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const MarketRFQAvailableQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  deliveryCountry: z.string().min(2).max(100).trim().optional(),
  deliveryType: MarketRFQDeliveryTypeSchema.optional(),
  search: z.string().min(1).max(120).trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(['ranking', 'newest', 'deadline_soonest']).default('ranking'),
  lang: LanguageCodeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const MarketRFQMyResponsesQuerySchema = z.object({
  quoteStatus: MarketRFQQuoteStatusSchema.optional(),
  rfqStatus: MarketRFQStatusSchema.optional(),
  search: z.string().min(1).max(120).trim().optional(),
  lang: LanguageCodeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const MarketRFQQuoteQuerySchema = z.object({
  status: MarketRFQQuoteStatusSchema.optional(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
  sortBy: z
    .enum(['lowest_total', 'highest_rating', 'earliest_delivery', 'latest'])
    .default('latest'),
  lang: LanguageCodeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminMarketRFQQuerySchema = MarketRFQQuerySchema.omit({
  lang: true,
}).extend({
  buyerId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  deliveryType: MarketRFQDeliveryTypeSchema.optional(),
  awardedSellerId: z.string().uuid().optional(),
});

export const CheckoutCreateSchema = z.object({
  notes: z.string().max(1000).trim().optional(),
});

// ─── Subscription Management ─────────────────────────────────────────────────

const EntitlementValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.null(),
]);

export const SubscriptionPlanPriceInputSchema = z.object({
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()),
  amount: z.coerce.number().min(0),
  billingPeriod: z.enum(['free', 'monthly', 'quarterly', 'yearly']),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const SubscriptionPlanCreateSchema = z.object({
  name: TranslationInputSchema,
  description: TranslationInputSchema.optional().nullable(),
  sourceLanguage: LanguageCodeSchema.optional(),
  audience: z.enum(['seller', 'buyer', 'all']).default('seller'),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).default('draft'),
  isFree: BooleanInputSchema.default(false),
  isDefault: BooleanInputSchema.default(false),
  displayOrder: z.coerce.number().int().min(0).default(0),
  prices: z.array(SubscriptionPlanPriceInputSchema).min(1).max(12),
  entitlements: z.record(EntitlementValueSchema).default({}),
});

export const SubscriptionPlanUpdateSchema = SubscriptionPlanCreateSchema.partial()
  .extend({
    entitlements: z.record(EntitlementValueSchema).optional(),
    prices: z.array(SubscriptionPlanPriceInputSchema).min(1).max(12).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const SubscriptionPlanStatusUpdateSchema = z.object({
  status: z.enum(['draft', 'active', 'inactive', 'archived']),
});

export const SubscriptionPlanQuerySchema = z.object({
  status: z.enum(['draft', 'active', 'inactive', 'archived']).optional(),
  audience: z.enum(['seller', 'buyer', 'all']).optional(),
  isFree: BooleanInputSchema.optional(),
  search: z.string().min(1).max(120).trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const PublicSubscriptionPlanQuerySchema = z.object({
  audience: z.enum(['seller', 'buyer', 'all']).optional(),
  isFree: BooleanInputSchema.optional(),
  lang: LanguageCodeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const SubscribeSchema = z.object({
  planId: z.string().uuid(),
  priceId: z.string().uuid().optional(),
  paymentMethod: z.enum([
    'direct_bank_transfer',
    'paystack',
    'flutterwave',
    'papss',
    'transactworld',
    'telegraphic_transfer',
    'letter_of_credit',
  ]).optional(),
});

export const RenewSubscriptionSchema = z.object({
  priceId: z.string().uuid().optional(),
  paymentMethod: z.enum([
    'direct_bank_transfer',
    'paystack',
    'flutterwave',
    'papss',
    'transactworld',
    'telegraphic_transfer',
    'letter_of_credit',
  ]).optional(),
});

export const SubscriptionAutoRenewSchema = z.object({
  autoRenew: BooleanInputSchema,
});

export const SubscriptionHistoryQuerySchema = z.object({
  status: z.enum(['pending', 'active', 'expired', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminSubscriptionQuerySchema = SubscriptionHistoryQuerySchema.extend({
  userId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
});

// ─── Reviews, Ratings & Rewards ──────────────────────────────────────────────

const ReviewRatingSchema = z.coerce.number().int().min(1).max(5);
const ReviewStatusSchema = z.enum([
  'published',
  'pending_moderation',
  'hidden',
  'rejected',
  'deleted',
]);
const ReviewEligibilityStatusSchema = z.enum([
  'eligible',
  'submitted',
  'expired',
  'revoked',
]);
const ReviewImageUrlSchema = z.string().min(1).max(500).trim();

export const ReviewEligibilityQuerySchema = z.object({
  status: ReviewEligibilityStatusSchema.optional(),
  orderId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ProductReviewCreateSchema = z.object({
  eligibilityId: z.string().uuid(),
  rating: ReviewRatingSchema,
  title: z.string().min(1).max(160).trim().optional().nullable(),
  comment: z.string().min(1).max(3000).trim(),
  images: z.array(ReviewImageUrlSchema).max(10).default([]),
});

export const ProductReviewUpdateSchema = z
  .object({
    rating: ReviewRatingSchema.optional(),
    title: z.string().min(1).max(160).trim().optional().nullable(),
    comment: z.string().min(1).max(3000).trim().optional(),
    images: z.array(ReviewImageUrlSchema).max(10).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const SellerReviewCreateSchema = z.object({
  eligibilityId: z.string().uuid(),
  overallRating: ReviewRatingSchema,
  communicationRating: ReviewRatingSchema.optional().nullable(),
  fulfillmentRating: ReviewRatingSchema.optional().nullable(),
  reliabilityRating: ReviewRatingSchema.optional().nullable(),
  comment: z.string().min(1).max(3000).trim(),
});

export const SellerReviewUpdateSchema = z
  .object({
    overallRating: ReviewRatingSchema.optional(),
    communicationRating: ReviewRatingSchema.optional().nullable(),
    fulfillmentRating: ReviewRatingSchema.optional().nullable(),
    reliabilityRating: ReviewRatingSchema.optional().nullable(),
    comment: z.string().min(1).max(3000).trim().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const BatchOrderReviewSchema = z
  .object({
    productReviews: z.array(ProductReviewCreateSchema).max(100).default([]),
    sellerReview: SellerReviewCreateSchema.optional(),
  })
  .refine((value) => value.productReviews.length > 0 || value.sellerReview, {
    message: 'At least one review is required',
  });

export const ReviewListQuerySchema = z.object({
  rating: ReviewRatingSchema.optional(),
  withImages: BooleanInputSchema.optional(),
  sortBy: z
    .enum(['latest', 'highest_rating', 'lowest_rating', 'most_helpful'])
    .default('latest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const MyReviewsQuerySchema = z.object({
  type: z.enum(['product', 'seller']).optional(),
  status: ReviewStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ReviewVoteSchema = z.object({
  vote: z.enum(['helpful', 'not_helpful']),
});

export const ReviewResponseCreateSchema = z.object({
  comment: z.string().min(1).max(1000).trim(),
});

export const ReviewResponseUpdateSchema = ReviewResponseCreateSchema;

export const ReviewModerationStatusSchema = z.object({
  status: ReviewStatusSchema.exclude(['deleted']),
  reason: z.string().min(3).max(1000).trim().optional(),
});

export const RewardSettingsUpdateSchema = z
  .object({
    productReviewPoints: z.coerce.number().int().min(0).max(100000).optional(),
    sellerReviewPoints: z.coerce.number().int().min(0).max(100000).optional(),
    reviewWithImageBonus: z.coerce.number().int().min(0).max(100000).optional(),
    minimumReviewCharacters: z.coerce.number().int().min(0).max(3000).optional(),
    maxReviewRewardPerOrder: z.coerce.number().int().min(0).max(100000).optional(),
    reviewSubmissionWindowDays: z.coerce.number().int().min(0).max(3650).optional(),
    reviewReminderDays: z.coerce.number().int().min(0).max(3650).optional(),
    maxReviewImages: z.coerce.number().int().min(0).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one setting is required',
  });

export const PointsAdjustmentSchema = z.object({
  userId: z.string().uuid(),
  points: z.coerce.number().int().refine((value) => value !== 0, {
    message: 'points cannot be zero',
  }),
  reason: z.string().min(3).max(255).trim(),
});

export const PointsHistoryQuerySchema = z.object({
  type: z.enum(['earned', 'redeemed', 'adjusted', 'expired', 'reversed']).optional(),
  sourceType: z
    .enum(['product_review', 'seller_review', 'admin_adjustment', 'referral'])
    .optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminReviewQuerySchema = MyReviewsQuerySchema.extend({
  buyerId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  rating: ReviewRatingSchema.optional(),
  search: z.string().min(1).max(120).trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

// ─── Message Center ─────────────────────────────────────────────────────────

const MessageTypeSchema = z.enum(['text', 'image', 'file', 'mixed']);
const MessageReportReasonSchema = z.enum([
  'spam',
  'abusive_content',
  'fraud_attempt',
  'payment_scam',
  'inappropriate_content',
  'off_platform_solicitation',
  'other',
]);
const MessageReportStatusSchema = z.enum([
  'pending',
  'reviewing',
  'resolved',
  'dismissed',
]);
const MessageReportActionSchema = z.enum([
  'no_action',
  'warning_issued',
  'message_hidden',
  'conversation_blocked',
  'user_restricted',
  'escalated',
]);
const ConversationStatusSchema = z.enum(['active', 'blocked']);

export const StartConversationSchema = z.object({
  recipientUserId: z.string().uuid(),
});

export const MessageAttachmentInputSchema = z.object({
  fileId: z.string().uuid(),
});

export const SendMessageSchema = z.object({
  clientMessageId: z.string().min(1).max(80).trim(),
  messageType: MessageTypeSchema,
  content: z.string().max(10000).trim().optional().nullable(),
  replyToMessageId: z.string().uuid().optional().nullable(),
  attachments: z.array(MessageAttachmentInputSchema).max(10).default([]),
});

export const ConversationQuerySchema = z.object({
  search: z.string().min(1).max(120).trim().optional(),
  unreadOnly: BooleanInputSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const MessagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const MarkConversationReadSchema = z.object({
  lastReadMessageId: z.string().uuid().optional().nullable(),
});

export const EditMessageSchema = z.object({
  content: z.string().min(1).max(10000).trim(),
});

export const ReportMessageSchema = z.object({
  reason: MessageReportReasonSchema,
  details: z.string().max(2000).trim().optional().nullable(),
});

export const AdminMessageConversationQuerySchema = z.object({
  status: ConversationStatusSchema.optional(),
  userId: z.string().uuid().optional(),
  reportedOnly: BooleanInputSchema.optional(),
  search: z.string().min(1).max(120).trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminMessageReportQuerySchema = z.object({
  status: MessageReportStatusSchema.optional(),
  reason: MessageReportReasonSchema.optional(),
  reportedUserId: z.string().uuid().optional(),
  reportedBy: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminMessageReportReviewSchema = z.object({
  status: MessageReportStatusSchema,
  action: MessageReportActionSchema.default('no_action'),
  notes: z.string().max(2000).trim().optional().nullable(),
});

export const AdminMessageConversationStatusSchema = z.object({
  status: ConversationStatusSchema,
  reason: z.string().max(1000).trim().optional().nullable(),
});

export const MessageSettingsUpdateSchema = z
  .object({
    maxMessageCharacters: z.coerce.number().int().min(1).max(10000).optional(),
    maxAttachmentsPerMessage: z.coerce.number().int().min(0).max(20).optional(),
    maxAttachmentSizeMb: z.coerce.number().int().min(1).max(100).optional(),
    allowedAttachmentTypes: z
      .array(z.string().min(1).max(20).trim().toLowerCase())
      .max(50)
      .optional(),
    messageEditWindowMinutes: z.coerce.number().int().min(0).max(10080).optional(),
    unreadEmailDelayMinutes: z.coerce.number().int().min(0).max(10080).optional(),
    messageReportingEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one setting is required',
  });

// ─── Notifications ──────────────────────────────────────────────────────────

const NotificationCategorySchema = z.enum([
  'account',
  'seller',
  'product',
  'rfq',
  'payment',
  'order',
  'logistics',
  'subscription',
  'review',
  'reward',
  'message',
  'dispute',
  'system',
  'marketing',
]);

const AnnouncementAudienceSchema = z.enum([
  'all',
  'buyers',
  'sellers',
  'admins',
  'specific_users',
]);

const AnnouncementStatusSchema = z.enum([
  'draft',
  'scheduled',
  'sent',
  'cancelled',
]);

const NotificationTranslationSchema = z.union([
  z.string().min(1).max(5000).trim(),
  z
    .record(LanguageCodeSchema, z.string().min(1).max(5000).trim())
    .refine((value) => Object.keys(value).length > 0, 'At least one translation is required'),
]);

export const NotificationQuerySchema = z.object({
  category: NotificationCategorySchema.optional(),
  isRead: BooleanInputSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const NotificationPreferenceItemSchema = z.object({
  category: NotificationCategorySchema,
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
});

export const NotificationPreferenceUpdateSchema = z.object({
  preferences: z.array(NotificationPreferenceItemSchema).min(1).max(50),
});

export const SystemAnnouncementCreateSchema = z
  .object({
    title: NotificationTranslationSchema,
    message: NotificationTranslationSchema,
    audience: AnnouncementAudienceSchema,
    userIds: z.array(z.string().uuid()).max(1000).optional(),
    actionUrl: z.string().min(1).max(500).trim().optional().nullable(),
    sendInApp: z.boolean().default(true),
    sendEmail: z.boolean().default(false),
    scheduledAt: z.coerce.date().optional().nullable(),
  })
  .refine(
    (value) =>
      value.audience !== 'specific_users' ||
      Boolean(value.userIds && value.userIds.length > 0),
    {
      message: 'userIds are required when audience is specific_users',
      path: ['userIds'],
    },
  );

export const AdminSystemAnnouncementQuerySchema = z.object({
  status: AnnouncementStatusSchema.optional(),
  audience: AnnouncementAudienceSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().min(1).max(120).trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Internationalization / Localization ────────────────────────────────────

export const LanguagePreferenceUpdateSchema = z.object({
  language: LanguageCodeSchema,
});

export const LanguageCreateSchema = z.object({
  code: LanguageCodeSchema,
  name: z.string().min(2).max(120).trim(),
  nativeName: z.string().min(1).max(120).trim(),
  direction: z.enum(['ltr', 'rtl']).default('ltr'),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const LanguageUpdateSchema = z
  .object({
    name: z.string().min(2).max(120).trim().optional(),
    nativeName: z.string().min(1).max(120).trim().optional(),
    direction: z.enum(['ltr', 'rtl']).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const LanguageStatusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

export const LanguageDefaultUpdateSchema = z.object({
  isDefault: z.literal(true),
});

export const TranslationStatusQuerySchema = z.object({
  entityType: z
    .enum([
      'product',
      'category',
      'direct_rfq',
      'market_rfq',
      'subscription_plan',
      'system_announcement',
    ])
    .optional(),
  language: LanguageCodeSchema.optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ManualTranslationUpdateSchema = z.object({
  value: z.string().min(1).max(5000).trim(),
});

// ─── Search, Discovery & Ranking ────────────────────────────────────────────

export const SellerDiscoveryQuerySchema = z.object({
  search: z.string().min(1).max(120).trim().optional(),
  country: z.string().min(2).max(100).trim().optional(),
  categoryId: z.string().uuid().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  isVerified: BooleanInputSchema.optional(),
  sortBy: z
    .enum(['ranking', 'relevance', 'highest_rating', 'most_reviewed', 'newest'])
    .default('ranking'),
  lang: LanguageCodeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const SearchSuggestionQuerySchema = z.object({
  q: z.string().min(1).max(120).trim(),
  type: z.enum(['all', 'products', 'sellers', 'categories']).default('all'),
  lang: LanguageCodeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const SearchHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const ProductDiscoveryLimitQuerySchema = z.object({
  lang: LanguageCodeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(8),
});

export const SearchEventCreateSchema = z.object({
  eventType: z.literal('result_click'),
  searchQuery: z.string().min(1).max(255).trim().optional().nullable(),
  entityType: z.enum(['product', 'seller', 'market_rfq', 'category']),
  entityId: z.string().uuid(),
  position: z.coerce.number().int().min(1),
  sessionId: z.string().min(1).max(120).trim().optional().nullable(),
  filters: z.record(z.unknown()).optional().nullable(),
});

export const FeaturePromotionSchema = z.object({
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
});

const SearchRankingSettingsSchema = z.object({
  subscriptionPriorityEnabled: z.boolean().optional(),
  ratingEnabled: z.boolean().optional(),
  freshnessEnabled: z.boolean().optional(),
  availabilityEnabled: z.boolean().optional(),
});

export const SearchSettingsUpdateSchema = z
  .object({
    outOfStockProductsVisible: z.boolean().optional(),
    searchHistoryLimit: z.coerce.number().int().min(1).max(100).optional(),
    popularSearchWindowDays: z.coerce.number().int().min(1).max(365).optional(),
    featuredBoostEnabled: z.boolean().optional(),
    ranking: SearchRankingSettingsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const SearchReindexSchema = z
  .object({
    entityType: z.enum([
      'product',
      'seller',
      'market_rfq',
      'category',
      'products',
      'sellers',
      'market_rfqs',
      'categories',
    ]),
    entityId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      ['products', 'sellers', 'market_rfqs', 'categories'].includes(value.entityType) ||
      Boolean(value.entityId),
    {
      message: 'entityId is required when reindexing a single entity',
      path: ['entityId'],
    },
  );

// ─── Analytics & Reporting ───────────────────────────────────────────────────

const AnalyticsDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

const AnalyticsDateRangeFields = {
  dateFrom: AnalyticsDateSchema.optional(),
  dateTo: AnalyticsDateSchema.optional(),
};

const AnalyticsDateRangeObjectSchema = z.object(AnalyticsDateRangeFields);

function withValidAnalyticsDateRange<T extends z.ZodTypeAny>(schema: T): T {
  return schema
    .refine(
      (value) =>
        !value.dateFrom ||
        !value.dateTo ||
        new Date(value.dateFrom) <= new Date(value.dateTo),
      {
        message: 'dateFrom must be before or equal to dateTo',
        path: ['dateFrom'],
      },
    ) as unknown as T;
}

export const AnalyticsDateRangeQuerySchema = withValidAnalyticsDateRange(
  AnalyticsDateRangeObjectSchema,
);

export const SellerSalesAnalyticsQuerySchema =
  withValidAnalyticsDateRange(z.object({
    ...AnalyticsDateRangeFields,
    groupBy: z.enum(['day', 'week', 'month']).default('month'),
    currency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
  }));

export const SellerProductAnalyticsQuerySchema =
  withValidAnalyticsDateRange(z.object({
    ...AnalyticsDateRangeFields,
    sortBy: z.enum(['views', 'orders', 'sales', 'rating', 'conversion']).default('views'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }));

export const BuyerSpendingAnalyticsQuerySchema =
  withValidAnalyticsDateRange(z.object({
    ...AnalyticsDateRangeFields,
    currency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('month'),
  }));

export const AdminAnalyticsQuerySchema = withValidAnalyticsDateRange(z.object({
  ...AnalyticsDateRangeFields,
  country: z.string().min(2).max(100).trim().optional(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
}));

export const AdminOrderAnalyticsQuerySchema = withValidAnalyticsDateRange(z.object({
  ...AnalyticsDateRangeFields,
  country: z.string().min(2).max(100).trim().optional(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
  status: z.string().min(1).max(80).trim().optional(),
  source: z.enum(['cart', 'direct_rfq', 'market_rfq']).optional(),
}));

export const AdminPaymentAnalyticsQuerySchema = withValidAnalyticsDateRange(z.object({
  ...AnalyticsDateRangeFields,
  country: z.string().min(2).max(100).trim().optional(),
  currency: z.string().length(3).trim().transform((value) => value.toUpperCase()).optional(),
  paymentMethod: z.string().min(1).max(80).trim().optional(),
  paymentFor: z.string().min(1).max(80).trim().optional(),
  status: z.string().min(1).max(80).trim().optional(),
}));

export const ReportExportSchema = z.object({
  reportType: z.string().min(3).max(80).trim(),
  format: z.enum(['csv', 'xlsx', 'pdf']),
  filters: z.record(z.unknown()).default({}),
});

export const AnalyticsRebuildSchema = z
  .object({
    entityType: z.enum([
      'seller',
      'buyer',
      'product',
      'category',
      'order',
      'payment',
      'subscription',
      'rfq',
      'marketplace',
    ]),
    entityId: z.string().uuid().optional(),
    dateFrom: AnalyticsDateSchema.optional(),
    dateTo: AnalyticsDateSchema.optional(),
  })
  .refine(
    (value) =>
      !value.dateFrom ||
      !value.dateTo ||
      new Date(value.dateFrom) <= new Date(value.dateTo),
    {
      message: 'dateFrom must be before or equal to dateTo',
      path: ['dateFrom'],
    },
  )
  .refine(
    (value) => value.entityType === 'marketplace' || Boolean(value.entityId),
    {
      message: 'entityId is required unless entityType is marketplace',
      path: ['entityId'],
    },
  );

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type SignupDto = z.infer<typeof SignupSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type GoogleAuthDto = z.infer<typeof GoogleAuthSchema>;
export type UserProfileUpdateDto = z.infer<typeof UserProfileUpdateSchema>;
export type UserSelfStatusUpdateDto = z.infer<typeof UserSelfStatusUpdateSchema>;
export type CreateAdminDto = z.infer<typeof CreateAdminSchema>;
export type AdminLoginDto = z.infer<typeof AdminLoginSchema>;
export type CompleteAdminSetupDto = z.infer<typeof CompleteAdminSetupSchema>;
export type AdminProfileUpdateDto = z.infer<typeof AdminProfileUpdateSchema>;
export type UpdateAdminDto = z.infer<typeof UpdateAdminSchema>;
export type AdminChangePasswordDto = z.infer<typeof AdminChangePasswordSchema>;
export type AdminRoleCreateDto = z.infer<typeof AdminRoleCreateSchema>;
export type AdminRoleUpdateDto = z.infer<typeof AdminRoleUpdateSchema>;
export type UpgradeToSellerDto = z.infer<typeof UpgradeToSellerSchema>;
export type ApproveSellerDto = z.infer<typeof ApproveSellerSchema>;
export type RejectSellerDto = z.infer<typeof RejectSellerSchema>;
export type CategoryCreateDto = z.infer<typeof CategoryCreateSchema>;
export type CategoryUpdateDto = z.infer<typeof CategoryUpdateSchema>;
export type ProductCreateDto = z.infer<typeof ProductCreateSchema>;
export type ProductUpdateDto = z.infer<typeof ProductUpdateSchema>;
export type AddressCreateDto = z.infer<typeof AddressCreateSchema>;
export type CartItemDto = z.infer<typeof CartItemSchema>;
export type DeliverySelectionDto = z.infer<typeof DeliverySelectionSchema>;
export type CreatePaymentDto = z.infer<typeof CreatePaymentSchema>;
export type PaymentProofFieldsDto = z.infer<typeof PaymentProofFieldsSchema>;
export type PaymentQueryDto = z.infer<typeof PaymentQuerySchema>;
export type CancelPaymentDto = z.infer<typeof CancelPaymentSchema>;
export type AdminPaymentConfirmDto = z.infer<typeof AdminPaymentConfirmSchema>;
export type AdminPaymentRejectDto = z.infer<typeof AdminPaymentRejectSchema>;
export type PaymentWebhookDto = z.infer<typeof PaymentWebhookSchema>;
export type OrderQueryDto = z.infer<typeof OrderQuerySchema>;
export type OrderStatusUpdateDto = z.infer<typeof OrderStatusUpdateSchema>;
export type OrderShipDto = z.infer<typeof OrderShipSchema>;
export type BuyerLogisticsDto = z.infer<typeof BuyerLogisticsSchema>;
export type ConfirmReceiptDto = z.infer<typeof ConfirmReceiptSchema>;
export type OrderCancellationRequestDto = z.infer<typeof OrderCancellationRequestSchema>;
export type AdminOrderCancellationReviewDto = z.infer<typeof AdminOrderCancellationReviewSchema>;
export type CreateDisputeDto = z.infer<typeof CreateDisputeSchema>;
export type DisputeMessageDto = z.infer<typeof DisputeMessageSchema>;
export type DisputeQueryDto = z.infer<typeof DisputeQuerySchema>;
export type AdminDisputeQueryDto = z.infer<typeof AdminDisputeQuerySchema>;
export type AssignDisputeDto = z.infer<typeof AssignDisputeSchema>;
export type AdminDisputeStatusUpdateDto = z.infer<
  typeof AdminDisputeStatusUpdateSchema
>;
export type RequestDisputeInformationDto = z.infer<
  typeof RequestDisputeInformationSchema
>;
export type ResolveDisputeDto = z.infer<typeof ResolveDisputeSchema>;
export type CloseDisputeDto = z.infer<typeof CloseDisputeSchema>;
export type LogisticsQuoteRequestDto = z.infer<typeof LogisticsQuoteRequestSchema>;
export type CreateShipmentDto = z.infer<typeof CreateShipmentSchema>;
export type CancelShipmentDto = z.infer<typeof CancelShipmentSchema>;
export type LogisticsWebhookDto = z.infer<typeof LogisticsWebhookSchema>;
export type LogisticsProviderStatusUpdateDto = z.infer<
  typeof LogisticsProviderStatusUpdateSchema
>;
export type LogisticsShipmentQueryDto = z.infer<typeof LogisticsShipmentQuerySchema>;
export type B2BLogisticsRequestDto = z.infer<typeof B2BLogisticsRequestSchema>;
export type DirectRFQCreateDto = z.infer<typeof DirectRFQCreateSchema>;
export type DirectRFQQuoteTermsDto = z.infer<typeof DirectRFQQuoteTermsSchema>;
export type DirectRFQCounterOfferDto = z.infer<typeof DirectRFQCounterOfferSchema>;
export type DirectRFQAcceptQuoteDto = z.infer<typeof DirectRFQAcceptQuoteSchema>;
export type DirectRFQRejectQuoteDto = z.infer<typeof DirectRFQRejectQuoteSchema>;
export type DirectRFQCancelDto = z.infer<typeof DirectRFQCancelSchema>;
export type DirectRFQQueryDto = z.infer<typeof DirectRFQQuerySchema>;
export type AdminDirectRFQQueryDto = z.infer<typeof AdminDirectRFQQuerySchema>;
export type MarketRFQCreateDto = z.infer<typeof MarketRFQCreateSchema>;
export type MarketRFQQuoteTermsDto = z.infer<typeof MarketRFQQuoteTermsSchema>;
export type MarketRFQCounterOfferDto = z.infer<typeof MarketRFQCounterOfferSchema>;
export type MarketRFQAcceptQuoteDto = z.infer<typeof MarketRFQAcceptQuoteSchema>;
export type MarketRFQRejectQuoteDto = z.infer<typeof MarketRFQRejectQuoteSchema>;
export type MarketRFQCancelDto = z.infer<typeof MarketRFQCancelSchema>;
export type MarketRFQQueryDto = z.infer<typeof MarketRFQQuerySchema>;
export type MarketRFQAvailableQueryDto = z.infer<typeof MarketRFQAvailableQuerySchema>;
export type MarketRFQMyResponsesQueryDto = z.infer<
  typeof MarketRFQMyResponsesQuerySchema
>;
export type MarketRFQQuoteQueryDto = z.infer<typeof MarketRFQQuoteQuerySchema>;
export type AdminMarketRFQQueryDto = z.infer<typeof AdminMarketRFQQuerySchema>;
export type SubscriptionPlanCreateDto = z.infer<typeof SubscriptionPlanCreateSchema>;
export type SubscriptionPlanUpdateDto = z.infer<typeof SubscriptionPlanUpdateSchema>;
export type SubscriptionPlanStatusUpdateDto = z.infer<
  typeof SubscriptionPlanStatusUpdateSchema
>;
export type SubscriptionPlanQueryDto = z.infer<typeof SubscriptionPlanQuerySchema>;
export type PublicSubscriptionPlanQueryDto = z.infer<
  typeof PublicSubscriptionPlanQuerySchema
>;
export type SubscribeDto = z.infer<typeof SubscribeSchema>;
export type RenewSubscriptionDto = z.infer<typeof RenewSubscriptionSchema>;
export type SubscriptionAutoRenewDto = z.infer<typeof SubscriptionAutoRenewSchema>;
export type SubscriptionHistoryQueryDto = z.infer<typeof SubscriptionHistoryQuerySchema>;
export type AdminSubscriptionQueryDto = z.infer<typeof AdminSubscriptionQuerySchema>;
export type ReviewEligibilityQueryDto = z.infer<typeof ReviewEligibilityQuerySchema>;
export type ProductReviewCreateDto = z.infer<typeof ProductReviewCreateSchema>;
export type ProductReviewUpdateDto = z.infer<typeof ProductReviewUpdateSchema>;
export type SellerReviewCreateDto = z.infer<typeof SellerReviewCreateSchema>;
export type SellerReviewUpdateDto = z.infer<typeof SellerReviewUpdateSchema>;
export type BatchOrderReviewDto = z.infer<typeof BatchOrderReviewSchema>;
export type ReviewListQueryDto = z.infer<typeof ReviewListQuerySchema>;
export type MyReviewsQueryDto = z.infer<typeof MyReviewsQuerySchema>;
export type ReviewVoteDto = z.infer<typeof ReviewVoteSchema>;
export type ReviewResponseCreateDto = z.infer<typeof ReviewResponseCreateSchema>;
export type ReviewResponseUpdateDto = z.infer<typeof ReviewResponseUpdateSchema>;
export type ReviewModerationStatusDto = z.infer<typeof ReviewModerationStatusSchema>;
export type RewardSettingsUpdateDto = z.infer<typeof RewardSettingsUpdateSchema>;
export type PointsAdjustmentDto = z.infer<typeof PointsAdjustmentSchema>;
export type PointsHistoryQueryDto = z.infer<typeof PointsHistoryQuerySchema>;
export type AdminReviewQueryDto = z.infer<typeof AdminReviewQuerySchema>;
export type StartConversationDto = z.infer<typeof StartConversationSchema>;
export type MessageAttachmentInputDto = z.infer<typeof MessageAttachmentInputSchema>;
export type SendMessageDto = z.infer<typeof SendMessageSchema>;
export type ConversationQueryDto = z.infer<typeof ConversationQuerySchema>;
export type MessagesQueryDto = z.infer<typeof MessagesQuerySchema>;
export type MarkConversationReadDto = z.infer<typeof MarkConversationReadSchema>;
export type EditMessageDto = z.infer<typeof EditMessageSchema>;
export type ReportMessageDto = z.infer<typeof ReportMessageSchema>;
export type AdminMessageConversationQueryDto = z.infer<
  typeof AdminMessageConversationQuerySchema
>;
export type AdminMessageReportQueryDto = z.infer<
  typeof AdminMessageReportQuerySchema
>;
export type AdminMessageReportReviewDto = z.infer<
  typeof AdminMessageReportReviewSchema
>;
export type AdminMessageConversationStatusDto = z.infer<
  typeof AdminMessageConversationStatusSchema
>;
export type MessageSettingsUpdateDto = z.infer<typeof MessageSettingsUpdateSchema>;
export type NotificationQueryDto = z.infer<typeof NotificationQuerySchema>;
export type NotificationPreferenceItemDto = z.infer<
  typeof NotificationPreferenceItemSchema
>;
export type NotificationPreferenceUpdateDto = z.infer<
  typeof NotificationPreferenceUpdateSchema
>;
export type SystemAnnouncementCreateDto = z.infer<
  typeof SystemAnnouncementCreateSchema
>;
export type AdminSystemAnnouncementQueryDto = z.infer<
  typeof AdminSystemAnnouncementQuerySchema
>;
export type LanguagePreferenceUpdateDto = z.infer<
  typeof LanguagePreferenceUpdateSchema
>;
export type LanguageCreateDto = z.infer<typeof LanguageCreateSchema>;
export type LanguageUpdateDto = z.infer<typeof LanguageUpdateSchema>;
export type LanguageStatusUpdateDto = z.infer<typeof LanguageStatusUpdateSchema>;
export type LanguageDefaultUpdateDto = z.infer<typeof LanguageDefaultUpdateSchema>;
export type TranslationStatusQueryDto = z.infer<typeof TranslationStatusQuerySchema>;
export type ManualTranslationUpdateDto = z.infer<typeof ManualTranslationUpdateSchema>;
export type SellerDiscoveryQueryDto = z.infer<typeof SellerDiscoveryQuerySchema>;
export type SearchSuggestionQueryDto = z.infer<typeof SearchSuggestionQuerySchema>;
export type SearchHistoryQueryDto = z.infer<typeof SearchHistoryQuerySchema>;
export type ProductDiscoveryLimitQueryDto = z.infer<
  typeof ProductDiscoveryLimitQuerySchema
>;
export type SearchEventCreateDto = z.infer<typeof SearchEventCreateSchema>;
export type FeaturePromotionDto = z.infer<typeof FeaturePromotionSchema>;
export type SearchSettingsUpdateDto = z.infer<typeof SearchSettingsUpdateSchema>;
export type SearchReindexDto = z.infer<typeof SearchReindexSchema>;
export type AnalyticsDateRangeQueryDto = z.infer<
  typeof AnalyticsDateRangeQuerySchema
>;
export type SellerSalesAnalyticsQueryDto = z.infer<
  typeof SellerSalesAnalyticsQuerySchema
>;
export type SellerProductAnalyticsQueryDto = z.infer<
  typeof SellerProductAnalyticsQuerySchema
>;
export type BuyerSpendingAnalyticsQueryDto = z.infer<
  typeof BuyerSpendingAnalyticsQuerySchema
>;
export type AdminAnalyticsQueryDto = z.infer<typeof AdminAnalyticsQuerySchema>;
export type AdminOrderAnalyticsQueryDto = z.infer<
  typeof AdminOrderAnalyticsQuerySchema
>;
export type AdminPaymentAnalyticsQueryDto = z.infer<
  typeof AdminPaymentAnalyticsQuerySchema
>;
export type ReportExportDto = z.infer<typeof ReportExportSchema>;
export type AnalyticsRebuildDto = z.infer<typeof AnalyticsRebuildSchema>;
