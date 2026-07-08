interface LoginFieldProps {
  id: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
  placeholder: string;
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}

export function LoginField({
  id,
  label,
  type,
  autoComplete,
  placeholder,
  value,
  error,
  onChange,
}: LoginFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p className="error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
