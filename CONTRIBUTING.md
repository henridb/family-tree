# Contributing to Family Tree

Use fictional family records for development, screenshots, bug reports and tests.
Do not commit private configuration, family exports or backups. When reporting a
problem, include reproduction steps and a small fictional example when useful.

## Start a development copy

Use Node.js 22 and npm 10.9.2. The `.node-version` and `packageManager` settings
record the supported tools. With fnm configured, entering the directory can
select the Node version automatically.

For a quick local demo after cloning your fork, run:

```sh
npm ci
npm run dev:demo
```

Open <http://localhost:3000> with viewing password `demo-family`, or `/edit`
with owner password `demo-owner`. Setup and a `.env` file are not needed. The
server listens only on your computer because these demo passwords are public.

Each run starts a fresh copy of `examples/family.json` with its own family file
and login database under ignored `.data/demo-*` storage. Demo edits are not
reused on the next run. Your `.env`, configured family and the checked-in example
are preserved. Download any demo edits you want to keep before stopping the
server with **Ctrl+C**. To use another port, run
`npm run dev:demo -- --port 3001`.

To configure a persistent local family with your own passwords instead, run:

```sh
npm ci
npm run setup
npm run dev
```

During setup, import `examples/family.json` for the fictional demonstration
family, or start an empty document. Use a separate checkout when developing
beside a real family installation so `.env` and `.data` stay independent.
The [setup guide](docs/setup.md) covers first-time installation and hosting.

## Check your changes

After setup, run:

```sh
npm run check # lint and TypeScript
npm run build # production app required by the HTTP tests
npm test      # all test suites, including setup and HTTP authentication
```

The demo command supplies settings only to its own server process. To build
without running setup, use disposable settings as shown in the
[CI workflow](.github/workflows/ci.yml). Stop the dev server before building.

Lint warnings fail the check. `npm run lint:fix` applies available fixes. Use
Prettier on the files you change; the repository's `format:check` and
`format:write` scripts cover TypeScript, JavaScript and MDX files.

The CI workflow repeats these checks on pull requests and pushes to `main`, and
can be triggered manually after it is on the default branch. It installs locked
dependencies, uses disposable build settings, and needs no hosted credentials.
HTTP tests use temporary SQLite files and local Redis REST fixtures. An
additional Lua integration test starts a local Redis process when
`redis-server` and `redis-cli` are installed; otherwise that test is skipped.

Focused scripts such as `test:family-document`, `test:family-store`,
`test:family-source`, `test:setup`, `test:birth-dates` and `test:family-search`
are available in `package.json`. `test:auth` builds the application and runs the
HTTP authentication and environment suites.

## Add or update a language

Interface messages live in `messages/fr.ts` and `messages/en.ts`. Use
namespaced keys and complete messages with named interpolation arguments. Keep
plural and ordinal rules in the catalog; languages can use different plural
cases. Include tooltips, screen-reader labels, confirmations, empty states and
short error feedback. Family names and titles are user data, not translations.

`LANGUAGE_MODE` supports `choice` (the default) or a fixed locale. Fixed modes
must override existing locale cookies and reject language-change actions, and
selectors must be absent on every screen. Keep the supported modes derived from
the locale list so adding a language also makes it available as a fixed mode.

To add a language, add its locale and native name in `src/i18n/locales.ts`, add
its catalog loader in `src/i18n/request.ts`, include its type in
`src/i18n/types.d.ts`, and provide the same keys and interpolation arguments as
the French catalog. Follow the English catalog's `as const` and `satisfies`
checks: they retain literal message types and check keys and argument types
against French. The shared selector reads this configuration. Extend the catalog
checks in `tests/i18n.test.mjs` with the new
catalog. `npm run test:translations` checks key parity, message syntax,
interpolation, locale resolution and formatting. The full `npm test` run also
covers HTTP rendering, metadata and error identifiers.

Use `useTranslations("viewer")` in client components and
`getTranslations("metadata")` in async server components, choosing the relevant
namespace. Keys and interpolation arguments have autocomplete and compiler
checks; for example, `t("matches", {count: 2})` requires a numeric `count`.
`npm run typecheck` also runs the compile-time contracts in
`tests/types/translations.ts`.

Keep feedback in state as message keys rather than translated
sentences, so existing feedback changes language too. Avoid locale-dependent
component keys or full-page navigation when switching languages: drafts,
selection, search, zoom and collapsed branches must survive. Keep shared document
and projection helpers independent of React and request context.

Birth-date inputs retain `YYYY`, `YYYY-MM` and `YYYY-MM-DD` formats. Display
formatting may change order but must preserve known precision and use calendar
values without timezone shifts. Name matching and relationship rules are
independent of interface language. CLI prompts and translated documentation are
outside the first multilingual release.

## Find your way around

| Location                   | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `src/app/_components/`     | Family viewer, compact view, search and viewport controls          |
| `src/app/edit/`            | Owner editor and login                                             |
| `src/lib/`                 | Document validation, tree projection, identities, dates and search |
| `src/server/api/`          | tRPC procedures and authorization boundaries                       |
| `src/server/family-store*` | Local and Redis family persistence                                 |
| `scripts/`                 | Guided setup, password configuration and explicit initialization   |
| `tests/`                   | Fictional-data tests and local service fixtures                    |
| `docs/`                    | User guides and technical contracts                                |

Read [architecture](docs/architecture.md) for the request flow and storage model,
then [the document contract](docs/family-document.md) before changing relationships
or projection behavior. Preserve stable IDs, ordering and revision checks.

## Editor and database tools

In VS Code, select **TypeScript: Select TypeScript Version… → Use Workspace
Version** to match project diagnostics. Copy `.vscode/settings.example.json` to
`.vscode/settings.json` for the workspace TypeScript prompt and Prisma 6 language
server setting. If you already have local settings, merge these entries instead
of replacing the file. The local settings file is ignored by Git so any personal
project settings remain private.

Extension recommendations remain shared in `.vscode/extensions.json`: ESLint,
Prettier, Tailwind CSS IntelliSense and Prisma.

`npm ci` generates the Prisma client. After schema changes, use
`npm exec -- prisma generate` to refresh its types. Next.js regenerates
`next-env.d.ts` during development and builds; do not edit it manually. SQLite
holds the local login-attempt budget, not the family document.

## Documentation images

The README screenshots use only `examples/family.json`. Capture the actual app
after signing in locally with disposable credentials. The desktop screenshot
uses a 1440×900 viewport; the compact mobile screenshot uses 390×844. Select
**Vue compacte** on mobile. Save PNGs in `docs/images/` and keep personal records,
browser profiles and hosting settings out of captures.

The canonical artwork is `public/logo.svg`; `public/favicon.svg` uses the same
tree. PNG and ICO exports provide browser and mobile icons. Keep all sizes in
sync when changing the artwork, including the Apple touch icon and web manifest.
