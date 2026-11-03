# Family Tree

A self-hosted family tree viewer and editor, with one family per installation.
Enter people and relationships progressively, explore descendant branches, and
transfer complete documents as JSON. The interface is currently in French.

The project uses Next.js, React, TypeScript, tRPC and Zod. Local family data stays
in a private JSON file; Vercel deployments use Upstash Redis. Viewing and editing
use separate shared and owner passwords.

## Local development

Use Node.js 22 and npm 10.9.2. With fnm configured in your shell, entering this
directory selects Node 22 automatically.

```sh
npm ci        # install dependencies from the lockfile
npm run setup # configure passwords and start or import a family
npm run dev   # start the local development server
```

Setup privately prompts for viewing and owner passwords, prepares local storage,
and lets you start an empty family or import an existing JSON file. Rerunning it
preserves existing credentials and data. Open <http://localhost:3000/edit> to
enter family information and `/` to preview the saved tree.

See [the setup guide](docs/setup.md) for existing installations, trying another
family, and hosting with Vercel and Upstash without installing the Vercel CLI.

For a fictional example, choose JSON import during setup and enter
`examples/family.json`. It is not loaded automatically. Enter your own family in
the editor or import your private JSON file when ready.

`auth:configure` privately prompts for a shared password of 6–1024
characters and writes its salted hash, a random session secret, and a recoverable
copy of the password to the ignored `.env` file. Setting a new password signs
out existing sessions after the app restarts.

To save the current password without changing it or invalidating sessions:

```sh
npm run auth:save-existing
```

Enter the current password privately when prompted. The command checks it
against the existing hash before saving the recovery copy. It leaves the hash,
session secret, and other configuration unchanged.

`PASSWORD_RECOVERY` is optional recovery metadata; login still uses
`PASSWORD_HASH`. Editing the recovery copy alone does not change the login
password. In `.env`, the copy is a JSON string inside single quotes, for example
`PASSWORD_RECOVERY='"password"'`. Read the inner JSON string to recover
the password. To display the exact saved password, including special characters,
in your terminal:

```sh
node --env-file=.env -e "console.log(JSON.parse(process.env.PASSWORD_RECOVERY))"
```

This is recoverable encoding, not encryption. Anyone who can read that
configuration can recover the password.

## Navigating the tree

Use **+** and **−** to change the diagram size while retaining your current
position, the percentage button to restore 100%, **Tout voir** to fit the tree,
and **Recentrer** to center the first-generation couple horizontally, or the first
person when no partner is shown. Details remain readable at their normal size
regardless of the diagram zoom.

Drag empty diagram space with the left mouse button to pan. Cards remain
clickable to open details. Touch scrolling and the keyboard remain available.

Pinch on a trackpad or phone, or hold Ctrl while scrolling over the diagram,
to zoom around the pointer or the midpoint between your fingers. On phones,
one-finger scrolling still pans the tree. These gestures change the diagram's
zoom; the surrounding controls and details retain their normal size.

The small **−/+** button between partners hides or shows only their shared descendants.
**Tout déplier** restores every branch. Search temporarily expands matching
paths; clearing it restores your collapse choices.

To find several people together, separate searches with semicolons, for example
`Jacques; Madeleine`. Anyone matching at least one search is highlighted and
counted once. Empty searches are ignored. The **?** beside the search field
explains this behavior on hover, keyboard focus, or tap.
Matching letters are highlighted in names, including birth surnames. The original
spelling and accents are preserved. If a matching surname is hidden by your display
settings, the card outline still identifies the result.

When a person card has focus, arrow keys move to nearby cards, Home returns to
the root, End reaches the last visible card, and Enter/Space opens details.
Tab navigation and native scrolling remain available.

Phones also offer diagram/compact buttons beside the settings heading. The
compact view connects children beneath each partnership with vertical branches,
without horizontal panning. Both views share collapse choices; a partnership's
button hides only its descendants and keeps the couple visible.
Switching views preserves the diagram's zoom and each view's scroll position.
Person details show previous generations as successive couples, starting at the root.
Generation labels name the root person and count that person as generation 1.
Desktop retains the diagram and its floating controls. On very short screens,
settings start collapsed; you can open them and your choice is retained while
using the page.

## Family record IDs

Each person in the family source has a permanent lowercase alphanumeric `id`.
Keep it when correcting a name or date, and give new records an unused ID.
IDs identify cards and relationship connectors; they are checked for uniqueness
before the tree is served.

## Search

Search accepts names with or without accents, ignores case and extra spaces,
and includes birth surnames and current married surnames. Matching people have
an outline; ancestors remain visible to show their place in the family.
The result count excludes those contextual ancestors. Clear the search to
restore the complete tree.

Run `npm run test:family-search` for filtering checks.

## Birth dates

Birth dates retain the precision of the available information: a year, a year
and month, or a full date. For example, details display `1910`, `02/1956`, or
`10/05/1885`. Unknown dates appear as `?`. Dates display consistently regardless
of the visitor's timezone.

Run `npm run test:birth-dates` for date validation and display checks.

## VS Code

Open the repository root as the workspace folder. With a `.tsx` file active,
run **TypeScript: Select TypeScript Version…** from the command palette and choose
**Use Workspace Version**. This keeps editor diagnostics aligned with the
project's installed TypeScript and enables the Next.js plugin.

The workspace recommends ESLint, Prettier, Tailwind CSS IntelliSense, and Prisma.
Prisma's language server is pinned to version 6 to match this project's schema.
After changing workspace settings, run **Developer: Reload Window** if needed.

Use `npm ci` to restore locked dependency versions and
`npm exec -- prisma generate` to refresh database types after schema changes.
Next.js regenerates its type declarations when running `npm run dev` or
`npm run build`; do not edit `next-env.d.ts` manually.

## Access

Sign-in uses a tRPC mutation. The server issues an encrypted, HttpOnly cookie
valid for seven days. The tree page and data procedures require a valid session;
the family dataset is fetched after login and is excluded from public bundles.
Returning visitors with a valid session open the tree directly. They need to
enter the password again once their session expires.

Login is limited to 20 attempts per minute across the site. If the limit is
reached, everyone must wait for that minute's window to end. This intentionally
small limit suits the shared login.

For deployment on Vercel, connect an Upstash Redis store to the project's
Production environment. The integration supplies `KV_REST_API_URL` and
`KV_REST_API_TOKEN`; use the writable token. Also set `PASSWORD_HASH` and
`SESSION_SECRET` in the project's private Production environment settings.
Copy existing authentication values without their surrounding `.env` quotes to
keep the same password. Redeploy with `vercel --prod` after saving these settings.
Local `.env` values are not a substitute for configuring the hosted environment.

Local development uses SQLite when both Redis settings are empty. A self-hosted
installation can also use SQLite with HTTPS and a persistent database configured
through `DATABASE_URL`. Vercel requires Redis because local SQLite files are not
persistent shared storage. If the configured counter store is unavailable, login
fails rather than bypassing the attempt limit.

Keep the optional `PASSWORD_RECOVERY` value in private server configuration too
if you want to retrieve the shared password later. Existing installations do not
require it. Do not publish `.env`. Changing either authentication secret invalidates
existing sessions.
Reverse proxies must preserve the public request origin for the mutation origin
check. External API clients must send a matching `Origin` header on POST requests.

Run `npm run test:auth-configure` for password configuration and recovery checks.
Run `npm run check` for lint and types. Run `npm run test:auth` for production HTTP
authentication tests; they use an isolated temporary database and local server.

`npm run lint` checks source and configuration files with TypeScript, React,
Hooks, Next.js, and accessibility rules. Warnings fail the check.
`npm run lint:fix` applies available automatic fixes.

## Family data and storage

The family is a versioned JSON document. On Vercel, the protected API reads it
from Upstash Redis and reconstructs the displayed tree on each request. Changes
become visible on the next fetch without redeploying the site. The
[owner editor](docs/family-editor.md) at `/edit` supports data entry, JSON
transfer, and revision recovery with a separate owner password.

Outside Vercel, put a full family document in the ignored `.data/family.json`, or
set `FAMILY_DATA_FILE` to another private file. Local development uses that file
even when Redis credentials are configured for the login counter. A missing
document shows an unconfigured-tree message; a document without a selected root
shows a separate empty view. Invalid or unavailable data shows a retry message.

Redis stores the shared login-attempt budget on Vercel; SQLite stores it locally
when Redis is not configured. The older Prisma `Person` and `Post` tables are
unused and retained to avoid dropping any existing data during
schema synchronization. They do not describe the active family relationships.

The document model and its current viewer limits are documented
in [the family document contract](docs/family-document.md). Run
`npm run test:family-document` for its fictional-data validation and projection
checks.

[Family document storage](docs/family-storage.md) adds explicit Upstash
initialization, revision-safe saves, recent history, and JSON import/export.
Run `npm run test:family-store` for isolated checks without hosted credentials.
No migration runs on startup, during builds, or on deployment. Before deploying
this version over an existing installation, initialize its private Redis family
document using [the migration instructions](docs/family-migration.md). Never put
family exports in `public/`. Keep independent backups outside the hosted store.

## License

Copyright (C) 2026 henridb.

This program is free software, licensed under the GNU General Public License,
version 3 only (`GPL-3.0-only`). It comes without warranty. See [LICENSE](LICENSE)
for the full terms and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for
incorporated code that retains its original license notices.
