import axios from "axios";

import { readCookie } from "@/lib/helpers/cookie";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export const axiosInstance = axios.create({
  baseURL: baseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = readCookie("tofaToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      config.headers.delete("Authorization");
    }
    return config;
  },
  (err) => {
    throw new Error(err);
  },
);
