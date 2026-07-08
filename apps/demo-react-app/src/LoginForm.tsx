import { FormEvent, useState } from "react";

interface FormErrors {
  email?: string;
  password?: string;
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState("Idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FormErrors = {};

    // Intentional UI Sentinel MVP bug:
    // Empty email is not validated, so no "Email is required" message appears.
    if (!password.trim()) {
      nextErrors.password = "Password is required";
    }

    setErrors(nextErrors);
    setStatus("Submitting demo login request");

    try {
      await fetch("/api/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      setStatus("Demo login request completed");
    } catch {
      setStatus("Demo login request failed");
    }
  }

  return (
    <main className="page-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">UI Sentinel target</p>
          <h1 id="login-title">Demo Login</h1>
          <p className="intro">
            This page intentionally contains one validation defect for browser
            evidence collection.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email ? (
              <p className="error" id="email-error" role="alert">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            {errors.password ? (
              <p className="error" id="password-error" role="alert">
                {errors.password}
              </p>
            ) : null}
          </div>

          <button type="submit">Login</button>
        </form>

        <p className="status" aria-live="polite">
          {status}
        </p>
      </section>
    </main>
  );
}
