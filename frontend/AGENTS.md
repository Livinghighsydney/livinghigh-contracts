<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Workspace architecture
- `src/api/` talks to the Living High FastAPI backend (`VITE_API_URL`, default `http://localhost:8000`) through `http.ts`. Each resource keeps a cached copy (`createCache` in `store.ts`) so screens read it synchronously; contracts refresh every 30s and on window focus.
- Never call Documenso, Supabase or the email service from the browser — the backend does that. No secrets in frontend code.
- Keep route files thin and screen logic under `src/components/workspace/`.
- `DataGate` (in `shell.tsx`) shows pages only after contracts and templates have loaded and the page has hydrated. Browser-only data (sign-in, staff name) is read after hydration (`useHydrated`) so server and first client render match.
- Load the react-pdf viewer lazily inside ClientOnly; PDF workers belong to the browser, not SSR.
- Single full-screen editor route under the templates layout, with percentage-based field geometry.
- Sign-in is real: `api/auth.ts` calls `/api/auth/*`; the session is an HttpOnly cookie, so every request uses `credentials: "include"` (see `http.ts`). A 401 sends the user back to the login screen. Role checks in the UI (`authApi.canManageTeam()` etc.) only hide buttons — the backend enforces permissions.
- Run tests from an upper-case drive path on Windows (`D:/contract_app/frontend`); a lower-case `d:` path makes Vitest load twice and fail with "reading 'config'".
