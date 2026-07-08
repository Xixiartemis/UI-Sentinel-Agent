import { LoginCredentials, LoginValidationErrors } from "../types/login";

export function validateLoginForm(
  credentials: LoginCredentials,
): LoginValidationErrors {
  const errors: LoginValidationErrors = {};

  // Intentional UI Sentinel MVP bug:
  // Empty email is not validated, so no "Email is required" message appears.
  if (!credentials.password.trim()) {
    errors.password = "Password is required";
  }

  return errors;
}

export function hasValidationErrors(errors: LoginValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
