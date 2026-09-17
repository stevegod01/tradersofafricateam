export type SignUpPayload = {
  email: string;
  password: string;
  referralCode?: string;
  termsOfUse: boolean;
};

export type SignUpResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    status: string;
    isEmailVerified: boolean;
  };
};

export type ResendOtpPayload = {
  email: string;
};

export type VerifyEmailPayload = {
  token: string;
  otp: string;
};

export type SignUpFormState = {
  email: string;
  password: string;
  referralCode: string;
  termsOfUse: boolean;
};

export type SignUpFormErrors = Partial<
  Record<keyof SignUpFormState, string>
>;

export type GoogleAuthPayload = {
  googleToken: string;
};

export type GoogleAuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    termsOfUse: boolean;
  };
};

export type UpdateTermsPayload = {
  userId: string;
  termsOfUse: boolean;
};

export type AuthUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email: string;
  userType?: string;
  status?: string;
  isEmailVerified?: boolean;
  isCompanyVerified?: boolean;
  totalPoints?: number;
  companyName?: string;
  storeName?: string;
  country?: string;
  totalReviewCount?: number;
  totalAverageReviews?: number;
  selectedLanguage?: string;
  createdAt?: string;
  deliveryAddress?: string;
  companyBio?: string;
  pickupAddress?: string;
  isProfileUpdated?: boolean;
  isProfileComplete?: boolean;
  /**
   * Buyer -> seller upgrade / KYC review state. Backend field name is a
   * placeholder pending confirmation; update here if it ships differently.
   */
  sellerVerificationStatus?: "not_requested" | "pending" | "approved" | "rejected";
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  requiresEmailVerification?: boolean;
  user?: AuthUser;
};

export type LoginFormState = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export type LoginFormErrors = Partial<
  Record<keyof LoginFormState, string>
>;

export type ForgotPasswordPayload = {
  email: string;
};

export type ForgotPasswordFormState = {
  email: string;
};

export type ForgotPasswordFormErrors = Partial<
  Record<keyof ForgotPasswordFormState, string>
>;

export type ResetPasswordPayload = {
  otp: string;
  password: string;
};

export type ResetPasswordFormState = {
  otp: string;
  password: string;
};

export type ResetPasswordFormErrors = Partial<
  Record<keyof ResetPasswordFormState, string>
>;
