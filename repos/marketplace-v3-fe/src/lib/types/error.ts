export interface ApiErrorData {
  message?: string | string[];
  errors?: string[] | { message: string }[];
}

export interface ApiErrorResponse {
  response?: {
    data?: ApiErrorData;
  };
}
