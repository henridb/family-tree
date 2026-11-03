# Contributing to Family Tree

Use fictional family records for development, screenshots, bug reports and tests.
Do not commit private configuration, family exports or backups. When reporting a
problem, include reproduction steps and a small fictional example when useful.

## Start a development copy

Use Node.js 22 and npm 10.9.2. The `.node-version` and `packageManager` settings
record the supported tools. With fnm configured, entering the directory can
select the Node version automatically.

After cloning your fork, run:

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
Version** to match project diagnostics. The workspace recommends ESLint,
Prettier, Tailwind CSS IntelliSense and Prisma, with Prisma's language server
pinned to schema version 6.

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

The logo and favicon are SVG assets in `public/`; keep their tree silhouette and
brown/beige palette consistent.
