import { axiosInstance } from "@/lib/axiosInstance";
import {
  AuthUser,
  ForgotPasswordPayload,
  GoogleAuthPayload,
  GoogleAuthResponse,
  LoginPayload,
  LoginResponse,
  ResendOtpPayload,
  ResetPasswordPayload,
  SignUpPayload,
  SignUpResponse,
  UpdateTermsPayload,
  VerifyEmailPayload,
} from "../types";

export const signUp = async (payload: SignUpPayload) => {
  try {
    const url = "/auth/signup";
    const { data } = await axiosInstance.post<{ data: SignUpResponse }>(
      url,
      payload,
    );
    return data?.data;
  } catch (error) {
    throw error;
  }
};

export const resendOtp = async ({ email }: ResendOtpPayload) => {
  try {
    const url = "/auth/resend-otp";
    const { data } = await axiosInstance.post(url, { email });
    return data?.data;
  } catch (error) {
    throw error;
  }
};

export const verifyEmail = async ({ token, otp }: VerifyEmailPayload) => {
  try {
    const url = "/auth/verify-email";
    const { data } = await axiosInstance.post(url, { token, otp });
    return data?.data;
  } catch (error) {
    throw error;
  }
};

export const googleAuth = async ({ googleToken }: GoogleAuthPayload) => {
  try {
    const url = "/auth/google";
    const { data } = await axiosInstance.post<{ data: GoogleAuthResponse }>(
      url,
      { googleToken },
    );
    return data?.data;
  } catch (error) {
    throw error;
  }
};

export const updateTerms = async ({
  userId,
  termsOfUse,
}: UpdateTermsPayload) => {
  try {
    const url = `/auth/update-terms/${userId}`;
    const { data } = await axiosInstance.patch(url, { termsOfUse });
    return data;
  } catch (error) {
    throw error;
  }
};

export const login = async (payload: LoginPayload) => {
  try {
    const url = "/auth/login";
    const { data } = await axiosInstance.post<
      LoginResponse | { data: LoginResponse }
    >(url, payload);

    return "data" in data ? data.data : data;
  } catch (error) {
    throw error;
  }
};

export const getCurrentUser = async () => {
  try {
    const url = "/users/me";
    const { data } = await axiosInstance.get<
      AuthUser | { data: AuthUser }
    >(url);

    return "data" in data ? data.data : data;
  } catch (error) {
    throw error;
  }
};

export const forgotPassword = async ({ email }: ForgotPasswordPayload) => {
  try {
    const url = "/auth/forgot-password";
    const { data } = await axiosInstance.post(url, { email });
    return data?.data;
  } catch (error) {
    throw error;
  }
};

export const resetPassword = async ({
  otp,
  password,
}: ResetPasswordPayload) => {
  try {
    const url = "/auth/reset-password";
    const { data } = await axiosInstance.post(url, { otp, password });
    return data;
  } catch (error) {
    throw error;
  }
};

export const logout = async () => {
  try {
    const url = "/auth/logout";
    const { data } = await axiosInstance.post(url);
    return data;
  } catch (error) {
    throw error;
  }
};

export const logoutAllDevices = async () => {
  try {
    const url = "/auth/logout-all";
    const { data } = await axiosInstance.post(url);
    return data;
  } catch (error) {
    throw error;
  }
};
