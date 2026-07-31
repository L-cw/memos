# Memos Project Instructions

## API contracts and transport

- `.proto` files are the single source of truth for frontend-backend API contracts.
- New or changed frontend-backend interactions must use the gRPC-Gateway `/api/v1/...` HTTP endpoints with JSON request and response bodies.
- Frontend JSON requests must send `Content-Type: application/json` when a body is present and use `credentials: "include"`.
- Do not add a separate handwritten backend REST contract or use binary gRPC-Web for new Action APIs.
- Regenerate Go gateway code and TypeScript contract types after changing a `.proto` file. Never edit generated files by hand.

## Local development account

- The backend creates `qqq` with password `qqq11111` and the `HOST` role when a `dev` database does not already contain that username.
- This account is development-only and must never be created automatically in `prod` or `demo` mode.
- When an existing `qqq` is not a `HOST`, development startup promotes only its role to `HOST`. Do not overwrite or reset its password, nickname, or other profile data.
