export function apiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  if (typeof window !== "undefined")
    return `${window.location.protocol}//${window.location.hostname}:5001/api`;
  return "http://127.0.0.1:5001/api";
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, requestOptions: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
    ...requestOptions,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...requestOptions.headers },
  }).catch(() => {
    throw new ApiError(
      "The Trip Ticket API is unreachable. Check that the backend is running on port 5001.",
    );
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      payload?.error || payload?.message || "The request could not be completed.",
      response.status,
    );
  return payload as T;
}
