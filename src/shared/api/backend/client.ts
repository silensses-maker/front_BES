import axios from "axios";

export const backendClient = axios.create({
  baseURL: import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:9000",
  headers: {
    "Content-Type": "application/json",
  },
});
