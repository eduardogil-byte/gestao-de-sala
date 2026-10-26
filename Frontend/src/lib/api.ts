import type { User } from "../types";
const KEY = "salagest_access_token";
export const tokenStore = {
  get: () => sessionStorage.getItem(KEY),
  set: (token: string) => sessionStorage.setItem(KEY, token),
  clear: () => sessionStorage.removeItem(KEY),
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      "Não foi possível conectar à API. Confirme que o backend está rodando na porta 5108.",
      0,
    );
  }
  const data: unknown =
    res.status === 204
      ? null
      : await res.text().then((t) => {
          try {
            return t ? JSON.parse(t) : null;
          } catch {
            return null;
          }
        });
  if (!res.ok) {
    if (res.status === 401 && token)
      window.dispatchEvent(new Event("salagest:unauthorized"));
    const body = data as {
      error?: string;
      title?: string;
      errors?: Record<string, string[]>;
    } | null;
    const validation = body?.errors
      ? Object.values(body.errors).flat().join(" ")
      : "";
    throw new ApiError(
      body?.error ||
        validation ||
        body?.title ||
        (res.status === 403
          ? "Sem permissão para executar esta ação."
          : `Erro na solicitação (${res.status}).`),
      res.status,
    );
  }
  return data as T;
}
export const read = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, data?: unknown) =>
  api<T>(path, {
    method: "POST",
    body: data === undefined ? undefined : JSON.stringify(data),
  });
export const put = <T>(path: string, data: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(data) });
export const remove = <T>(path: string) => api<T>(path, { method: "DELETE" });
export async function signIn(email: string, password: string): Promise<User> {
  const result = await post<{ accessToken: string }>("/auth/login", {
    email,
    password,
  });
  if (!result?.accessToken)
    throw new ApiError("A API não retornou o token de acesso.", 500);
  tokenStore.set(result.accessToken);
  try {
    return await read<User>("/me");
  } catch (error) {
    tokenStore.clear();
    throw error;
  }
}
export const register = (name: string, email: string, password: string) =>
  post("/auth/register", { name, email, password });
