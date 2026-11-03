# Family migration and local data

The viewer now reads a versioned family document instead of a tree embedded in
application source. Builds and deployments never import or initialize a family.
Initialize the hosted document before deploying this change over an existing site.
The [owner editor](family-editor.md) supports subsequent data entry and transfers.
For a new local installation, use [guided setup](setup.md). The hosted editor can
also initialize an empty store; the command below supports a separately verified
import before deployment when replacing an existing installation.

## Local development

Keep your full document in `.data/family.json`, or set `FAMILY_DATA_FILE` to its
private path. The viewer reloads the file on each request. Outside Vercel, this
file is the family source even if Redis is configured for sign-in. The older
SQLite `Person` table is not used for family data.

The `.data/` directory is excluded from Git, Vercel CLI uploads, lint, and type
checking. Keep real exports and backups there, never under `public/` or imported
by application code. Do not commit credentials or real family records to a
public template. Existing records in private Git history require a separate
publication strategy; deleting the old source file does not erase that history.

Missing data and an unset root are different states: an absent document needs
initialization, while a valid document can contain unconnected people and no
selected root. Neither state triggers sample data or automatic seeding.

## Hosted namespaces

Vercel uses `KV_REST_API_URL` and `KV_REST_API_TOKEN` with its `VERCEL_ENV`
(`production`, `preview`, or `development`). `FAMILY_INSTANCE_ID` defaults to
`main`. For example, the production family key is
`family-tree:production:family:main`. Preview deployments share their Preview
instance, separate from Production. Use fictional data there.

Leave `FAMILY_DATA_FILE` unset on Vercel. An unknown environment or a local-file
override on Vercel is an error, never a reason to fall back to another dataset.
Configure the existing viewing credentials separately for each hosted environment
that needs sign-in. Keep the current Production password hash and session secret
to preserve existing access and sessions.

## Initial import

Use Node 22. Put writable Redis credentials in the ignored
`.env.family-migration.local` file at the repository root:

```dotenv
KV_REST_API_URL="https://your-store.upstash.io"
KV_REST_API_TOKEN="your-writable-token"
```

The command reads only this dedicated environment file plus inherited variables;
it does not overwrite your local `.env`. Confirm that these credentials belong
to the intended store. The destination environment and instance are mandatory.

First validate the document and make a private backup without network access:

```sh
npm run family:initialize -- --input .data/family.json --environment production --instance main
```

Each run creates a new private folder under `.data/backups/` with the original
input and the validated full document. The command prints counts, backup path,
and destination key, without names or credentials. It validates that the chosen
root can be displayed before any write. An unset root is allowed.

To import a hand-written nested tree JSON, add `--format tree` and optionally
`--title "My family"`. The input needs stable person IDs. Keep the resulting
full-document backup: it contains the newly assigned permanent partnership IDs.
Use that full document for later transfers.

Add `--write` only when the destination is correct:

```sh
npm run family:initialize -- --input .data/family.json --environment production --instance main --write
```

The command initializes an absent key at revision zero. It cannot overwrite an
existing document. It then reads back and compares the complete document and the
displayed tree. If a network error occurs, inspect the destination before trying
again: the write may have succeeded even if its response was lost. There is no
automatic retry, reset, or replacement flag.

For a rehearsal, use an isolated Development instance and its credentials.
Verify the read-back result before initializing Production. Keep an independent
copy of the backup on durable private storage. Redis's recent revision history
does not replace that backup.

The one-time conversion from the former source must also compare the projected
tree with the original, preserving person IDs, date precision, relationship order,
and deceased/divorced markers. Omitted false flags and empty lists are the only
canonicalization differences. Retain an original nested-tree export before
removing the source. Do not seed real data into Preview as part of a deployment.

## Verification

`npm run test:family-source` checks local and hosted source selection, namespace
isolation, offline validation, backups, and create-only initialization with
fictional data. Production HTTP authentication tests also exercise the stored
family, empty and unset-root states, edits between requests, and invalid data.
These checks do not require hosted credentials.
