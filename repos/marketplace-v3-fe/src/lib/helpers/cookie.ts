export const AUTH_COOKIE_CHANGE_EVENT = "tofa-auth-cookie-change";

const notifyAuthCookieChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_COOKIE_CHANGE_EVENT));
  }
};

export const readCookie = (name: string) => {
  if (typeof document === "undefined") return undefined;

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split("=")[1]) : undefined;
};

export const writeCookie = (
  name: string,
  value: string,
  maxAgeSeconds?: number,
) => {
  if (typeof document === "undefined") return;

  const maxAge = maxAgeSeconds !== undefined ? `; max-age=${maxAgeSeconds}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/${maxAge}; SameSite=Lax`;
  notifyAuthCookieChange();
};

export const deleteCookie = (name: string) => {
  if (typeof document === "undefined") return;

  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  notifyAuthCookieChange();
};
