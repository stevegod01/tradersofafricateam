import { deleteCookie, writeCookie } from "@/lib/helpers/cookie";

const AUTH_TOKEN_COOKIE = "tofaToken";
const REMEMBER_ME_MAX_AGE = 60 * 60 * 24 * 30;

export const setAuthToken = (token: string, rememberMe = true) => {
  writeCookie(AUTH_TOKEN_COOKIE, token, rememberMe ? REMEMBER_ME_MAX_AGE : undefined);
};

export const clearAuthToken = () => {
  deleteCookie(AUTH_TOKEN_COOKIE);
};
