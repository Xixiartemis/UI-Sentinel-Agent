export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginValidationErrors {
  email?: string;
  password?: string;
}

export interface LoginResult {
  ok: boolean;
  message: string;
}
