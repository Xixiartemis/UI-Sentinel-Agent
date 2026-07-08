import { FormEvent, useState } from "react";
import { fakeLogin } from "../api/fakeLogin";
import { LoginCredentials, LoginValidationErrors } from "../types/login";
import { hasValidationErrors, validateLoginForm } from "../validation/loginValidation";
import { LoginField } from "./LoginField";
import { LoginHeader } from "./LoginHeader";

const initialCredentials: LoginCredentials = {
  email: "",
  password: "",
};

export function LoginForm() {
  const [credentials, setCredentials] = useState<LoginCredentials>(initialCredentials);
  const [errors, setErrors] = useState<LoginValidationErrors>({});
  const [status, setStatus] = useState("Idle");

  function updateCredential(field: keyof LoginCredentials, value: string) {
    setCredentials((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateLoginForm(credentials);
    setErrors(nextErrors);
    setStatus("Submitting demo login request");

    await fakeLogin(credentials);

    if (hasValidationErrors(nextErrors)) {
      setStatus("Demo login request completed with validation errors");
      return;
    }

    setStatus("Demo login request completed");
  }

  return (
    <main className="page-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <LoginHeader />

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <LoginField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={credentials.email}
            error={errors.email}
            onChange={(value) => updateCredential("email", value)}
          />

          <LoginField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter password"
            value={credentials.password}
            error={errors.password}
            onChange={(value) => updateCredential("password", value)}
          />

          <button type="submit">Login</button>
        </form>

        <p className="status" aria-live="polite">
          {status}
        </p>
      </section>
    </main>
  );
}
