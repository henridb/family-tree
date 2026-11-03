# Technical architecture

Family Tree is a Next.js App Router application using React, TypeScript, tRPC,
React Query and Zod. One installation serves one family document. The interface
currently uses French labels.

## Request and data flow

The server checks the viewing or owner session before serving the tree. The
client requests data through tRPC; the server reads one saved family document,
validates it, and projects the selected descendant branches into the nested
viewer shape. Search and display settings operate on that authenticated view.
Family records do not belong in public assets or client source code.

The owner editor loads the complete document and keeps changes in a browser
draft until an explicit save. A save checks the expected revision, validates
relationships and viewer compatibility, and replaces the current document
atomically with recent history. A conflicting save preserves the draft for
manual recovery. Ten previous revisions are retained; independent exports
remain necessary for backups.

See [the document contract](family-document.md),
[storage behavior](family-storage.md), and [editor guide](family-editor.md).

## Local and hosted storage

| Environment       | Family records                                               | Login-attempt counter                                 |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| Local/self-hosted | Private JSON file, normally `.data/family.json`              | SQLite, or Redis when both REST settings are provided |
| Vercel            | Upstash Redis, scoped to the environment and family instance | Upstash Redis, scoped to the deployment environment   |

`FAMILY_DATA_FILE` selects a private local file. Local family editing stays local
even when Redis is configured for the login counter. On Vercel,
`FAMILY_INSTANCE_ID` chooses the family namespace, defaulting to `main`.
Production and Preview use separate family namespaces. Two projects sharing
the Redis database, environment and instance ID share the family document.

Vercel requires `KV_REST_API_URL` and a writable `KV_REST_API_TOKEN` because its
local filesystem is not persistent shared storage. Local SQLite is selected
when neither REST setting is configured. Missing or unavailable configured
storage causes an error rather than silently switching to another family.

SQLite is managed through Prisma. Its `LoginRateLimit` table supports the local
login budget. The legacy `Person` and `Post` tables are unused and retained to
avoid dropping existing installation data during schema synchronization; they
do not model the active family relationships.

Application builds and deployments do not initialize or migrate family records.
An owner's first save can initialize an empty installation. Use JSON
import/export for normal transfers, and [the migration guide](family-migration.md)
for explicit store initialization of an existing document.

## Authentication and configuration

Authentication uses server-side scrypt hashes and encrypted HttpOnly session
cookies valid for seven days. Viewing and owner access have separate cookies.
An owner session also grants viewing access. There are no individual accounts.

Login attempts share a site-wide budget of 20 attempts per minute. Local SQLite
and the hosted Redis path preserve this limit atomically. An unavailable counter
store rejects login rather than bypassing the budget.

Mutations require a matching request origin. Reverse proxies must preserve the
public origin, and external clients must send a matching `Origin` header for
POST requests. Family responses use private, non-shared caching boundaries.

The environment schema is in `src/env.js`. Private local settings are generated
in ignored `.env`; hosted settings must be configured separately in Vercel.
Production and Preview should use separate credentials and initialized family
stores. Recovery metadata is optional and is not read by the login path.

See [the setup guide](setup.md) for dashboard configuration and
[password operations](passwords.md) for rotation and recovery.

## Identity and projection

People and partnerships have permanent lowercase alphanumeric IDs. Preserve
them when correcting names or dates. Explicit partnership and child order
controls the displayed order. Search annotations, generation context and married
display surnames are derived rather than stored as authoritative records.

The document may contain people outside the displayed tree. The viewer has
stricter projection limits than the complete document, including supported
partnership counts and unique person cards. These limits and validation rules
are described in [the document contract](family-document.md).

## Development entry points

See [CONTRIBUTING.md](../CONTRIBUTING.md) for commands, checks and the source map.
