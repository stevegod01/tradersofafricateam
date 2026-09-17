/**
 * Reusable Fastify route schemas for Swagger documentation.
 * These are JSON Schema objects that Fastify passes to @fastify/swagger.
 */

const OptionalBearerAuth: Array<Record<string, string[]>> = [{}, { bearerAuth: [] }];

// ─── Shared response schemas ───────────────────────────────────────────────────

export const MessageResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
  },
};

export const ErrorResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    code: { type: 'string' },
    details: { type: 'array', items: { type: 'object', additionalProperties: true } },
    stack: { type: 'string' },
    statusCode: { type: 'number' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
};

const commonErrors = {
  400: { description: 'Bad Request', ...ErrorResponse },
  401: { description: 'Unauthorized', ...ErrorResponse },
  403: { description: 'Forbidden', ...ErrorResponse },
  404: { description: 'Not Found', ...ErrorResponse },
  409: { description: 'Conflict', ...ErrorResponse },
  429: { description: 'Too Many Requests', ...ErrorResponse },
  500: { description: 'Internal Server Error', ...ErrorResponse },
  503: { description: 'Service Unavailable', ...ErrorResponse },
};

const LanguageCodeField = {
  type: 'string',
  minLength: 2,
  maxLength: 20,
  pattern: '^[a-z]{2,8}([_-][a-z0-9]{2,8})?$',
  example: 'fr',
};

const LocalizedTextField = {
  oneOf: [
    { type: 'string' },
    {
      type: 'object',
      additionalProperties: { type: 'string' },
      example: {
        en: 'English value',
        fr: 'Valeur française',
      },
    },
  ],
};

const LanguageQuery = {
  type: 'object',
  properties: {
    lang: LanguageCodeField,
  },
};

export const HealthCheckSchema = {
  summary: 'Health check',
  tags: ['System'],
  response: {
    200: {
      description: 'Service is healthy',
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok'] },
        timestamp: { type: 'string', format: 'date-time' },
        env: { type: 'string' },
      },
    },
    503: {
      description: 'Service is degraded',
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['degraded'] },
        timestamp: { type: 'string', format: 'date-time' },
        env: { type: 'string' },
      },
    },
  },
};

// ─── Auth schemas ──────────────────────────────────────────────────────────────

export const SignupSchema = {
  summary: 'Sign up a new buyer account',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['email', 'password', 'termsOfUse'],
    properties: {
      firstName: { type: 'string', minLength: 1, maxLength: 100, example: 'John' },
      lastName: { type: 'string', minLength: 1, maxLength: 100, example: 'Doe' },
      email: { type: 'string', format: 'email', example: 'john@example.com' },
      password: {
        type: 'string',
        minLength: 8,
        maxLength: 128,
        example: 'Str0ng@Pass!',
        description: 'Must contain uppercase, lowercase, number and special character',
      },
      referralCode: { type: 'string', example: 'ABC123' },
      termsOfUse: { type: 'boolean', enum: [true], example: true },
      phone: { type: 'string', minLength: 7, maxLength: 20, description: 'Legacy alias for phoneNumber' },
      phoneNumber: { type: 'string', minLength: 7, maxLength: 30, example: '+2348012345678' },
      selectedLanguage: LanguageCodeField,
    },
  },
  response: {
    201: {
      description: 'Registration successful',
      type: 'object',
      properties: {
        token: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            status: { type: 'string', enum: ['inactive'] },
            isEmailVerified: { type: 'boolean' },
          },
        },
      },
    },
    ...commonErrors,
  },
};

export const RegisterSchema = SignupSchema;

export const VerifyEmailSchema = {
  summary: 'Verify email address',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['token', 'otp'],
    properties: {
      token: { type: 'string', description: 'JWT token returned from signup/login' },
      otp: { type: 'string', example: '123456' },
    },
  },
  response: {
    200: {
      description: 'Email verified',
      type: 'object',
      properties: {
        message: { type: 'string' },
        status: { type: 'string', enum: ['active'] },
      },
    },
    ...commonErrors,
  },
};

export const GoogleAuthSchema = {
  summary: 'Continue with Google',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['googleToken'],
    properties: {
      googleToken: { type: 'string' },
    },
  },
  response: {
    200: {
      description: 'Google account authenticated',
      type: 'object',
      properties: {
        token: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            termsOfUse: { type: 'boolean' },
          },
        },
      },
    },
    ...commonErrors,
  },
};

export const UpdateTermsSchema = {
  security: [{ bearerAuth: [] }],
  summary: 'Accept Terms of Use',
  tags: ['Auth'],
  params: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['termsOfUse'],
    properties: {
      termsOfUse: { type: 'boolean', enum: [true], example: true },
    },
  },
  response: {
    200: { description: 'Terms accepted', ...MessageResponse },
    ...commonErrors,
  },
};

// Explicit own-account fields; credentials and security tokens are never serialized.
const SelfUserProperties = {
        id: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        phoneNumber: { type: 'string', nullable: true },
        email: { type: 'string' },
        userType: { type: 'string', enum: ['buyer', 'seller', 'admin'] },
        status: { type: 'string', enum: ['active', 'inactive', 'disabled', 'deleted'] },
        isEmailVerified: { type: 'boolean' },
        isCompanyVerified: { type: 'boolean' },
        totalPoints: { type: 'number' },
        companyName: { type: 'string', nullable: true },
        storeName: { type: 'string', nullable: true },
        country: { type: 'string', nullable: true },
        totalReviewCount: { type: 'number' },
        totalAverageReviews: { type: 'number' },
        selectedLanguage: { type: 'string' },
        deliveryAddress: { type: 'string', nullable: true },
        pickupAddress: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        termsOfUse: { type: 'boolean' },
        merchantTerms: { type: 'boolean' },
        registrationNumber: { type: 'string', nullable: true },
        businessType: { type: 'string', nullable: true },
        yearsOfBusiness: { type: 'integer', nullable: true },
        companyAddress: { type: 'string', nullable: true },
        companyLogo: { type: 'string', nullable: true },
        companyBio: { type: 'string', nullable: true },
        referral: { type: 'string', nullable: true },
        referralCode: { type: 'string', nullable: true },
        statusReason: { type: 'string', nullable: true },
        disabledBy: { type: 'string', nullable: true },
        disabledAt: { type: 'string', format: 'date-time', nullable: true },
        updatedAt: { type: 'string', format: 'date-time' },
};

export const LoginSchema = {
  summary: 'Login and receive token',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'john@example.com' },
      password: { type: 'string', example: 'Str0ng@Pass!' },
    },
  },
  response: {
    200: {
      description: 'Login successful',
      type: 'object',
      properties: {
        token: { type: 'string' },
        requiresEmailVerification: { type: 'boolean' },
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            ...SelfUserProperties,
          },
        },
      },
    },
    ...commonErrors,
  },
};

export const RefreshTokenSchema = {
  summary: 'Rotate refresh token and get new access token',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: { type: 'string' },
    },
  },
  response: {
    200: {
      description: 'Tokens rotated',
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Alias for accessToken' },
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
    ...commonErrors,
  },
};

export const LogoutSchema = {
  summary: 'Logout — revoke refresh token',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Logged out', ...MessageResponse },
    ...commonErrors,
  },
};

export const LogoutAllSchema = {
  summary: 'Logout from all devices',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Logged out from all devices', ...MessageResponse },
    ...commonErrors,
  },
};

export const ForgotPasswordSchema = {
  summary: 'Request a password reset OTP',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email', example: 'john@example.com' },
    },
  },
  response: {
    200: { description: 'Reset email sent (if account exists)', ...MessageResponse },
    ...commonErrors,
  },
};

export const ResetPasswordSchema = {
  summary: 'Reset password using OTP',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['password'],
    anyOf: [{ required: ['otp'] }, { required: ['token'] }],
    properties: {
      token: { type: 'string', minLength: 1, description: 'Alternative reset token accepted by the password reset service' },
      otp: { type: 'string', example: '123456' },
      password: { type: 'string', minLength: 8, example: 'NewStr0ng@Pass!' },
    },
  },
  response: {
    200: { description: 'Password reset successfully', ...MessageResponse },
    ...commonErrors,
  },
};

export const ChangePasswordSchema = {
  summary: 'Change password (authenticated)',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['newPassword'],
    anyOf: [{ required: ['oldPassword'] }, { required: ['currentPassword'] }],
    properties: {
      currentPassword: { type: 'string', minLength: 1, description: 'Alias for oldPassword' },
      oldPassword: { type: 'string', example: 'OldStr0ng@Pass!' },
      newPassword: { type: 'string', minLength: 8, example: 'NewStr0ng@Pass!' },
    },
  },
  response: {
    200: { description: 'Password changed', ...MessageResponse },
    ...commonErrors,
  },
};

export const UpdateSelfUserStatusSchema = {
  summary: 'Soft delete own account',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['delete', 'deleted'], example: 'delete' },
      reason: { type: 'string', example: 'I do not need the account anymore' },
    },
  },
  response: {
    200: { description: 'Account deleted', ...MessageResponse },
    ...commonErrors,
  },
};

// ─── Seller schemas ────────────────────────────────────────────────────────────

export const UpgradeToSellerSchema = {
  summary: 'Upgrade to seller and submit business verification',
  tags: ['Seller'],
  security: [{ bearerAuth: [] }],
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
    required: [
      'storeName', 'companyName', 'businessType',
      'yearsOfBusiness', 'companyAddress', 'pickupAddress', 'country',
    ],
    properties: {
      storeName: { type: 'string', example: 'Victor Agro Export Ltd' },
      companyName: { type: 'string', example: 'Victor Agro Export Ltd' },
      registrationNumber: { type: 'string', example: 'RC123456' },
      businessType: { type: 'string', example: 'Agriculture' },
      yearsOfBusiness: { type: 'string', example: '5', description: 'Number of years (sent as string in multipart)' },
      companyAddress: { type: 'string', example: 'Lagos, Nigeria' },
      pickupAddress: { type: 'string', example: 'Oshodi Warehouse, Lagos' },
      companyBio: { type: 'string', example: 'Exporter of premium agricultural commodities' },
      country: { type: 'string', example: 'Nigeria' },
      companyLogo: { type: 'string', format: 'binary', description: 'Logo image file (JPEG, PNG, WebP — max 5MB)' },
    },
  },
  response: {
    201: {
      description: 'Verification submitted',
      type: 'object',
      properties: {
        message: { type: 'string' },
        status: { type: 'string', enum: ['pending'] },
      },
    },
    ...commonErrors,
  },
};

export const GetMyProfileSchema = {
  summary: 'Get authenticated user profile',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'User profile',
      type: 'object',
      properties: {
        ...SelfUserProperties,
      },
    },
    ...commonErrors,
  },
};

export const UpdateProfileSchema = {
  summary: 'Update authenticated user profile',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      firstName: { type: 'string', example: 'Victor' },
      lastName: { type: 'string', example: 'Ejiogu' },
      phoneNumber: { type: 'string', example: '+2348012345678' },
      selectedLanguage: LanguageCodeField,
      deliveryAddress: { type: 'string', example: 'Lekki Lagos' },
      companyBio: { type: 'string', example: 'Leading agro exporter' },
    },
  },
  response: {
    200: { description: 'Profile updated', ...MessageResponse },
    ...commonErrors,
  },
};

export const GetVerificationStatusSchema = {
  summary: 'Get current user verification status',
  tags: ['Seller'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'Verification status',
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            verificationStatus: {
              type: 'string',
              enum: ['not_submitted', 'pending', 'approved', 'rejected'],
            },
            submittedAt: { type: 'string', format: 'date-time', nullable: true },
            rejectionReason: { type: 'string', nullable: true },
          },
        },
      },
    },
    ...commonErrors,
  },
};

// ─── Admin schemas ─────────────────────────────────────────────────────────────

const VerificationItem = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    companyName: { type: 'string' },
    registrationNumber: { type: 'string', nullable: true },
    userId: { type: 'string' },
    verificationStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
    submittedAt: { type: 'string', format: 'date-time' },
    businessType: { type: 'string' },
    country: { type: 'string' },
    rejectionReason: { type: 'string', nullable: true },
    adminNotes: { type: 'string', nullable: true },
    reviewedAt: { type: 'string', format: 'date-time', nullable: true },
    reviewedBy: { type: 'string', nullable: true },
    updatedAt: { type: 'string', format: 'date-time' },
    user: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
      },
    },
  },
};

const PaginationMeta = {
  type: 'object',
  properties: {
    total: { type: 'number' },
    page: { type: 'number' },
    limit: { type: 'number' },
    totalPages: { type: 'number' },
  },
};

export const AdminLoginSchema = {
  summary: 'Admin login',
  tags: ['Admin'],
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'admin@tofa.com' },
      password: { type: 'string', example: 'AdminPass123' },
    },
  },
  response: {
    200: {
      description: 'Login successful',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            admin: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                phoneNumber: { type: 'string', nullable: true },
                email: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'active', 'inactive'] },
                isSuperAdmin: { type: 'boolean' },
                role: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string', nullable: true },
                    status: { type: 'string' },
                  },
                },
                permissions: { type: 'array', items: { type: 'string' } },
                lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
    ...commonErrors,
  },
};

export const CompleteAdminSetupSwaggerSchema = {
  summary: 'Complete admin setup',
  tags: ['Admin'],
  body: {
    type: 'object',
    required: ['token', 'password'],
    properties: {
      token: { type: 'string', example: 'ADMIN_SETUP_TOKEN' },
      password: { type: 'string', minLength: 8, example: 'AdminPass123!' },
    },
  },
  response: {
    200: { description: 'Admin account activated', ...MessageResponse },
    ...commonErrors,
  },
};

export const AdminForgotPasswordSchema = {
  summary: 'Request admin password reset',
  tags: ['Admin'],
  body: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email', example: 'admin@tofa.com' },
    },
  },
  response: {
    200: { description: 'Reset instructions sent when eligible', ...MessageResponse },
    ...commonErrors,
  },
};

export const AdminResetPasswordSchema = {
  summary: 'Reset admin password',
  tags: ['Admin'],
  body: {
    type: 'object',
    required: ['otp', 'password'],
    properties: {
      otp: { type: 'string', example: '123456' },
      password: { type: 'string', minLength: 8, example: 'NewAdminPass123!' },
    },
  },
  response: {
    200: { description: 'Password reset successful', ...MessageResponse },
    ...commonErrors,
  },
};

export const AdminChangePasswordSchema = {
  summary: 'Change admin password',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['oldPassword', 'newPassword'],
    properties: {
      oldPassword: { type: 'string', example: 'OldAdminPass123!' },
      newPassword: { type: 'string', minLength: 8, example: 'NewAdminPass123!' },
    },
  },
  response: {
    200: { description: 'Password changed', ...MessageResponse },
    ...commonErrors,
  },
};

export const GetCurrentAdminSchema = {
  summary: 'Get current admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Current admin', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateAdminProfileSchema = {
  summary: 'Update current admin profile',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      firstName: { type: 'string', example: 'Joy' },
      lastName: { type: 'string', example: 'Okafor' },
      phoneNumber: { type: 'string', nullable: true, example: '+2348012345678' },
    },
  },
  response: {
    200: { description: 'Profile updated', ...MessageResponse },
    ...commonErrors,
  },
};

export const CreateAdminSchema = {
  summary: 'Create admin user',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['firstName', 'lastName', 'email'],
    properties: {
      firstName: { type: 'string', example: 'Joy' },
      lastName: { type: 'string', example: 'Okafor' },
      phoneNumber: { type: 'string', example: '+2348012345678' },
      email: { type: 'string', format: 'email', example: 'joy@tofa.com' },
      roleId: { type: 'string', nullable: true, description: 'Admin role UUID' },
    },
  },
  response: {
    201: { description: 'Admin created and invitation sent', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminUsersSchema = {
  summary: 'List admin users',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'active', 'inactive'] },
      roleId: { type: 'string' },
      page: { type: 'number', default: 1 },
      limit: { type: 'number', default: 20 },
    },
  },
  response: {
    200: { description: 'Admin users', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminDetailsSchema = {
  summary: 'Get admin details',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['adminId'],
    properties: { adminId: { type: 'string' } },
  },
  response: {
    200: { description: 'Admin details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateAdminSchema = {
  summary: 'Update admin user',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['adminId'],
    properties: { adminId: { type: 'string' } },
  },
  body: {
    type: 'object',
    properties: {
      firstName: { type: 'string', example: 'Joy' },
      lastName: { type: 'string', example: 'Okafor' },
      phoneNumber: { type: 'string', nullable: true, example: '+2348012345678' },
      roleId: { type: 'string', nullable: true },
    },
  },
  response: {
    200: { description: 'Admin updated', ...MessageResponse },
    ...commonErrors,
  },
};

export const DisableUserSchema = {
  summary: 'Disable user',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      reason: { type: 'string', example: 'Fraudulent activities' },
    },
  },
  response: {
    200: {
      description: 'User disabled',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            status: { type: 'string', enum: ['disabled'] },
          },
        },
      },
    },
    ...commonErrors,
  },
};

export const ActivateUserSchema = {
  summary: 'Reactivate user',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string' },
    },
  },
  response: {
    200: { description: 'User activated', ...MessageResponse },
    ...commonErrors,
  },
};

export const DeactivateAdminSchema = {
  summary: 'Deactivate admin user',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['adminId'],
    properties: {
      adminId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      reason: { type: 'string', example: 'Left the organization' },
    },
  },
  response: {
    200: { description: 'Admin deactivated', ...MessageResponse },
    ...commonErrors,
  },
};

export const ActivateAdminSchema = {
  summary: 'Reactivate admin user',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['adminId'],
    properties: {
      adminId: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Admin activated', ...MessageResponse },
    ...commonErrors,
  },
};

export const ResendAdminInvitationSchema = {
  summary: 'Resend admin setup invitation',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['adminId'],
    properties: {
      adminId: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Invitation resent', ...MessageResponse },
    ...commonErrors,
  },
};

export const CreateAdminRoleSchema = {
  summary: 'Create admin role',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', example: 'Finance Officer' },
      description: { type: 'string', nullable: true },
      permissionIds: { type: 'array', items: { type: 'string' } },
    },
  },
  response: {
    201: { description: 'Role created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminRolesSchema = {
  summary: 'List admin roles',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active', 'inactive'] },
      search: { type: 'string' },
      page: { type: 'number', default: 1 },
      limit: { type: 'number', default: 20 },
    },
  },
  response: {
    200: { description: 'Admin roles', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminRoleDetailsSchema = {
  summary: 'Get admin role details',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['roleId'],
    properties: { roleId: { type: 'string' } },
  },
  response: {
    200: { description: 'Admin role details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateAdminRoleSchema = {
  summary: 'Update admin role',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['roleId'],
    properties: { roleId: { type: 'string' } },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', example: 'Senior Finance Officer' },
      description: { type: 'string', nullable: true },
      permissionIds: { type: 'array', items: { type: 'string' } },
    },
  },
  response: {
    200: { description: 'Role updated', ...MessageResponse },
    ...commonErrors,
  },
};

export const UpdateAdminRoleStatusSchema = {
  summary: 'Update admin role status',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['roleId'],
    properties: { roleId: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['active', 'inactive'] },
    },
  },
  response: {
    200: { description: 'Role status updated', ...MessageResponse },
    ...commonErrors,
  },
};

export const AssignRolePermissionsSchema = {
  summary: 'Assign role permissions',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['roleId'],
    properties: { roleId: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['permissionIds'],
    properties: {
      permissionIds: { type: 'array', items: { type: 'string' } },
    },
  },
  response: {
    200: { description: 'Role permissions updated', ...MessageResponse },
    ...commonErrors,
  },
};

export const GetPermissionsSchema = {
  summary: 'List backend-defined permissions',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Permissions grouped by module', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetSellerVerificationsSchema = {
  summary: 'List seller verifications (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'approved', 'rejected'], description: 'Filter by status' },
      search: {
        type: 'string',
        description: 'Search by company name, registration number, applicant name, or email',
      },
      page: { type: 'string', example: '1' },
      limit: { type: 'string', example: '20' },
    },
  },
  response: {
    200: {
      description: 'Paginated list of verifications',
      type: 'object',
      properties: {
        data: { type: 'array', items: VerificationItem },
        meta: PaginationMeta,
      },
    },
    ...commonErrors,
  },
};

export const GetSellerVerificationsSummarySchema = {
  summary: 'Seller verification counts by status (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'Total, pending, approved, and rejected verification counts',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            pending: { type: 'number' },
            approved: { type: 'number' },
            rejected: { type: 'number' },
          },
        },
      },
    },
    ...commonErrors,
  },
};

export const GetSellerVerificationByIdSchema = {
  summary: 'Get single seller verification (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['verificationId'],
    properties: {
      verificationId: { type: 'string', description: 'Verification UUID' },
    },
  },
  response: {
    200: { description: 'Verification detail', type: 'object', properties: { data: VerificationItem } },
    ...commonErrors,
  },
};

export const ApproveSellerSchema = {
  summary: 'Approve a seller verification (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['verificationId'],
    properties: {
      verificationId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      notes: { type: 'string', example: 'Documents verified successfully' },
    },
  },
  response: {
    200: { description: 'Seller approved', ...MessageResponse },
    ...commonErrors,
  },
};

export const RejectSellerSchema = {
  summary: 'Reject a seller verification (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['verificationId'],
    properties: {
      verificationId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string', minLength: 10, example: 'Invalid registration document' },
    },
  },
  response: {
    200: { description: 'Seller rejected', ...MessageResponse },
    ...commonErrors,
  },
};

export const GetUsersSchema = {
  summary: 'List all users (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'string', example: '1' },
      limit: { type: 'string', example: '20' },
      search: { type: 'string', description: 'Search by name or email' },
    },
  },
  response: {
    200: {
      description: 'Paginated user list',
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              phoneNumber: { type: 'string', nullable: true },
              email: { type: 'string' },
              userType: { type: 'string', enum: ['buyer', 'seller', 'admin'] },
              status: { type: 'string', enum: ['active', 'inactive', 'disabled', 'deleted'] },
              isEmailVerified: { type: 'boolean' },
              isCompanyVerified: { type: 'boolean' },
              totalPoints: { type: 'number' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        meta: PaginationMeta,
      },
    },
    ...commonErrors,
  },
};

export const GetUserByIdSchema = {
  summary: 'Get single user (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string', description: 'User UUID' },
    },
  },
  response: {
    200: { description: 'User detail', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateUserStatusSchema = {
  summary: 'Update user status (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['active', 'inactive', 'disabled', 'deleted'] },
      reason: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Status updated', ...MessageResponse },
    ...commonErrors,
  },
};

// ─── Address schemas ──────────────────────────────────────────────────────────

const AddressResponse = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    label: { type: 'string' },
    recipientName: { type: 'string' },
    phoneNumber: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: 'string', nullable: true },
    city: { type: 'string' },
    state: { type: 'string' },
    country: { type: 'string' },
    postalCode: { type: 'string', nullable: true },
    isDefault: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const GetAddressesSchema = {
  summary: 'Get saved delivery addresses',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'Saved addresses',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'array', items: AddressResponse },
      },
    },
    ...commonErrors,
  },
};

export const CreateAddressSchema = {
  summary: 'Add a delivery address',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: [
      'label',
      'recipientName',
      'phoneNumber',
      'addressLine1',
      'city',
      'state',
      'country',
    ],
    properties: {
      label: { type: 'string', example: 'Office' },
      recipientName: { type: 'string', example: 'Victor Ejiogu' },
      phoneNumber: { type: 'string', example: '+2348012345678' },
      addressLine1: { type: 'string', example: '32 Ezekiel Street' },
      addressLine2: { type: 'string', nullable: true },
      city: { type: 'string', example: 'Lekki' },
      state: { type: 'string', example: 'Lagos' },
      country: { type: 'string', example: 'Nigeria' },
      postalCode: { type: 'string', nullable: true },
      isDefault: { type: 'boolean', default: false },
    },
  },
  response: {
    201: {
      description: 'Address added',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            isDefault: { type: 'boolean' },
          },
        },
      },
    },
    ...commonErrors,
  },
};

// ─── Category schemas ─────────────────────────────────────────────────────────

const CategoryBody = {
  type: 'object',
  properties: {
    name: LocalizedTextField,
    description: { anyOf: [LocalizedTextField, { type: 'null' }] },
    sourceLanguage: { ...LanguageCodeField, default: 'en' },
    parentId: { type: 'string', nullable: true },
    icon: { type: 'string', nullable: true },
    image: { type: 'string', nullable: true },
    sortOrder: { type: 'number', default: 0 },
  },
};

export const GetPublicCategoriesSchema = {
  security: OptionalBearerAuth,
  summary: 'List active public categories',
  tags: ['Categories'],
  querystring: {
    type: 'object',
    properties: {
      parentId: { type: 'string' },
      search: { type: 'string' },
      lang: LanguageCodeField,
      page: { type: 'number', default: 1 },
      limit: { type: 'number', default: 20 },
    },
  },
  response: {
    200: { description: 'Categories', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetCategoryTreeSchema = {
  security: OptionalBearerAuth,
  summary: 'Get active category tree',
  tags: ['Categories'],
  querystring: {
    type: 'object',
    properties: {
      lang: LanguageCodeField,
    },
  },
  response: {
    200: { description: 'Category tree', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetPublicCategoryByIdSchema = {
  security: OptionalBearerAuth,
  summary: 'Get active category by ID',
  tags: ['Categories'],
  params: {
    type: 'object',
    required: ['categoryId'],
    properties: { categoryId: { type: 'string' } },
  },
  querystring: {
    type: 'object',
    properties: {
      lang: LanguageCodeField,
    },
  },
  response: {
    200: { description: 'Category detail', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateCategorySchema = {
  summary: 'Create category (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: { ...CategoryBody, required: ['name'] },
  response: {
    201: { description: 'Category created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminCategoriesSchema = {
  summary: 'List categories (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      lang: LanguageCodeField,
      status: { type: 'string', enum: ['active', 'inactive', 'archived', 'deleted'] },
      parentId: { type: 'string' },
      search: { type: 'string' },
      page: { type: 'number', default: 1 },
      limit: { type: 'number', default: 20 },
    },
  },
  response: {
    200: { description: 'Admin category list', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateCategorySchema = {
  summary: 'Update category (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['categoryId'],
    properties: { categoryId: { type: 'string' } },
  },
  body: CategoryBody,
  response: {
    200: { description: 'Category updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateCategoryStatusSchema = {
  summary: 'Update category status (admin)',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['categoryId'],
    properties: { categoryId: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['active', 'inactive', 'archived', 'deleted'] },
      reason: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Category status updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Product schemas ──────────────────────────────────────────────────────────

const PublicProductStateSchema = {
  type: 'object',
  additionalProperties: true,
  properties: { isSaved: { type: 'boolean', description: 'Present only for an authenticated marketplace user.' } },
};


const TranslationField = {
  oneOf: [
    { type: 'string' },
    {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  ],
};

const ProductBody = {
  type: 'object',
  properties: {
    productName: TranslationField,
    productDescription: TranslationField,
    sourceLanguage: { ...LanguageCodeField, default: 'en' },
    categoryIds: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
    countryOfOrigin: { type: 'string', example: 'Nigeria' },
    currency: { type: 'string', example: 'NGN' },
    productType: { type: 'string', enum: ['simple', 'variable', 'SIMPLE', 'VARIABLE'] },
    price: { type: 'number', nullable: true },
    discount: { type: 'number', nullable: true },
    quantity: { type: 'number', nullable: true },
    weight: { type: 'number', nullable: true, description: 'Package weight for logistics quotes' },
    weightUnit: { type: 'string', nullable: true, example: 'kg' },
    length: { type: 'number', nullable: true },
    width: { type: 'number', nullable: true },
    height: { type: 'number', nullable: true },
    dimensionUnit: { type: 'string', nullable: true, example: 'cm' },
    barcode: { type: 'string', nullable: true },
    supplyCapacity: { type: 'number' },
    unitForSupplyCapacity: { type: 'string', example: 'kg' },
    minOrdersAllowed: { type: 'number' },
    unitForMinOrder: { type: 'string', example: 'kg' },
    minDuration: { type: 'number' },
    maxDuration: { type: 'number' },
    durationUnit: { type: 'string', example: 'days' },
    images: {
      type: 'array',
      items: {
        type: 'object', required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri', maxLength: 500 },
          sortOrder: { type: 'integer', minimum: 0, default: 0 },
          isPrimary: { type: 'boolean', default: false },
        },
      },
    },
    variantOptions: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', required: ['name', 'values'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          values: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 80 } },
          sortOrder: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        required: ['attributes', 'price', 'quantity'],
        properties: {
          attributes: { type: 'object', additionalProperties: { type: 'string' } },
          price: { type: 'number' },
          discount: { type: 'number', nullable: true },
          quantity: { type: 'number' },
          weight: { type: 'number', nullable: true },
          weightUnit: { type: 'string', nullable: true },
          length: { type: 'number', nullable: true },
          width: { type: 'number', nullable: true },
          height: { type: 'number', nullable: true },
          dimensionUnit: { type: 'string', nullable: true },
          image: { type: 'string', nullable: true },
        },
      },
    },
  },
};

export const CreateProductSchema = {
  summary: 'Create product as a verified seller',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  body: {
    ...ProductBody,
    required: [
      'productName',
      'productDescription',
      'categoryIds',
      'countryOfOrigin',
      'currency',
      'productType',
      'supplyCapacity',
      'unitForSupplyCapacity',
      'minOrdersAllowed',
      'unitForMinOrder',
      'minDuration',
      'maxDuration',
      'durationUnit',
    ],
  },
  response: {
    201: { description: 'Product created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetProductsSchema = {
  security: OptionalBearerAuth,
  summary: 'List active public products',
  description: 'Authenticated user requests include isSaved on every product, loaded in one batch. Anonymous responses omit it. Personalized responses must not be shared-cached.',
  tags: ['Products'],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'number', default: 1 },
      limit: { type: 'number', default: 20 },
      categoryId: { type: 'string' },
      categoryIds: {
        oneOf: [
          { type: 'string', description: 'Comma-separated category IDs' },
          { type: 'array', items: { type: 'string', format: 'uuid' } },
        ],
      },
      sellerId: { type: 'string', format: 'uuid' },
      countryOfOrigin: { type: 'string' },
      minPrice: { type: 'number', minimum: 0 },
      maxPrice: { type: 'number', minimum: 0 },
      currency: { type: 'string', minLength: 3, maxLength: 3, example: 'USD' },
      minRating: { type: 'number', minimum: 0, maximum: 5 },
      inventoryStatus: { type: 'string', enum: ['in_stock', 'out_of_stock'] },
      hasDiscount: { type: 'boolean' },
      sortBy: {
        type: 'string',
        enum: [
          'relevance',
          'ranking',
          'newest',
          'price_low_to_high',
          'price_high_to_low',
          'highest_rating',
          'most_reviewed',
        ],
      },
      search: { type: 'string' },
      lang: LanguageCodeField,
    },
  },
  response: {
    200: { description: 'Product list', type: 'object', additionalProperties: true, properties: { data: {type:'array',items:PublicProductStateSchema} } },
    ...commonErrors,
  },
};

export const GetSellerProductsSchema = {
  summary: 'List my seller products',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'number', default: 1 },
      limit: { type: 'number', default: 20 },
      status: { type: 'string', enum: ['draft', 'active', 'inactive', 'archived', 'deleted'] },
      categoryId: { type: 'string' },
      search: { type: 'string' },
      lang: LanguageCodeField,
    },
  },
  response: {
    200: { description: 'Seller product list', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetProductByIdSchema = {
  security: OptionalBearerAuth,
  summary: 'Get public product detail',
  description: 'Authenticated user requests include isSaved. Anonymous responses omit it. Saved state does not alter current product visibility or availability.',
  tags: ['Products'],
  params: {
    type: 'object',
    required: ['productId'],
    properties: { productId: { type: 'string' } },
  },
  querystring: LanguageQuery,
  response: {
    200: { description: 'Product detail', type: 'object', additionalProperties: true, properties: { data: PublicProductStateSchema } },
    ...commonErrors,
  },
};

export const GetSellerProductByIdSchema = {
  ...GetProductByIdSchema,
  summary: 'Get my seller product detail',
  security: [{ bearerAuth: [] }],
};

export const UpdateProductSchema = {
  summary: 'Update product as owner',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId'],
    properties: { productId: { type: 'string' } },
  },
  body: ProductBody,
  response: {
    200: { description: 'Product updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateProductStatusSchema = {
  summary: 'Update product lifecycle status',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId'],
    properties: { productId: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['draft', 'active', 'inactive', 'archived', 'deleted'] },
    },
  },
  response: {
    200: { description: 'Product status updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateProductInventorySchema = {
  summary: 'Update product inventory',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId'],
    properties: { productId: { type: 'string' } },
  },
  body: {
    type: 'object',
    properties: {
      quantity: { type: 'number' },
      variants: {
        type: 'array',
        items: {
          type: 'object', required: ['variantId', 'quantity'],
          properties: {
            variantId: { type: 'string', format: 'uuid' },
            quantity: { type: 'number', minimum: 0 },
          },
        },
      },
    },
  },
  response: {
    200: { description: 'Inventory updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const DeleteProductImageSchema = {
  summary: 'Delete product image',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId', 'imageId'],
    properties: {
      productId: { type: 'string' },
      imageId: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Image deleted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const DeleteProductSchema = {
  summary: 'Soft delete product',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId'],
    properties: { productId: { type: 'string' } },
  },
  response: {
    200: { description: 'Product deleted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Cart schemas ─────────────────────────────────────────────────────────────

export const AddCartItemSchema = {
  summary: 'Add product to cart',
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['productId', 'quantity'],
    properties: {
      productId: { type: 'string' },
      variantId: { type: 'string', nullable: true },
      quantity: { type: 'number' },
    },
  },
  response: {
    201: { description: 'Product added to cart', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetCartSchema = {
  summary: 'Get cart grouped by seller',
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Cart', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateCartItemSchema = {
  summary: 'Update cart item quantity',
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['cartItemId'],
    properties: { cartItemId: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['quantity'],
    properties: { quantity: { type: 'number' } },
  },
  response: {
    200: { description: 'Cart updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RemoveCartItemSchema = {
  summary: 'Remove cart item',
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['cartItemId'],
    properties: { cartItemId: { type: 'string' } },
  },
  response: {
    200: { description: 'Cart item removed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ClearCartSchema = {
  summary: 'Clear cart',
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Cart cleared', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Checkout schemas ─────────────────────────────────────────────────────────

export const SelectCheckoutAddressSchema = {
  summary: 'Select checkout delivery address',
  tags: ['Checkout'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['deliveryAddressId'],
    properties: { deliveryAddressId: { type: 'string' } },
  },
  response: {
    200: { description: 'Checkout address selected', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetDeliveryOptionsSchema = {
  summary: 'Get checkout delivery options',
  tags: ['Checkout'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['deliveryAddressId'],
    properties: { deliveryAddressId: { type: 'string' } },
  },
  response: {
    200: { description: 'Delivery options', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ApplyDeliveryProviderSchema = {
  summary: 'Apply same logistics provider to eligible seller groups',
  tags: ['Checkout'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['providerId'],
    properties: {
      providerId: { type: 'string', example: 'provider_gig' },
      applyTo: { type: 'string', enum: ['eligible_seller_groups'] },
    },
  },
  response: {
    200: { description: 'Provider applied', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SelectDeliveryOptionsSchema = {
  summary: 'Select delivery options per seller group',
  tags: ['Checkout'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['sellerSelections'],
    properties: {
      sellerSelections: {
        type: 'array', minItems: 1,
        items: {
          type: 'object', required: ['sellerId', 'type', 'quoteId'],
          properties: {
            sellerId: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['integrated_logistics', 'seller_arranged', 'buyer_arranged'] },
            quoteId: { type: 'string', minLength: 1, maxLength: 120, nullable: true },
          },
        },
      },
    },
  },
  response: {
    200: { description: 'Delivery selected', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetPaymentMethodsSchema = {
  summary: 'Get available checkout payment methods',
  tags: ['Checkout'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Payment methods', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SelectPaymentMethodSchema = {
  summary: 'Select checkout payment method',
  tags: ['Checkout'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['paymentMethod'],
    properties: { paymentMethod: { type: 'string', enum: ['direct_bank_transfer', 'paystack', 'flutterwave', 'papss', 'transactworld', 'telegraphic_transfer', 'letter_of_credit'] } },
  },
  response: {
    200: { description: 'Payment method selected', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CheckoutPreviewSchema = {
  summary: 'Preview checkout summary',
  tags: ['Checkout'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Checkout preview', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateCheckoutSchema = {
  summary: 'Create cart checkout session',
  tags: ['Checkout'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      notes: { type: 'string' },
    },
  },
  response: {
    201: { description: 'Checkout created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Payment schemas ──────────────────────────────────────────────────────────

const paymentMethodEnum = [
  'direct_bank_transfer',
  'paystack',
  'flutterwave',
  'papss',
  'transactworld',
  'telegraphic_transfer',
  'letter_of_credit',
];

const paymentStatusEnum = [
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
];

const paymentSourceQuery = {
  type: 'object',
  required: ['sourceType', 'sourceId'],
  properties: {
    sourceType: { type: 'string', example: 'checkout' },
    sourceId: { type: 'string', example: 'checkout-session-id' },
  },
};

const paymentListQuery = {
  type: 'object',
  properties: {
    sourceType: { type: 'string', example: 'checkout' },
    purpose: { type: 'string', example: 'marketplace_purchase' },
    status: { type: 'string', enum: paymentStatusEnum },
    paymentMethod: { type: 'string', enum: paymentMethodEnum },
    currency: { type: 'string', minLength: 3, maxLength: 3, example: 'NGN' },
    search: { type: 'string' },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

const paymentIdParams = {
  type: 'object',
  required: ['paymentId'],
  properties: {
    paymentId: { type: 'string', format: 'uuid' },
  },
};

const createPaymentBody = {
  type: 'object',
  required: ['sourceType', 'sourceId', 'paymentMethod'],
  properties: {
    sourceType: { type: 'string', example: 'checkout' },
    sourceId: { type: 'string', example: 'checkout-session-id' },
    paymentMethod: { type: 'string', enum: paymentMethodEnum },
  },
};

const adminConfirmPaymentBody = {
  type: 'object',
  properties: {
    notes: { type: 'string' },
    receivedAmount: { type: 'number', minimum: 0 },
    receivedCurrency: { type: 'string', minLength: 3, maxLength: 3 },
  },
};

export const GetAvailablePaymentMethodsSchema = {
  summary: 'Get available payment methods for a payable source',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  querystring: paymentSourceQuery,
  response: {
    200: { description: 'Available payment methods', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreatePaymentSwaggerSchema = {
  summary: 'Create payment for a payable source',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  body: createPaymentBody,
  response: {
    201: { description: 'Payment initialized', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ChangePaymentMethodSchema = {
  summary: 'Create a replacement payment with a different method',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  body: createPaymentBody,
  response: {
    201: { description: 'Payment method changed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetPaymentsSchema = {
  summary: 'List my payments',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  querystring: paymentListQuery,
  response: {
    200: { description: 'Payments', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetPaymentByIdSchema = {
  summary: 'Get my payment details',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  params: paymentIdParams,
  response: {
    200: { description: 'Payment details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RetryPaymentSchema = {
  summary: 'Retry a gateway payment',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  params: paymentIdParams,
  response: {
    200: { description: 'Payment retry initialized', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UploadPaymentProofSchema = {
  summary: 'Upload manual payment proof',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  consumes: ['multipart/form-data'],
  params: paymentIdParams,
  body: {
    type: 'object',
    required: ['proof'],
    properties: {
      proof: { type: 'string', format: 'binary' },
      transactionReference: { type: 'string' },
      notes: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Payment proof uploaded', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CancelPaymentSwaggerSchema = {
  summary: 'Cancel my pending payment',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  params: paymentIdParams,
  body: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Payment cancelled', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const PaymentWebhookSwaggerSchema = {
  summary: 'Receive payment provider webhook',
  tags: ['Payments'],
  params: {
    type: 'object',
    required: ['providerCode'],
    properties: {
      providerCode: {
        type: 'string',
        enum: ['paystack', 'flutterwave', 'transactworld', 'papss'],
      },
    },
  },
  body: {
    type: 'object',
    required: ['providerReference', 'amount', 'currency', 'status'],
    properties: {
      providerReference: { type: 'string' },
      paymentReference: { type: 'string' },
      amount: { type: 'number' },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      status: { type: 'string', enum: ['success', 'confirmed', 'failed'] },
      failureReason: { type: 'string' },
      eventId: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Webhook processed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminPaymentsSchema = {
  summary: 'List payments for admin review',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: paymentListQuery,
  response: {
    200: { description: 'Admin payment list', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminPaymentByIdSchema = {
  summary: 'Get payment details for admin review',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: paymentIdParams,
  response: {
    200: { description: 'Admin payment details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ReviewPaymentSchema = {
  summary: 'Mark payment proof as under review',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: paymentIdParams,
  response: {
    200: { description: 'Payment moved under review', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ConfirmPaymentSchema = {
  summary: 'Confirm payment',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: paymentIdParams,
  body: adminConfirmPaymentBody,
  response: {
    200: { description: 'Payment confirmed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RejectPaymentSchema = {
  summary: 'Reject manual payment proof',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: paymentIdParams,
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string', minLength: 10 },
      allowResubmission: { type: 'boolean', default: true },
    },
  },
  response: {
    200: { description: 'Payment rejected', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Order schemas ────────────────────────────────────────────────────────────

const orderStatusEnum = [
  'paid',
  'processing',
  'ready_for_shipment',
  'shipped',
  'delivered',
  'received',
  'completed',
  'cancelled',
];

const orderSourceTypeEnum = ['cart', 'direct_rfq', 'market_rfq'];

const orderListQuery = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['incoming', 'outgoing'] },
    status: { type: 'string', enum: orderStatusEnum },
    sourceType: { type: 'string', enum: orderSourceTypeEnum },
    search: { type: 'string' },
    dateFrom: { type: 'string', format: 'date-time' },
    dateTo: { type: 'string', format: 'date-time' },
    lang: LanguageCodeField,
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

const orderIdParams = {
  type: 'object',
  required: ['orderId'],
  properties: {
    orderId: { type: 'string', format: 'uuid' },
  },
};

const orderCancellationParams = {
  type: 'object',
  required: ['orderId', 'cancellationRequestId'],
  properties: {
    orderId: { type: 'string', format: 'uuid' },
    cancellationRequestId: { type: 'string', format: 'uuid' },
  },
};

const orderStatusBody = {
  type: 'object',
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: ['processing', 'ready_for_shipment', 'delivered', 'completed', 'cancelled'],
    },
    notes: { type: 'string' },
    reason: { type: 'string' },
  },
};

const orderCancellationReviewBody = {
  type: 'object',
  properties: {
    notes: { type: 'string' },
  },
};

export const GetOrdersSchema = {
  summary: 'List my incoming and outgoing orders',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  querystring: orderListQuery,
  response: {
    200: { description: 'Orders', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetOrderByIdSwaggerSchema = {
  summary: 'Get my order details',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  response: {
    200: { description: 'Order details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateOrderStatusSwaggerSchema = {
  summary: 'Update seller-controlled order status',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  body: orderStatusBody,
  response: {
    200: { description: 'Order status updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ShipOrderSchema = {
  summary: 'Mark seller-arranged or buyer-arranged order as shipped',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  body: {
    type: 'object',
    properties: {
      providerName: { type: 'string', nullable: true },
      trackingId: { type: 'string', nullable: true },
      trackingUrl: { type: 'string', nullable: true },
      deliveryContact: { type: 'string', nullable: true },
      estimatedDelivery: { type: 'object', additionalProperties: true, nullable: true },
      handoverTo: { type: 'string' },
      handoverReference: { type: 'string', nullable: true },
      notes: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Order marked as shipped', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SubmitBuyerLogisticsSchema = {
  summary: 'Submit buyer-arranged pickup details',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  body: {
    type: 'object',
    required: ['contactName', 'phoneNumber', 'expectedPickupDate'],
    properties: {
      providerName: { type: 'string', nullable: true },
      contactName: { type: 'string' },
      phoneNumber: { type: 'string' },
      email: { type: 'string', format: 'email', nullable: true },
      trackingReference: { type: 'string', nullable: true },
      expectedPickupDate: { type: 'string', format: 'date' },
      notes: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Buyer logistics details submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ConfirmOrderReceiptSchema = {
  summary: 'Confirm order receipt',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  body: {
    type: 'object',
    properties: {
      notes: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Order receipt confirmed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RequestOrderCancellationSchema = {
  summary: 'Request order cancellation',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string', minLength: 3, maxLength: 500 },
      notes: { type: 'string' },
    },
  },
  response: {
    201: { description: 'Cancellation request submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminOrdersSchema = {
  summary: 'List orders for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: orderListQuery,
  response: {
    200: { description: 'Admin orders', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminOrderByIdSchema = {
  summary: 'Get order details for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  response: {
    200: { description: 'Admin order details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const AdminUpdateOrderStatusSchema = {
  summary: 'Admin update order status',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  body: orderStatusBody,
  response: {
    200: { description: 'Order status updated by admin', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ApproveOrderCancellationSchema = {
  summary: 'Approve order cancellation request',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: orderCancellationParams,
  body: orderCancellationReviewBody,
  response: {
    200: { description: 'Order cancellation approved', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RejectOrderCancellationSchema = {
  summary: 'Reject order cancellation request',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: orderCancellationParams,
  body: orderCancellationReviewBody,
  response: {
    200: { description: 'Order cancellation rejected', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Direct RFQ schemas ───────────────────────────────────────────────────────

const directRfqStatusEnum = [
  'open',
  'viewed',
  'quoted',
  'negotiating',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
];

const directRfqDeliveryTypeEnum = [
  'integrated_logistics',
  'seller_arranged',
  'buyer_arranged',
  'b2b_logistics',
];

const directRfqIdParams = {
  type: 'object',
  required: ['rfqId'],
  properties: {
    rfqId: { type: 'string', format: 'uuid' },
  },
};

const directRfqQuoteParams = {
  type: 'object',
  required: ['rfqId', 'quoteId'],
  properties: {
    rfqId: { type: 'string', format: 'uuid' },
    quoteId: { type: 'string', format: 'uuid' },
  },
};

const directRfqQuoteTermsBody = {
  type: 'object',
  required: ['quantity', 'unit', 'pricePerUnit', 'currency', 'delivery', 'validUntil'],
  properties: {
    quantity: { type: 'number', minimum: 0 },
    unit: { type: 'string', example: 'kg' },
    pricePerUnit: { type: 'number', minimum: 0 },
    currency: { type: 'string', example: 'USD' },
    delivery: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: directRfqDeliveryTypeEnum },
        logisticsAmount: { type: 'number', nullable: true },
      },
    },
    estimatedDeliveryDate: { type: 'string', format: 'date', nullable: true },
    expectedDeliveryDate: { type: 'string', format: 'date', nullable: true },
    validUntil: { type: 'string', format: 'date-time' },
    message: { type: 'string', nullable: true },
  },
};

const directRfqQuery = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['incoming', 'outgoing'] },
    status: { type: 'string', enum: directRfqStatusEnum },
    search: { type: 'string' },
    dateFrom: { type: 'string', format: 'date-time' },
    dateTo: { type: 'string', format: 'date-time' },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

export const GetDirectRFQsSchema = {
  summary: 'List my Direct RFQs',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  querystring: { ...directRfqQuery, properties: { ...directRfqQuery.properties, lang: LanguageCodeField } },
  response: {
    200: { description: 'Direct RFQs', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateDirectRFQSchema = {
  summary: 'Create Direct RFQ for one seller product',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['productId', 'quantity', 'unit', 'description', 'deliveryAddressId', 'deliveryType'],
    properties: {
      productId: { type: 'string', format: 'uuid' },
      variantId: { type: 'string', format: 'uuid', nullable: true },
      quantity: { type: 'number', minimum: 0 },
      unit: { type: 'string', example: 'kg' },
      description: LocalizedTextField,
      sourceLanguage: { ...LanguageCodeField, default: 'en' },
      expectedDeliveryDate: { type: 'string', format: 'date', nullable: true },
      deliveryAddressId: { type: 'string', format: 'uuid' },
      deliveryType: { type: 'string', enum: directRfqDeliveryTypeEnum },
      currencyPreference: { type: 'string', nullable: true, example: 'USD' },
      buyerNotes: { anyOf: [LocalizedTextField, { type: 'null' }] },
    },
  },
  response: {
    201: { description: 'Direct RFQ created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetDirectRFQByIdSchema = {
  summary: 'Get Direct RFQ detail',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: directRfqIdParams,
  querystring: LanguageQuery,
  response: {
    200: { description: 'Direct RFQ detail', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateDirectRFQQuoteSwaggerSchema = {
  summary: 'Seller submits Direct RFQ quotation',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: directRfqIdParams,
  body: directRfqQuoteTermsBody,
  response: {
    201: { description: 'Quotation submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetDirectRFQQuoteSchema = {
  summary: 'Get Direct RFQ quote and version history',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: directRfqQuoteParams,
  response: {
    200: { description: 'Direct RFQ quote detail', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SubmitDirectRFQCounterOfferSwaggerSchema = {
  summary: 'Submit Direct RFQ counter-offer',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: directRfqQuoteParams,
  body: directRfqQuoteTermsBody,
  response: {
    201: { description: 'Counter-offer submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const AcceptDirectRFQQuoteSwaggerSchema = {
  summary: 'Accept current seller-generated Direct RFQ quote version',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: directRfqQuoteParams,
  body: {
    type: 'object',
    required: ['quoteVersionId'],
    properties: {
      quoteVersionId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: { description: 'Quotation accepted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RejectDirectRFQQuoteSwaggerSchema = {
  summary: 'Reject Direct RFQ quotation',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: directRfqQuoteParams,
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Quotation rejected', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CancelDirectRFQSwaggerSchema = {
  summary: 'Cancel Direct RFQ before acceptance',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: directRfqIdParams,
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string' },
    },
  },
  response: {
    200: { description: 'RFQ cancelled', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminDirectRFQsSchema = {
  summary: 'List Direct RFQs for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: directRfqStatusEnum },
      buyerId: { type: 'string', format: 'uuid' },
      sellerId: { type: 'string', format: 'uuid' },
      productId: { type: 'string', format: 'uuid' },
      deliveryType: { type: 'string', enum: directRfqDeliveryTypeEnum },
      currency: { type: 'string' },
      search: { type: 'string' },
      dateFrom: { type: 'string', format: 'date-time' },
      dateTo: { type: 'string', format: 'date-time' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Admin Direct RFQs', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminDirectRFQByIdSchema = {
  summary: 'Get Direct RFQ detail for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: directRfqIdParams,
  response: {
    200: { description: 'Admin Direct RFQ detail', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Market RFQ schemas ───────────────────────────────────────────────────────

const marketRfqStatusEnum = [
  'open',
  'quoted',
  'negotiating',
  'awarded',
  'cancelled',
  'expired',
];

const marketRfqQuoteStatusEnum = [
  'active',
  'accepted',
  'rejected',
  'expired',
  'closed',
];

const marketRfqDeliveryTypeEnum = directRfqDeliveryTypeEnum;

const marketRfqIdParams = {
  type: 'object',
  required: ['rfqId'],
  properties: {
    rfqId: { type: 'string', format: 'uuid' },
  },
};

const marketRfqQuoteParams = {
  type: 'object',
  required: ['rfqId', 'quoteId'],
  properties: {
    rfqId: { type: 'string', format: 'uuid' },
    quoteId: { type: 'string', format: 'uuid' },
  },
};

const marketRfqTranslationInput = {
  oneOf: [
    { type: 'string' },
    {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  ],
};

const marketRfqQuoteTermsBody = {
  type: 'object',
  required: ['quantity', 'unit', 'pricePerUnit', 'currency', 'delivery', 'validUntil'],
  properties: {
    quantity: { type: 'number', minimum: 0 },
    unit: { type: 'string', example: 'tonnes' },
    pricePerUnit: { type: 'number', minimum: 0 },
    currency: { type: 'string', example: 'USD' },
    delivery: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: marketRfqDeliveryTypeEnum },
        logisticsAmount: { type: 'number', nullable: true },
      },
    },
    estimatedDeliveryDate: { type: 'string', format: 'date', nullable: true },
    expectedDeliveryDate: { type: 'string', format: 'date', nullable: true },
    validUntil: { type: 'string', format: 'date-time' },
    message: { type: 'string', nullable: true },
  },
};

const marketRfqQuery = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: marketRfqStatusEnum },
    search: { type: 'string' },
    dateFrom: { type: 'string', format: 'date-time' },
    dateTo: { type: 'string', format: 'date-time' },
    lang: LanguageCodeField,
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

export const GetMarketRFQsSchema = {
  summary: 'List Market RFQs created by the buyer',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  querystring: marketRfqQuery,
  response: {
    200: { description: 'Buyer Market RFQs', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateMarketRFQSchema = {
  summary: 'Create Market RFQ for multiple eligible sellers',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: [
      'categoryIds',
      'requirementTitle',
      'description',
      'quantity',
      'unit',
      'deliveryAddressId',
      'deliveryType',
      'submissionDeadline',
    ],
    properties: {
      productId: { type: 'string', format: 'uuid', nullable: true },
      variantId: { type: 'string', format: 'uuid', nullable: true },
      categoryIds: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: { type: 'string', format: 'uuid' },
      },
      requirementTitle: marketRfqTranslationInput,
      description: marketRfqTranslationInput,
      sourceLanguage: { ...LanguageCodeField, default: 'en' },
      quantity: { type: 'number', minimum: 0 },
      unit: { type: 'string', example: 'tonnes' },
      expectedDeliveryDate: { type: 'string', format: 'date', nullable: true },
      deliveryAddressId: { type: 'string', format: 'uuid' },
      deliveryType: { type: 'string', enum: marketRfqDeliveryTypeEnum },
      currencyPreference: { type: 'string', nullable: true, example: 'USD' },
      submissionDeadline: { type: 'string', format: 'date-time' },
      buyerNotes: { anyOf: [LocalizedTextField, { type: 'null' }] },
    },
  },
  response: {
    201: { description: 'Market RFQ created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAvailableMarketRFQsSchema = {
  summary: 'List available Market RFQs for an eligible seller',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      categoryId: { type: 'string', format: 'uuid' },
      deliveryCountry: { type: 'string' },
      deliveryType: { type: 'string', enum: marketRfqDeliveryTypeEnum },
      search: { type: 'string' },
      dateFrom: { type: 'string', format: 'date-time' },
      dateTo: { type: 'string', format: 'date-time' },
      sortBy: {
        type: 'string',
        enum: ['ranking', 'newest', 'deadline_soonest'],
        default: 'ranking',
      },
      lang: LanguageCodeField,
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Available Market RFQs', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetMyMarketRFQResponsesSchema = {
  summary: 'List seller Market RFQ responses',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      quoteStatus: { type: 'string', enum: marketRfqQuoteStatusEnum },
      rfqStatus: { type: 'string', enum: marketRfqStatusEnum },
      search: { type: 'string' },
      lang: LanguageCodeField,
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Seller Market RFQ responses', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetMarketRFQByIdSchema = {
  summary: 'Get Market RFQ detail',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: marketRfqIdParams,
  querystring: LanguageQuery,
  response: {
    200: { description: 'Market RFQ detail', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateMarketRFQQuoteSwaggerSchema = {
  summary: 'Seller submits Market RFQ quotation',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: marketRfqIdParams,
  body: marketRfqQuoteTermsBody,
  response: {
    201: { description: 'Market RFQ quotation submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetMarketRFQQuotesSchema = {
  summary: 'Buyer compares Market RFQ quotations',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: marketRfqIdParams,
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: marketRfqQuoteStatusEnum },
      currency: { type: 'string' },
      sortBy: {
        type: 'string',
        enum: ['lowest_total', 'highest_rating', 'earliest_delivery', 'latest'],
        default: 'latest',
      },
      lang: LanguageCodeField,
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Market RFQ quote comparison', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetMarketRFQQuoteSchema = {
  summary: 'Get Market RFQ quote and private negotiation history',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: marketRfqQuoteParams,
  querystring: LanguageQuery,
  response: {
    200: { description: 'Market RFQ quote detail', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SubmitMarketRFQCounterOfferSwaggerSchema = {
  summary: 'Submit seller-specific Market RFQ counter-offer',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: marketRfqQuoteParams,
  body: marketRfqQuoteTermsBody,
  response: {
    201: { description: 'Market RFQ counter-offer submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const AcceptMarketRFQQuoteSwaggerSchema = {
  summary: 'Award Market RFQ to the current valid seller-generated quote version',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: marketRfqQuoteParams,
  body: {
    type: 'object',
    required: ['quoteVersionId'],
    properties: {
      quoteVersionId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: { description: 'Market RFQ awarded', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RejectMarketRFQQuoteSwaggerSchema = {
  summary: 'Buyer rejects one Market RFQ quotation',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: marketRfqQuoteParams,
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Market RFQ quotation rejected', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CancelMarketRFQSwaggerSchema = {
  summary: 'Cancel Market RFQ before award',
  tags: ['RFQs'],
  security: [{ bearerAuth: [] }],
  params: marketRfqIdParams,
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Market RFQ cancelled', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminMarketRFQsSchema = {
  summary: 'List Market RFQs for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: marketRfqStatusEnum },
      buyerId: { type: 'string', format: 'uuid' },
      categoryId: { type: 'string', format: 'uuid' },
      deliveryType: { type: 'string', enum: marketRfqDeliveryTypeEnum },
      awardedSellerId: { type: 'string', format: 'uuid' },
      search: { type: 'string' },
      dateFrom: { type: 'string', format: 'date-time' },
      dateTo: { type: 'string', format: 'date-time' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Admin Market RFQs', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminMarketRFQByIdSchema = {
  summary: 'Get Market RFQ detail for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: marketRfqIdParams,
  response: {
    200: { description: 'Admin Market RFQ detail', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Logistics schemas ────────────────────────────────────────────────────────

const shipmentStatusEnum = [
  'pending',
  'shipment_created',
  'awaiting_pickup',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'cancelled',
];

const logisticsAddressSchema = {
  type: 'object',
  required: ['country'],
  properties: {
    recipientName: { type: 'string' },
    phoneNumber: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: 'string', nullable: true },
    city: { type: 'string' },
    state: { type: 'string' },
    country: { type: 'string' },
    postalCode: { type: 'string', nullable: true },
  },
  additionalProperties: true,
};

export const CreateLogisticsQuoteSwaggerSchema = {
  summary: 'Create integrated logistics quotes',
  tags: ['Logistics'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['sellerId', 'deliveryAddressId', 'items'],
    properties: {
      sellerId: { type: 'string', format: 'uuid' },
      deliveryAddressId: { type: 'string', format: 'uuid' },
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['productId', 'quantity'],
          properties: {
            productId: { type: 'string', format: 'uuid' },
            variantId: { type: 'string', format: 'uuid', nullable: true },
            quantity: { type: 'number', minimum: 0 },
          },
        },
      },
    },
  },
  response: {
    201: { description: 'Logistics quotes', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateB2BLogisticsRequestSwaggerSchema = {
  summary: 'Create B2B logistics request',
  tags: ['Logistics'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['cargoType', 'quantity', 'unit', 'pickupAddress', 'deliveryAddress'],
    properties: {
      sourceType: { type: 'string', enum: ['direct_rfq', 'market_rfq', 'other'], default: 'other' },
      sourceId: { type: 'string', nullable: true },
      cargoType: { type: 'string' },
      quantity: { type: 'number', minimum: 0 },
      unit: { type: 'string' },
      weight: { type: 'number', nullable: true },
      weightUnit: { type: 'string', nullable: true },
      volume: { type: 'number', nullable: true },
      volumeUnit: { type: 'string', nullable: true },
      pickupAddress: logisticsAddressSchema,
      deliveryAddress: logisticsAddressSchema,
      specialInstructions: { type: 'string', nullable: true },
    },
  },
  response: {
    201: { description: 'B2B logistics request created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const LogisticsWebhookSwaggerSchema = {
  summary: 'Receive logistics provider webhook',
  tags: ['Logistics'],
  params: {
    type: 'object',
    required: ['providerCode'],
    properties: {
      providerCode: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      providerEventId: { type: 'string' },
      eventId: { type: 'string' },
      externalShipmentId: { type: 'string' },
      trackingId: { type: 'string' },
      shipmentReference: { type: 'string' },
      status: {
        type: 'string',
        enum: [
          ...shipmentStatusEnum,
          'created',
          'ready_for_pickup',
          'pickup',
          'transit',
          'failed',
          'canceled',
        ],
      },
      description: { type: 'string' },
      location: { type: 'string' },
      failureReason: { type: 'string' },
      occurredAt: { type: 'string', format: 'date-time' },
    },
  },
  response: {
    200: { description: 'Webhook processed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetPublicLogisticsTrackingSwaggerSchema = {
  summary: 'Get public shipment tracking by tracking ID',
  tags: ['Logistics'],
  params: {
    type: 'object',
    required: ['trackingId'],
    properties: {
      trackingId: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Shipment tracking details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetOrderDeliverySwaggerSchema = {
  summary: 'Get order delivery details',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  response: {
    200: { description: 'Order delivery details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetOrderTrackingSwaggerSchema = {
  summary: 'Get order delivery tracking',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  response: {
    200: { description: 'Order tracking details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateOrderShipmentSwaggerSchema = {
  summary: 'Create integrated provider shipment for an order',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  body: {
    type: 'object',
    properties: {
      notes: { type: 'string' },
    },
  },
  response: {
    201: { description: 'Provider shipment created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CancelOrderShipmentSwaggerSchema = {
  summary: 'Cancel integrated provider shipment without cancelling the order',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  params: orderIdParams,
  body: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
    },
  },
  response: {
    200: { description: 'Provider shipment cancelled', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminLogisticsProvidersSchema = {
  summary: 'List logistics providers for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Logistics providers', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateLogisticsProviderStatusSchema = {
  summary: 'Update logistics provider status',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['providerId'],
    properties: {
      providerId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['active', 'inactive'] },
    },
  },
  response: {
    200: { description: 'Provider status updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminLogisticsShipmentsSchema = {
  summary: 'List logistics shipments for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: shipmentStatusEnum },
      providerId: { type: 'string', format: 'uuid' },
      orderId: { type: 'string', format: 'uuid' },
      search: { type: 'string' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Logistics shipments', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Subscription schemas ────────────────────────────────────────────────────

const subscriptionPlanPriceInput = {
  type: 'object',
  required: ['currency', 'amount', 'billingPeriod'],
  properties: {
    currency: { type: 'string', minLength: 3, maxLength: 3, example: 'NGN' },
    amount: { type: 'number', minimum: 0, example: 25000 },
    billingPeriod: {
      type: 'string',
      enum: ['free', 'monthly', 'quarterly', 'yearly'],
      example: 'monthly',
    },
    status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
  },
};

const subscriptionPlanBody = {
  type: 'object',
  required: ['name', 'prices'],
  properties: {
    name: LocalizedTextField,
    description: { anyOf: [LocalizedTextField, { type: 'null' }] },
    sourceLanguage: { ...LanguageCodeField, default: 'en' },
    audience: { type: 'string', enum: ['seller', 'buyer', 'all'], default: 'seller' },
    status: {
      type: 'string',
      enum: ['draft', 'active', 'inactive', 'archived'],
      default: 'draft',
    },
    isFree: { type: 'boolean', default: false },
    isDefault: { type: 'boolean', default: false },
    displayOrder: { type: 'integer', minimum: 0, default: 0 },
    prices: {
      type: 'array',
      minItems: 1,
      items: subscriptionPlanPriceInput,
    },
    entitlements: {
      type: 'object',
      additionalProperties: {
        anyOf: [
          { type: 'boolean' },
          { type: 'number' },
          { type: 'string' },
          { type: 'null' },
        ],
      },
      example: {
        max_products: 50,
        max_images_per_product: 8,
        can_view_market_rfqs: true,
        max_market_rfq_responses: 25,
        transaction_fee_percentage: 2.5,
      },
    },
  },
};

const planIdParams = {
  type: 'object',
  required: ['planId'],
  properties: {
    planId: { type: 'string', format: 'uuid' },
  },
};

const subscriptionIdParams = {
  type: 'object',
  required: ['subscriptionId'],
  properties: {
    subscriptionId: { type: 'string', format: 'uuid' },
  },
};

const subscriptionPlanQuery = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['draft', 'active', 'inactive', 'archived'] },
    audience: { type: 'string', enum: ['seller', 'buyer', 'all'] },
    isFree: { type: 'boolean' },
    search: { type: 'string' },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

export const GetPublicSubscriptionPlansSwaggerSchema = {
  security: OptionalBearerAuth,
  summary: 'List active subscription plans',
  tags: ['Subscriptions'],
  querystring: {
    type: 'object',
    properties: {
      audience: { type: 'string', enum: ['seller', 'buyer', 'all'] },
      isFree: { type: 'boolean' },
      lang: LanguageCodeField,
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Active subscription plans', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetPublicSubscriptionPlanByIdSwaggerSchema = {
  security: OptionalBearerAuth,
  summary: 'Get active subscription plan details',
  tags: ['Subscriptions'],
  params: planIdParams,
  querystring: {
    type: 'object',
    properties: {
      lang: LanguageCodeField,
    },
  },
  response: {
    200: { description: 'Subscription plan details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateSubscriptionSwaggerSchema = {
  summary: 'Subscribe to a plan',
  tags: ['Subscriptions'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['planId'],
    properties: {
      planId: { type: 'string', format: 'uuid' },
      priceId: { type: 'string', format: 'uuid' },
      paymentMethod: {
        type: 'string',
        enum: [
          'direct_bank_transfer',
          'paystack',
          'flutterwave',
          'papss',
          'transactworld',
          'telegraphic_transfer',
          'letter_of_credit',
        ],
      },
    },
  },
  response: {
    201: { description: 'Subscription created or payment initialized', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetCurrentSubscriptionSwaggerSchema = {
  summary: 'Get current subscription',
  tags: ['Subscriptions'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      lang: LanguageCodeField,
    },
  },
  response: {
    200: { description: 'Current subscription', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RenewSubscriptionSwaggerSchema = {
  summary: 'Renew a subscription',
  tags: ['Subscriptions'],
  security: [{ bearerAuth: [] }],
  params: subscriptionIdParams,
  querystring: LanguageQuery,
  body: {
    type: 'object',
    properties: {
      priceId: { type: 'string', format: 'uuid' },
      paymentMethod: {
        type: 'string',
        enum: [
          'direct_bank_transfer',
          'paystack',
          'flutterwave',
          'papss',
          'transactworld',
          'telegraphic_transfer',
          'letter_of_credit',
        ],
      },
    },
  },
  response: {
    200: { description: 'Subscription renewal initialized', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateSubscriptionAutoRenewSwaggerSchema = {
  summary: 'Update subscription auto-renew',
  tags: ['Subscriptions'],
  security: [{ bearerAuth: [] }],
  params: subscriptionIdParams,
  querystring: LanguageQuery,
  body: {
    type: 'object',
    required: ['autoRenew'],
    properties: {
      autoRenew: { type: 'boolean' },
    },
  },
  response: {
    200: { description: 'Auto-renew updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetSubscriptionHistorySwaggerSchema = {
  summary: 'List subscription history',
  tags: ['Subscriptions'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'active', 'expired', 'cancelled'] },
      lang: LanguageCodeField,
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Subscription history', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateSubscriptionPlanSwaggerSchema = {
  summary: 'Create subscription plan',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: subscriptionPlanBody,
  response: {
    201: { description: 'Subscription plan created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminSubscriptionPlansSwaggerSchema = {
  summary: 'List subscription plans for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: subscriptionPlanQuery,
  response: {
    200: { description: 'Subscription plans', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminSubscriptionPlanByIdSwaggerSchema = {
  summary: 'Get subscription plan details for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: planIdParams,
  response: {
    200: { description: 'Subscription plan details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateSubscriptionPlanSwaggerSchema = {
  summary: 'Update subscription plan',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: planIdParams,
  body: {
    ...subscriptionPlanBody,
    required: [],
  },
  response: {
    200: { description: 'Subscription plan updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateSubscriptionPlanStatusSwaggerSchema = {
  summary: 'Update subscription plan status',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: planIdParams,
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['draft', 'active', 'inactive', 'archived'] },
    },
  },
  response: {
    200: { description: 'Subscription plan status updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminSubscriptionsSwaggerSchema = {
  summary: 'List subscriptions for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      planId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['pending', 'active', 'expired', 'cancelled'] },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Subscriptions', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminSubscriptionByIdSwaggerSchema = {
  summary: 'Get subscription details for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: subscriptionIdParams,
  response: {
    200: { description: 'Subscription details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Reviews, Ratings & Rewards schemas ─────────────────────────────────────

const reviewIdParams = {
  type: 'object',
  required: ['reviewId'],
  properties: {
    reviewId: { type: 'string', format: 'uuid' },
  },
};

const responseIdParams = {
  type: 'object',
  required: ['responseId'],
  properties: {
    responseId: { type: 'string', format: 'uuid' },
  },
};

const reviewOrderIdParams = {
  type: 'object',
  required: ['orderId'],
  properties: {
    orderId: { type: 'string', format: 'uuid' },
  },
};

const productReviewBody = {
  type: 'object',
  required: ['eligibilityId', 'rating', 'comment'],
  properties: {
    eligibilityId: { type: 'string', format: 'uuid' },
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    title: { type: 'string', maxLength: 160, nullable: true },
    comment: { type: 'string', maxLength: 3000 },
    images: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string' },
      default: [],
    },
  },
};

const sellerReviewBody = {
  type: 'object',
  required: ['eligibilityId', 'overallRating', 'comment'],
  properties: {
    eligibilityId: { type: 'string', format: 'uuid' },
    overallRating: { type: 'integer', minimum: 1, maximum: 5 },
    communicationRating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
    fulfillmentRating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
    reliabilityRating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
    comment: { type: 'string', maxLength: 3000 },
  },
};

const reviewListQuery = {
  type: 'object',
  properties: {
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    withImages: { type: 'boolean' },
    sortBy: {
      type: 'string',
      enum: ['latest', 'highest_rating', 'lowest_rating', 'most_helpful'],
      default: 'latest',
    },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

const reviewStatusQuery = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['product', 'seller'] },
    status: {
      type: 'string',
      enum: ['published', 'pending_moderation', 'hidden', 'rejected', 'deleted'],
    },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

export const GetReviewEligibilitySwaggerSchema = {
  summary: 'List my review eligibility',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['eligible', 'submitted', 'expired', 'revoked'] },
      orderId: { type: 'string', format: 'uuid' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Review eligibility records', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetOrderReviewEligibilitySwaggerSchema = {
  summary: 'List review eligibility for an order',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: reviewOrderIdParams,
  response: {
    200: { description: 'Order review eligibility records', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SubmitProductReviewSwaggerSchema = {
  summary: 'Submit a product review',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  body: productReviewBody,
  response: {
    201: { description: 'Product review submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SubmitSellerReviewSwaggerSchema = {
  summary: 'Submit a seller review',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  body: sellerReviewBody,
  response: {
    201: { description: 'Seller review submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SubmitBatchOrderReviewSwaggerSchema = {
  summary: 'Submit multiple reviews for an order',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: reviewOrderIdParams,
  body: {
    type: 'object',
    properties: {
      productReviews: {
        type: 'array',
        items: productReviewBody,
        default: [],
      },
      sellerReview: sellerReviewBody,
    },
  },
  response: {
    201: { description: 'Order reviews submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetMyReviewsSwaggerSchema = {
  summary: 'List my submitted reviews',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  querystring: reviewStatusQuery,
  response: {
    200: { description: 'My reviews', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateProductReviewSwaggerSchema = {
  summary: 'Update my product review',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: reviewIdParams,
  body: {
    ...productReviewBody,
    properties: Object.fromEntries(Object.entries(productReviewBody.properties).filter(([key]) => key !== 'eligibilityId')),
    required: [],
  },
  response: {
    200: { description: 'Product review updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateSellerReviewSwaggerSchema = {
  summary: 'Update my seller review',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: reviewIdParams,
  body: {
    ...sellerReviewBody,
    properties: Object.fromEntries(Object.entries(sellerReviewBody.properties).filter(([key]) => key !== 'eligibilityId')),
    required: [],
  },
  response: {
    200: { description: 'Seller review updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const DeleteProductReviewSwaggerSchema = {
  summary: 'Delete my product review',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: reviewIdParams,
  response: {
    200: { description: 'Product review deleted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const DeleteSellerReviewSwaggerSchema = {
  summary: 'Delete my seller review',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: reviewIdParams,
  response: {
    200: { description: 'Seller review deleted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const VoteProductReviewSwaggerSchema = {
  summary: 'Vote on a product review',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: reviewIdParams,
  body: {
    type: 'object',
    required: ['vote'],
    properties: {
      vote: { type: 'string', enum: ['helpful', 'not_helpful'] },
    },
  },
  response: {
    200: { description: 'Review vote recorded', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RemoveProductReviewVoteSwaggerSchema = {
  summary: 'Remove my product review vote',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: reviewIdParams,
  response: {
    200: { description: 'Review vote removed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const VoteSellerReviewSwaggerSchema = {
  ...VoteProductReviewSwaggerSchema,
  summary: 'Vote on a seller review',
};

export const RemoveSellerReviewVoteSwaggerSchema = {
  ...RemoveProductReviewVoteSwaggerSchema,
  summary: 'Remove my seller review vote',
};

export const UploadReviewImageSwaggerSchema = {
  summary: 'Upload a review image',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
    required: ['image'],
    properties: {
      image: { type: 'string', format: 'binary' },
    },
  },
  response: {
    200: { description: 'Review image uploaded', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const AddProductReviewResponseSwaggerSchema = {
  summary: 'Add seller response to a product review',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: reviewIdParams,
  body: {
    type: 'object',
    required: ['comment'],
    properties: {
      comment: { type: 'string', maxLength: 1000 },
    },
  },
  response: {
    201: { description: 'Review response created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const AddSellerReviewResponseSwaggerSchema = {
  ...AddProductReviewResponseSwaggerSchema,
  summary: 'Add seller response to a seller review',
};

export const UpdateReviewResponseSwaggerSchema = {
  summary: 'Update my seller review response',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  params: responseIdParams,
  body: {
    type: 'object',
    required: ['comment'],
    properties: {
      comment: { type: 'string', maxLength: 1000 },
    },
  },
  response: {
    200: { description: 'Review response updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetProductReviewsSwaggerSchema = {
  summary: 'List product reviews',
  tags: ['Reviews'],
  params: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId: { type: 'string', format: 'uuid' },
    },
  },
  querystring: reviewListQuery,
  response: {
    200: { description: 'Product reviews', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetSellerReviewsSwaggerSchema = {
  summary: 'List seller reviews',
  tags: ['Reviews'],
  params: {
    type: 'object',
    required: ['sellerId'],
    properties: {
      sellerId: { type: 'string', format: 'uuid' },
    },
  },
  querystring: reviewListQuery,
  response: {
    200: { description: 'Seller reviews', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetRewardPointsSwaggerSchema = {
  summary: 'Get my points balance',
  tags: ['Rewards'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Reward points balance', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetRewardPointsHistorySwaggerSchema = {
  summary: 'List my points history',
  tags: ['Rewards'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['earned', 'redeemed', 'adjusted', 'expired', 'reversed'] },
      sourceType: {
        type: 'string',
        enum: ['product_review', 'seller_review', 'admin_adjustment', 'referral'],
      },
      dateFrom: { type: 'string', format: 'date-time' },
      dateTo: { type: 'string', format: 'date-time' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Reward points history', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminReviewsSwaggerSchema = {
  summary: 'List reviews for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      ...reviewStatusQuery.properties,
      buyerId: { type: 'string', format: 'uuid' },
      sellerId: { type: 'string', format: 'uuid' },
      productId: { type: 'string', format: 'uuid' },
      rating: { type: 'integer', minimum: 1, maximum: 5 },
      search: { type: 'string' },
      dateFrom: { type: 'string', format: 'date-time' },
      dateTo: { type: 'string', format: 'date-time' },
    },
  },
  response: {
    200: { description: 'Admin review list', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminReviewByIdSwaggerSchema = {
  summary: 'Get review details for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['reviewType', 'reviewId'],
    properties: {
      reviewType: { type: 'string', enum: ['product', 'seller'] },
      reviewId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: { description: 'Admin review details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ModerateReviewSwaggerSchema = {
  summary: 'Moderate a review',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: GetAdminReviewByIdSwaggerSchema.params,
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: {
        type: 'string',
        enum: ['published', 'pending_moderation', 'hidden', 'rejected'],
      },
      reason: { type: 'string', maxLength: 1000 },
    },
  },
  response: {
    200: { description: 'Review status updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetRewardSettingsSwaggerSchema = {
  summary: 'Get reward settings',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Reward settings', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateRewardSettingsSwaggerSchema = {
  summary: 'Update review eligibility and image bonus settings',
  description: 'Review base points are configured through the REVIEW_SUBMITTED rule at /admin/reward-rules. Product and seller review base settings can no longer be updated here.',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      reviewWithImageBonus: { type: 'integer', minimum: 0 },
      minimumReviewCharacters: { type: 'integer', minimum: 0 },
      maxReviewRewardPerOrder: { type: 'integer', minimum: 0 },
      reviewSubmissionWindowDays: { type: 'integer', minimum: 0 },
      reviewReminderDays: { type: 'integer', minimum: 0 },
      maxReviewImages: { type: 'integer', minimum: 0 },
    },
  },
  response: {
    200: { description: 'Reward settings updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const AdjustUserPointsSwaggerSchema = {
  summary: 'Adjust user reward points (legacy signed-points endpoint)',
  description: 'Requires rewards.adjust. Prefer POST /admin/rewards/adjust. Reuse Idempotency-Key only when retrying the same request.',
  deprecated: true,
  headers: {type:'object',required:['idempotency-key'],properties:{'idempotency-key':{type:'string',pattern:'^[A-Za-z0-9_-]{8,100}$'}}},
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['userId', 'points', 'reason'],
    properties: {
      userId: { type: 'string', format: 'uuid' },
      points: { type: 'integer' },
      reason: { type: 'string', maxLength: 255 },
    },
  },
  response: {
    200: { description: 'User points adjusted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

const disputeStatusEnum = [
  'open',
  'under_review',
  'awaiting_buyer',
  'awaiting_seller',
  'resolved',
  'closed',
];

const disputeRaisedByTypeEnum = ['buyer', 'seller'];

const disputeResolutionTypeEnum = [
  'buyer_favour',
  'seller_favour',
  'partial_resolution',
  'mutual_resolution',
  'no_action',
];

const disputeIdParams = {
  type: 'object',
  required: ['disputeId'],
  properties: {
    disputeId: { type: 'string', format: 'uuid' },
  },
};

const disputeEvidenceReferenceBody = {
  oneOf: [
    { type: 'string', format: 'uuid' },
    {
      type: 'object',
      required: ['fileId'],
      properties: {
        fileId: { type: 'string', format: 'uuid' },
        description: { type: 'string', maxLength: 500, nullable: true },
      },
    },
  ],
};

const disputedItemBody = {
  type: 'object',
  required: ['orderItemId', 'quantityAffected'],
  properties: {
    orderItemId: { type: 'string', format: 'uuid' },
    quantityAffected: { type: 'number', exclusiveMinimum: 0 },
  },
};

const disputeListQuery = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: disputeStatusEnum },
    dateFrom: { type: 'string', format: 'date-time' },
    dateTo: { type: 'string', format: 'date-time' },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

const adminDisputeListQuery = {
  type: 'object',
  properties: {
    ...disputeListQuery.properties,
    search: { type: 'string', maxLength: 120 },
    reason: { type: 'string', maxLength: 160 },
    raisedByType: { type: 'string', enum: disputeRaisedByTypeEnum },
    buyerId: { type: 'string', format: 'uuid' },
    sellerId: { type: 'string', format: 'uuid' },
    assignedAdminId: { type: 'string', format: 'uuid' },
  },
};

const disputeFinancialActionBody = {
  oneOf: [
    {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['none'] },
      },
    },
    {
      type: 'object',
      required: ['type', 'amount', 'currency'],
      properties: {
        type: { type: 'string', enum: ['refund'] },
        amount: { type: 'number', exclusiveMinimum: 0 },
        currency: { type: 'string', minLength: 3, maxLength: 3, example: 'NGN' },
      },
    },
    {
      type: 'object',
      required: ['type', 'amount', 'currency'],
      properties: {
        type: { type: 'string', enum: ['partial_refund'] },
        amount: { type: 'number', exclusiveMinimum: 0 },
        currency: { type: 'string', minLength: 3, maxLength: 3, example: 'NGN' },
      },
    },
  ],
};

export const UploadDisputeEvidenceSwaggerSchema = {
  summary: 'Upload dispute evidence for later attachment',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary' },
    },
  },
  response: {
    200: { description: 'Dispute evidence upload record', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateDisputeSwaggerSchema = {
  summary: 'Create a dispute for an affected seller order',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['sellerOrderId', 'reason', 'description'],
    properties: {
      returnId: { type: 'string', format: 'uuid', description: 'Optional return from this seller order being escalated.' },
      sellerOrderId: { type: 'string', format: 'uuid' },
      reason: {
        type: 'string',
        maxLength: 160,
        example: 'Product significantly different from description',
      },
      description: { type: 'string', minLength: 10, maxLength: 5000 },
      disputedItems: {
        type: 'array',
        maxItems: 100,
        items: disputedItemBody,
      },
      evidence: {
        type: 'array',
        maxItems: 10,
        items: disputeEvidenceReferenceBody,
      },
    },
  },
  response: {
    201: { description: 'Dispute submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetDisputesSwaggerSchema = {
  summary: 'List my disputes',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  querystring: disputeListQuery,
  response: {
    200: { description: 'My disputes', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetDisputeByIdSwaggerSchema = {
  summary: 'Get my dispute details',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  params: disputeIdParams,
  response: {
    200: { description: 'Dispute details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SendDisputeMessageSwaggerSchema = {
  summary: 'Respond to a dispute',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  params: disputeIdParams,
  body: {
    type: 'object',
    required: ['message'],
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 5000 },
      attachments: {
        type: 'array',
        maxItems: 5,
        items: disputeEvidenceReferenceBody,
      },
    },
  },
  response: {
    201: { description: 'Dispute response submitted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminDisputesSwaggerSchema = {
  summary: 'List disputes for admin review',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  querystring: adminDisputeListQuery,
  response: {
    200: { description: 'Admin dispute list', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminDisputeMetricsSwaggerSchema = {
  summary: 'Get admin dispute dashboard metrics',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Dispute dashboard metrics', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminDisputeByIdSwaggerSchema = {
  summary: 'Get dispute details for admin',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  params: disputeIdParams,
  response: {
    200: { description: 'Admin dispute details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const AssignDisputeSwaggerSchema = {
  summary: 'Assign a dispute to an admin',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  params: disputeIdParams,
  body: {
    type: 'object',
    required: ['adminId'],
    properties: {
      adminId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: { description: 'Dispute assigned', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const StartDisputeReviewSwaggerSchema = {
  summary: 'Start admin review of a dispute',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  params: disputeIdParams,
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['under_review'] },
      notes: { type: 'string', maxLength: 1000 },
    },
  },
  response: {
    200: { description: 'Dispute review started', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RequestDisputeInformationSwaggerSchema = {
  summary: 'Request additional information from buyer or seller',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  params: disputeIdParams,
  body: {
    type: 'object',
    required: ['from', 'message'],
    properties: {
      from: { type: 'string', enum: ['buyer', 'seller'] },
      message: { type: 'string', minLength: 1, maxLength: 5000 },
    },
  },
  response: {
    200: { description: 'Information requested', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ResolveDisputeSwaggerSchema = {
  summary: 'Resolve a dispute',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  params: disputeIdParams,
  body: {
    type: 'object',
    required: ['resolutionType', 'resolutionNotes'],
    properties: {
      resolutionType: { type: 'string', enum: disputeResolutionTypeEnum },
      resolutionNotes: { type: 'string', minLength: 10, maxLength: 5000 },
      financialAction: disputeFinancialActionBody,
    },
  },
  response: {
    200: { description: 'Dispute resolved', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CloseDisputeSwaggerSchema = {
  summary: 'Close a resolved dispute',
  tags: ['Disputes'],
  security: [{ bearerAuth: [] }],
  params: disputeIdParams,
  body: {
    type: 'object',
    properties: {
      notes: { type: 'string', maxLength: 1000 },
    },
  },
  response: {
    200: { description: 'Dispute closed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UploadMediaSwaggerSchema = {
  summary: 'Upload media to configured storage',
  tags: ['Uploads'],
  security: [{ bearerAuth: [] }],
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary' },
      purpose: {
        type: 'string',
        enum: ['product_image', 'review_image', 'company_logo', 'general'],
        default: 'general',
      },
    },
  },
  response: {
    200: { description: 'Uploaded media URL', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

const messageConversationParams = {
  type: 'object',
  required: ['conversationId'],
  properties: {
    conversationId: { type: 'string', format: 'uuid' },
  },
};

const messageIdParams = {
  type: 'object',
  required: ['messageId'],
  properties: {
    messageId: { type: 'string', format: 'uuid' },
  },
};

const messageConversationQuery = {
  type: 'object',
  properties: {
    search: { type: 'string' },
    unreadOnly: { type: 'boolean' },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

const messageReportReasonEnum = [
  'spam',
  'abusive_content',
  'fraud_attempt',
  'payment_scam',
  'inappropriate_content',
  'off_platform_solicitation',
  'other',
];

export const StartConversationSwaggerSchema = {
  summary: 'Start or reuse a direct user conversation',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['recipientUserId'],
    properties: {
      recipientUserId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: { description: 'Conversation returned', type: 'object', additionalProperties: true },
    201: { description: 'Conversation created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetConversationsSwaggerSchema = {
  summary: 'List my Message Center conversations',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  querystring: messageConversationQuery,
  response: {
    200: { description: 'Conversation list', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UploadMessageAttachmentSwaggerSchema = {
  summary: 'Upload a trusted Message Center attachment',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary' },
    },
  },
  response: {
    200: { description: 'Attachment upload record', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SendMessageSwaggerSchema = {
  summary: 'Send a message in a conversation',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  params: messageConversationParams,
  body: {
    type: 'object',
    required: ['clientMessageId', 'messageType'],
    properties: {
      clientMessageId: { type: 'string', maxLength: 80 },
      messageType: { type: 'string', enum: ['text', 'image', 'file', 'mixed'] },
      content: { type: 'string', maxLength: 10000, nullable: true },
      replyToMessageId: { type: 'string', format: 'uuid', nullable: true },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          required: ['fileId'],
          properties: {
            fileId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
  },
  response: {
    201: { description: 'Message sent', type: 'object', additionalProperties: true },
    200: { description: 'Idempotent message response', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetMessagesSwaggerSchema = {
  summary: 'List messages in a conversation',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  params: messageConversationParams,
  querystring: {
    type: 'object',
    properties: {
      cursor: { type: 'string', format: 'uuid' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
    },
  },
  response: {
    200: { description: 'Conversation messages', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const MarkConversationReadSwaggerSchema = {
  summary: 'Mark a conversation as read',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  params: messageConversationParams,
  body: {
    type: 'object',
    properties: {
      lastReadMessageId: { type: 'string', format: 'uuid', nullable: true },
    },
  },
  response: {
    200: { description: 'Read state updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetMessageUnreadCountSwaggerSchema = {
  summary: 'Get my Message Center unread count',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Unread message count', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const EditMessageSwaggerSchema = {
  summary: 'Edit my message',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  params: messageIdParams,
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1, maxLength: 10000 },
    },
  },
  response: {
    200: { description: 'Message edited', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const DeleteMessageSwaggerSchema = {
  summary: 'Delete my message',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  params: messageIdParams,
  response: {
    200: { description: 'Message deleted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ReportMessageSwaggerSchema = {
  summary: 'Report a message',
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
  params: messageIdParams,
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string', enum: messageReportReasonEnum },
      details: { type: 'string', maxLength: 2000, nullable: true },
    },
  },
  response: {
    201: { description: 'Message report created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminMessageConversationsSwaggerSchema = {
  summary: 'List Message Center conversations for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      ...Object.fromEntries(Object.entries(messageConversationQuery.properties).filter(([key]) => key !== 'unreadOnly')),
      status: { type: 'string', enum: ['active', 'blocked'] },
      userId: { type: 'string', format: 'uuid' },
      reportedOnly: { type: 'boolean' },
      dateFrom: { type: 'string', format: 'date-time' },
      dateTo: { type: 'string', format: 'date-time' },
    },
  },
  response: {
    200: { description: 'Admin conversation list', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminMessageConversationByIdSwaggerSchema = {
  summary: 'Get Message Center conversation details for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: messageConversationParams,
  response: {
    200: { description: 'Admin conversation details', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateAdminConversationStatusSwaggerSchema = {
  summary: 'Block or unblock a Message Center conversation',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: messageConversationParams,
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['active', 'blocked'] },
      reason: { type: 'string', maxLength: 1000, nullable: true },
    },
  },
  response: {
    200: { description: 'Conversation status updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminMessageReportsSwaggerSchema = {
  summary: 'List Message Center reports for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'reviewing', 'resolved', 'dismissed'] },
      reason: { type: 'string', enum: messageReportReasonEnum },
      reportedUserId: { type: 'string', format: 'uuid' },
      reportedBy: { type: 'string', format: 'uuid' },
      dateFrom: { type: 'string', format: 'date-time' },
      dateTo: { type: 'string', format: 'date-time' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Admin report list', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ReviewAdminMessageReportSwaggerSchema = {
  summary: 'Review a Message Center report',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['reportId'],
    properties: {
      reportId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['pending', 'reviewing', 'resolved', 'dismissed'] },
      action: {
        type: 'string',
        enum: [
          'no_action',
          'warning_issued',
          'message_hidden',
          'conversation_blocked',
          'user_restricted',
          'escalated',
        ],
      },
      notes: { type: 'string', maxLength: 2000, nullable: true },
    },
  },
  response: {
    200: { description: 'Report reviewed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminMessageSettingsSwaggerSchema = {
  summary: 'Get Message Center settings',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Message Center settings', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateAdminMessageSettingsSwaggerSchema = {
  summary: 'Update Message Center settings',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      maxMessageCharacters: { type: 'integer', minimum: 1, maximum: 10000 },
      maxAttachmentsPerMessage: { type: 'integer', minimum: 0, maximum: 20 },
      maxAttachmentSizeMb: { type: 'integer', minimum: 1, maximum: 100 },
      allowedAttachmentTypes: {
        type: 'array',
        items: { type: 'string' },
      },
      messageEditWindowMinutes: { type: 'integer', minimum: 0, maximum: 10080 },
      unreadEmailDelayMinutes: { type: 'integer', minimum: 0, maximum: 10080 },
      messageReportingEnabled: { type: 'boolean' },
    },
  },
  response: {
    200: { description: 'Message Center settings updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

const notificationIdParams = {
  type: 'object',
  required: ['notificationId'],
  properties: {
    notificationId: { type: 'string', format: 'uuid' },
  },
};

const announcementIdParams = {
  type: 'object',
  required: ['announcementId'],
  properties: {
    announcementId: { type: 'string', format: 'uuid' },
  },
};

const notificationCategoryEnum = [
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
];

const announcementAudienceEnum = [
  'all',
  'buyers',
  'sellers',
  'admins',
  'specific_users',
];

export const GetNotificationsSwaggerSchema = {
  summary: 'List my notifications',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: notificationCategoryEnum },
      isRead: { type: 'boolean' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Notification list', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetUnreadNotificationCountSwaggerSchema = {
  summary: 'Get my unread notification count',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Unread notification count', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const MarkNotificationReadSwaggerSchema = {
  summary: 'Mark a notification as read',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  params: notificationIdParams,
  response: {
    200: { description: 'Notification marked read', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const MarkAllNotificationsReadSwaggerSchema = {
  summary: 'Mark all my notifications as read',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Notifications marked read', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const DeleteNotificationSwaggerSchema = {
  summary: 'Remove a notification from my list',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  params: notificationIdParams,
  response: {
    200: { description: 'Notification removed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetNotificationPreferencesSwaggerSchema = {
  summary: 'Get my notification preferences',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Notification preferences', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateNotificationPreferencesSwaggerSchema = {
  summary: 'Update my notification preferences',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['preferences'],
    properties: {
      preferences: {
        type: 'array',
        items: {
          type: 'object',
          required: ['category'],
          properties: {
            category: { type: 'string', enum: notificationCategoryEnum },
            inAppEnabled: { type: 'boolean' },
            emailEnabled: { type: 'boolean' },
          },
        },
      },
    },
  },
  response: {
    200: { description: 'Notification preferences updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CreateSystemAnnouncementSwaggerSchema = {
  summary: 'Create a system announcement',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['title', 'message', 'audience'],
    properties: {
      title: {
        oneOf: [
          { type: 'string' },
          { type: 'object', additionalProperties: { type: 'string' } },
        ],
      },
      message: {
        oneOf: [
          { type: 'string' },
          { type: 'object', additionalProperties: { type: 'string' } },
        ],
      },
      audience: { type: 'string', enum: announcementAudienceEnum },
      userIds: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
      },
      actionUrl: { type: 'string', nullable: true },
      sendInApp: { type: 'boolean', default: true },
      sendEmail: { type: 'boolean', default: false },
      scheduledAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  response: {
    201: { description: 'Announcement created', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminSystemAnnouncementsSwaggerSchema = {
  summary: 'List system announcements for admin',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['draft', 'scheduled', 'sent', 'cancelled'] },
      audience: { type: 'string', enum: announcementAudienceEnum },
      dateFrom: { type: 'string', format: 'date-time' },
      dateTo: { type: 'string', format: 'date-time' },
      search: { type: 'string' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'System announcements', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const CancelSystemAnnouncementSwaggerSchema = {
  summary: 'Cancel a scheduled system announcement',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  params: announcementIdParams,
  response: {
    200: { description: 'Announcement cancelled', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminNotificationStatsSwaggerSchema = {
  summary: 'Get notification statistics',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Notification statistics', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Internationalization & Localization schemas ────────────────────────────

const languageResponseItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    code: LanguageCodeField,
    name: { type: 'string', example: 'French' },
    nativeName: { type: 'string', example: 'Français' },
    direction: { type: 'string', enum: ['ltr', 'rtl'], example: 'ltr' },
    isDefault: { type: 'boolean' },
    status: { type: 'string', enum: ['active', 'inactive'] },
    sortOrder: { type: 'integer' },
  },
};

const languageIdParams = {
  type: 'object',
  required: ['languageId'],
  properties: {
    languageId: { type: 'string', format: 'uuid' },
  },
};

const translationIdParams = {
  type: 'object',
  required: ['translationId'],
  properties: {
    translationId: { type: 'string', format: 'uuid' },
  },
};

export const GetSupportedLanguagesSwaggerSchema = {
  summary: 'List active supported languages',
  tags: ['Internationalization'],
  response: {
    200: {
      description: 'Active languages',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'array', items: languageResponseItem },
      },
    },
    ...commonErrors,
  },
};

export const UpdateLanguagePreferenceSwaggerSchema = {
  summary: 'Update authenticated user language preference',
  tags: ['Internationalization'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['language'],
    properties: {
      language: LanguageCodeField,
    },
  },
  response: {
    200: { description: 'Language preference updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAdminLanguagesSwaggerSchema = {
  summary: 'List platform languages for admin',
  tags: ['Internationalization'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'Language configuration',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'array', items: languageResponseItem },
      },
    },
    ...commonErrors,
  },
};

export const CreateLanguageSwaggerSchema = {
  summary: 'Create platform language',
  tags: ['Internationalization'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['code', 'name', 'nativeName'],
    properties: {
      code: LanguageCodeField,
      name: { type: 'string', example: 'Spanish' },
      nativeName: { type: 'string', example: 'Español' },
      direction: { type: 'string', enum: ['ltr', 'rtl'], default: 'ltr' },
      sortOrder: { type: 'integer', minimum: 0, default: 0 },
    },
  },
  response: {
    201: { description: 'Language added', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateLanguageSwaggerSchema = {
  summary: 'Update platform language',
  tags: ['Internationalization'],
  security: [{ bearerAuth: [] }],
  params: languageIdParams,
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', example: 'French' },
      nativeName: { type: 'string', example: 'Français' },
      direction: { type: 'string', enum: ['ltr', 'rtl'] },
      sortOrder: { type: 'integer', minimum: 0 },
    },
  },
  response: {
    200: { description: 'Language updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateLanguageStatusSwaggerSchema = {
  summary: 'Update platform language status',
  tags: ['Internationalization'],
  security: [{ bearerAuth: [] }],
  params: languageIdParams,
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['active', 'inactive'] },
    },
  },
  response: {
    200: { description: 'Language status updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const SetDefaultLanguageSwaggerSchema = {
  summary: 'Set default platform language',
  tags: ['Internationalization'],
  security: [{ bearerAuth: [] }],
  params: languageIdParams,
  body: {
    type: 'object',
    required: ['isDefault'],
    properties: {
      isDefault: { type: 'boolean', enum: [true], example: true },
    },
  },
  response: {
    200: { description: 'Default language updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetTranslationStatusSwaggerSchema = {
  summary: 'Monitor translation status',
  tags: ['Internationalization'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      entityType: {
        type: 'string',
        enum: [
          'product',
          'category',
          'direct_rfq',
          'market_rfq',
          'subscription_plan',
          'system_announcement',
        ],
      },
      language: LanguageCodeField,
      status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: { description: 'Translation status summary and records', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RetryTranslationSwaggerSchema = {
  summary: 'Retry translation',
  tags: ['Internationalization'],
  security: [{ bearerAuth: [] }],
  params: translationIdParams,
  response: {
    200: { description: 'Translation queued for retry', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateManualTranslationSwaggerSchema = {
  summary: 'Manually override translation value',
  tags: ['Internationalization'],
  security: [{ bearerAuth: [] }],
  params: translationIdParams,
  body: {
    type: 'object',
    required: ['value'],
    properties: {
      value: { type: 'string', minLength: 1, maxLength: 5000 },
    },
  },
  response: {
    200: { description: 'Translation updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Search, Discovery & Ranking schemas ────────────────────────────────────

const searchPaginationQuery = {
  page: { type: 'integer', minimum: 1, default: 1 },
  limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
};

const searchFeatureBody = {
  type: 'object',
  properties: {
    durationDays: { type: 'integer', minimum: 1, maximum: 365, default: 7 },
  },
};

const searchProductIdParams = {
  type: 'object',
  required: ['productId'],
  properties: {
    productId: { type: 'string', format: 'uuid' },
  },
};

export const GetSellerDiscoverySwaggerSchema = {
  security: OptionalBearerAuth,
  summary: 'Discover verified marketplace sellers',
  tags: ['Search'],
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
      country: { type: 'string' },
      categoryId: { type: 'string', format: 'uuid' },
      minRating: { type: 'number', minimum: 0, maximum: 5 },
      isVerified: { type: 'boolean' },
      sortBy: {
        type: 'string',
        enum: ['ranking', 'relevance', 'highest_rating', 'most_reviewed', 'newest'],
        default: 'ranking',
      },
      lang: LanguageCodeField,
      ...searchPaginationQuery,
    },
  },
  response: {
    200: { description: 'Seller discovery results', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetSearchSuggestionsSwaggerSchema = {
  security: OptionalBearerAuth,
  summary: 'Get search suggestions',
  tags: ['Search'],
  querystring: {
    type: 'object',
    required: ['q'],
    properties: {
      q: { type: 'string', minLength: 1, maxLength: 120 },
      type: { type: 'string', enum: ['all', 'products', 'sellers', 'categories'], default: 'all' },
      lang: LanguageCodeField,
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
    },
  },
  response: {
    200: { description: 'Search suggestions', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetSearchHistorySwaggerSchema = {
  summary: 'Get recent searches',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
  },
  response: {
    200: { description: 'Recent searches', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const DeleteSearchHistoryItemSwaggerSchema = {
  summary: 'Delete a search history item',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['searchHistoryId'],
    properties: { searchHistoryId: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: { description: 'Search history item deleted', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ClearSearchHistorySwaggerSchema = {
  summary: 'Clear search history',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Search history cleared', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetPopularSearchesSwaggerSchema = {
  summary: 'Get popular searches',
  tags: ['Search'],
  response: {
    200: { description: 'Popular search terms', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

  export const RecordSearchEventSwaggerSchema = {
    summary: 'Record an authenticated search-result click',
    tags: ['Search'],
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      required: ['eventType', 'entityType', 'entityId', 'position'],
      properties: {
        eventType: { type: 'string', enum: ['result_click'] },
      searchQuery: { type: 'string', nullable: true },
      entityType: { type: 'string', enum: ['product', 'seller', 'market_rfq', 'category'], nullable: true },
      entityId: { type: 'string', format: 'uuid', nullable: true },
      position: { type: 'integer', minimum: 1, nullable: true },
      sessionId: { type: 'string', nullable: true },
      filters: { type: 'object', nullable: true, additionalProperties: true },
    },
  },
  response: {
    201: { description: 'Search event recorded', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const FeatureProductSwaggerSchema = {
  summary: 'Feature a seller product',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  params: searchProductIdParams,
  body: searchFeatureBody,
  response: {
    201: { description: 'Product featured', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const FeatureStoreSwaggerSchema = {
  summary: 'Feature seller store',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  body: searchFeatureBody,
  response: {
    201: { description: 'Store featured', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const RecordProductViewSwaggerSchema = {
  summary: 'Record product view',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  params: searchProductIdParams,
  response: {
    201: { description: 'Product view recorded', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetRecentlyViewedProductsSwaggerSchema = {
  summary: 'Get recently viewed products',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      lang: LanguageCodeField,
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 8 },
    },
  },
  response: {
    200: { description: 'Recently viewed products', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetPopularProductsSwaggerSchema = {
  security: OptionalBearerAuth,
  summary: 'Get popular products',
  tags: ['Search'],
  querystring: {
    type: 'object',
    properties: {
      lang: LanguageCodeField,
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 8 },
    },
  },
  response: {
    200: { description: 'Popular products', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetRelatedProductsSwaggerSchema = {
  security: OptionalBearerAuth,
  summary: 'Get related products',
  tags: ['Search'],
  params: searchProductIdParams,
  querystring: {
    type: 'object',
    properties: {
      lang: LanguageCodeField,
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 8 },
    },
  },
  response: {
    200: { description: 'Related products', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetSearchSettingsSwaggerSchema = {
  summary: 'Get Search settings',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Search settings', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const UpdateSearchSettingsSwaggerSchema = {
  summary: 'Update Search settings',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      outOfStockProductsVisible: { type: 'boolean' },
      searchHistoryLimit: { type: 'integer', minimum: 1, maximum: 100 },
      popularSearchWindowDays: { type: 'integer', minimum: 1, maximum: 365 },
      featuredBoostEnabled: { type: 'boolean' },
      ranking: {
        type: 'object',
        properties: {
          subscriptionPriorityEnabled: { type: 'boolean' },
          ratingEnabled: { type: 'boolean' },
          freshnessEnabled: { type: 'boolean' },
          availabilityEnabled: { type: 'boolean' },
        },
      },
    },
  },
  response: {
    200: { description: 'Search settings updated', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetSearchIndexStatusSwaggerSchema = {
  summary: 'Get Search index status',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  response: {
    200: { description: 'Search index status', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const ReindexSearchSwaggerSchema = {
  summary: 'Request Search reindex',
  tags: ['Search'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['entityType'],
    properties: {
      entityType: {
        type: 'string',
        enum: [
          'product',
          'seller',
          'market_rfq',
          'category',
          'products',
          'sellers',
          'market_rfqs',
          'categories',
        ],
      },
      entityId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    202: { description: 'Search reindex requested', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

// ─── Analytics & Reporting schemas ────────────────────────────────────────────

const AnalyticsDateRangeQueryProperties: Record<string, unknown> = {
  dateFrom: {
    type: 'string',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    example: '2026-01-01',
  },
  dateTo: {
    type: 'string',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    example: '2026-01-31',
  },
};

const AnalyticsCurrencyField = {
  type: 'string',
  minLength: 3,
  maxLength: 3,
  example: 'USD',
};

const AnalyticsGroupByField = {
  type: 'string',
  enum: ['day', 'week', 'month'],
  default: 'month',
};

const AnalyticsLanguageField = {
  lang: LanguageCodeField,
};

function analyticsQuery(
  properties: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      ...AnalyticsDateRangeQueryProperties,
      ...properties,
    },
  };
}

function analyticsGetSchema(
  summary: string,
  querystring: Record<string, unknown> = analyticsQuery(),
): Record<string, unknown> {
  return {
    summary,
    tags: ['Analytics'],
    security: [{ bearerAuth: [] }],
    querystring,
    response: {
      200: { description: summary, type: 'object', additionalProperties: true },
      ...commonErrors,
    },
  };
}

export const SellerAnalyticsOverviewSwaggerSchema = analyticsGetSchema(
  'Get seller analytics overview',
);

export const SellerAnalyticsSalesSwaggerSchema = analyticsGetSchema(
  'Get seller sales analytics',
  analyticsQuery({
    groupBy: AnalyticsGroupByField,
    currency: AnalyticsCurrencyField,
  }),
);

export const SellerAnalyticsProductsSwaggerSchema = analyticsGetSchema(
  'Get seller product analytics (includes current aggregate savedCount, independent of date range; no saver identities)',
  analyticsQuery({
    sortBy: {
      type: 'string',
      enum: ['views', 'orders', 'sales', 'rating', 'conversion'],
      default: 'views',
    },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    ...AnalyticsLanguageField,
  }),
);

export const SellerAnalyticsOrdersSwaggerSchema = analyticsGetSchema(
  'Get seller order analytics',
);

export const SellerAnalyticsRfqsSwaggerSchema = analyticsGetSchema(
  'Get seller RFQ analytics',
);

export const SellerAnalyticsCustomersSwaggerSchema = analyticsGetSchema(
  'Get seller customer analytics',
);

export const SellerAnalyticsSearchSwaggerSchema = analyticsGetSchema(
  'Get seller search analytics',
);

export const SellerAnalyticsReviewsSwaggerSchema = analyticsGetSchema(
  'Get seller review analytics',
);

export const SellerAnalyticsSubscriptionUsageSwaggerSchema = analyticsGetSchema(
  'Get seller subscription usage analytics',
  { type: 'object', properties: {} },
);

export const BuyerAnalyticsOverviewSwaggerSchema = analyticsGetSchema(
  'Get buyer analytics overview',
);

export const BuyerAnalyticsSpendingSwaggerSchema = analyticsGetSchema(
  'Get buyer spending analytics',
  analyticsQuery({
    currency: AnalyticsCurrencyField,
    groupBy: AnalyticsGroupByField,
    ...AnalyticsLanguageField,
  }),
);

export const BuyerAnalyticsRfqsSwaggerSchema = analyticsGetSchema(
  'Get buyer RFQ analytics',
);

export const BuyerAnalyticsSuppliersSwaggerSchema = analyticsGetSchema(
  'Get buyer supplier analytics',
);

export const AdminAnalyticsOverviewSwaggerSchema = analyticsGetSchema(
  'Get admin analytics overview',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsRevenueSwaggerSchema = analyticsGetSchema(
  'Get admin revenue analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsRevenueBySubscriptionSwaggerSchema = analyticsGetSchema(
  'Get admin revenue by subscription analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsLogisticsSwaggerSchema = analyticsGetSchema(
  'Get admin logistics analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsOrdersSwaggerSchema = analyticsGetSchema(
  'Get admin order analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
    status: { type: 'string', minLength: 1, maxLength: 80 },
    source: { type: 'string', enum: ['cart', 'direct_rfq', 'market_rfq'] },
  }),
);

export const AdminAnalyticsPaymentsSwaggerSchema = analyticsGetSchema(
  'Get admin payment analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
    paymentMethod: { type: 'string', minLength: 1, maxLength: 80 },
    paymentFor: { type: 'string', minLength: 1, maxLength: 80 },
    status: { type: 'string', minLength: 1, maxLength: 80 },
  }),
);

export const AdminAnalyticsSubscriptionsSwaggerSchema = analyticsGetSchema(
  'Get admin subscription analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsRfqsSwaggerSchema = analyticsGetSchema(
  'Get admin RFQ analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsProductsSwaggerSchema = analyticsGetSchema(
  'Get admin product analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
    ...AnalyticsLanguageField,
  }),
);

export const AdminAnalyticsSellersSwaggerSchema = analyticsGetSchema(
  'Get admin seller analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsBuyersSwaggerSchema = analyticsGetSchema(
  'Get admin buyer analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsCountriesSwaggerSchema = analyticsGetSchema(
  'Get admin country analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsCategoriesSwaggerSchema = analyticsGetSchema(
  'Get admin category analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
    ...AnalyticsLanguageField,
  }),
);

export const AdminAnalyticsFunnelSwaggerSchema = analyticsGetSchema(
  'Get admin conversion funnel analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsPaymentMethodsSwaggerSchema = analyticsGetSchema(
  'Get admin payment method analytics',
  analyticsQuery({
    country: { type: 'string', minLength: 2, maxLength: 100 },
    currency: AnalyticsCurrencyField,
  }),
);

export const AdminAnalyticsRebuildSwaggerSchema = {
  summary: 'Request analytics rebuild',
  tags: ['Analytics'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['entityType'],
    properties: {
      entityType: {
        type: 'string',
        enum: [
          'seller',
          'buyer',
          'product',
          'category',
          'order',
          'payment',
          'subscription',
          'rfq',
          'marketplace',
        ],
      },
      entityId: { type: 'string', format: 'uuid' },
      dateFrom: AnalyticsDateRangeQueryProperties.dateFrom,
      dateTo: AnalyticsDateRangeQueryProperties.dateTo,
    },
  },
  response: {
    202: { description: 'Analytics rebuild queued', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

const ReportTypeField = {
  type: 'string',
  enum: [
    'seller_settlements','seller_payouts','admin_settlements','admin_payouts',
    'seller_overview',
    'seller_sales',
    'seller_products',
    'seller_orders',
    'seller_rfqs',
    'seller_customers',
    'seller_search',
    'seller_reviews',
    'seller_subscription_usage',
    'buyer_overview',
    'buyer_spending',
    'buyer_rfqs',
    'buyer_suppliers',
    'admin_overview',
    'admin_revenue',
    'admin_revenue_by_subscription',
    'admin_logistics',
    'admin_orders',
    'admin_payments',
    'admin_subscriptions',
    'admin_rfqs',
    'admin_products',
    'admin_sellers',
    'admin_buyers',
    'admin_countries',
    'admin_categories',
    'admin_funnel',
    'admin_payment_methods',
    'admin_disputes',
  ],
};

export const ReportExportSwaggerSchema = {
  summary: 'Request analytics or financial report export',
  description: 'Financial report types seller_settlements, seller_payouts, admin_settlements and admin_payouts support CSV snapshots up to 10,000 rows. Seller scope is bound to the token; admins also need settlements.view or payouts.view. Download completed financial reports using the authenticated /reports/:reportId/download endpoint.',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['reportType', 'format'],
    properties: {
      reportType: ReportTypeField,
      format: { type: 'string', enum: ['csv', 'xlsx', 'pdf'] },
      filters: {
        type: 'object',
        additionalProperties: true,
        default: {},
      },
    },
  },
  response: {
    202: { description: 'Report export accepted; financial CSV may already be completed', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};

export const GetAnalyticsReportSwaggerSchema = {
  summary: 'Get analytics report status',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['reportId'],
    properties: {
      reportId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: { description: 'Report status and authenticated download URL', type: 'object', additionalProperties: true },
    ...commonErrors,
  },
};
