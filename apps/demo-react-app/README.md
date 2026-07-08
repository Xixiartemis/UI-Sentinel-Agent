# Demo React App

Task 5 implements the intentional buggy target app for UI Sentinel Agent MVP
testing.

## Intentional Bug

When the empty login form is submitted:

- `Password is required` is visible.
- `Email is required` is intentionally missing.

Do not fix this validation defect. It exists so later RAG and diagnosis tasks can
find and explain the UI bug.

## Setup

From the repository root:

```powershell
npm install
```

## Run

```powershell
npm run dev --workspace @ui-sentinel/demo-react-app
```

Expected URL:

```text
http://127.0.0.1:5173/
```

The login form is available at the root route. Vite will also serve it for
`/login`.

## Browser Worker Usage

Use this app as the Task 4 Browser Worker target URL:

```text
http://127.0.0.1:5173/
```

Submitting the form calls `POST /api/login`, which returns a fake failure
response. The request exists so Playwright can capture network evidence.

## Validation

1. Start the app.
2. Open `http://127.0.0.1:5173/`.
3. Submit the empty login form.
4. Confirm `Password is required` is visible.
5. Confirm `Email is required` is missing.
6. Confirm a `POST /api/login` network request is triggered.
