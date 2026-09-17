import { toast } from "sonner";

import { ApiErrorData, ApiErrorResponse } from "@/lib/types/error";

export const promiseErrorFunction = (
  error: ApiErrorResponse | unknown,
  fallback = "Something went wrong. Please try again.",
) => {
  const data = (error as ApiErrorResponse)?.response?.data as
    | ApiErrorData
    | undefined;

  if (!data) return toast.error(fallback);

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    return toast.error(typeof first === "string" ? first : first.message);
  }

  if (Array.isArray(data.message) && data.message.length > 0) {
    return toast.error(data.message[0]);
  }

  if (typeof data.message === "string") {
    return toast.error(data.message);
  }

  return toast.error(fallback);
};
