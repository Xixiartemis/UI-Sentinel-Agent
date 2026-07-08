import { LoginCredentials, LoginResult } from "../types/login";

export async function fakeLogin(
  credentials: LoginCredentials,
): Promise<LoginResult> {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    return {
      ok: false,
      message: "Demo login request completed with fake failure",
    };
  }

  return {
    ok: true,
    message: "Demo login request completed",
  };
}
