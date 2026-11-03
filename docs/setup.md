# Set up a family tree

Each checkout and deployment represents one family tree. Local use needs only
Node.js 22 and npm; hosting uses Vercel and one Upstash Redis database.

## Start locally

In a fresh checkout, run:

```sh
npm ci
npm run setup
npm run dev
```

Setup guides you through:

1. Starting an empty family or importing an existing JSON file. Both full
   documents and nested trees are detected automatically. Full documents retain
   their title and unconnected people; a nested tree uses the title you enter.
2. Choosing the shared viewing password and a different owner password.
   Password entry is hidden and both passwords must be confirmed.
3. Preparing local configuration and login storage.

The import path can be absolute or relative to the checkout. Windows paths such
as `C:\Users\you\Downloads\family.json` work, including paths with spaces and
paths surrounded by quotes. The contents must be JSON; TypeScript source modules
containing imports, exports or function calls need conversion first. Use the
editor's full-document JSON download when transferring an existing family.

Open <http://localhost:3000/edit> with the owner password. Add people and unions,
choose a starting person, and select **Enregistrer**. Open `/` to see the saved
tree. An empty family can be edited progressively before choosing a root.

The shared password allows viewing; the owner password also allows editing.
The [editor guide](family-editor.md) covers data entry, recovery and transfers.

Setup stores private configuration in the ignored `.env` file and family data
in `.data/family.json`. Password recovery copies are reversible, not encrypted;
anyone who can read those copies can recover the passwords. Keep `.env`, `.data`
and downloaded exports private. Do not place them under `public/` or commit them.

## Existing installations and interrupted setup

You can rerun `npm run setup`. Existing credentials, session secrets, family data,
revision history and login attempts are preserved. Missing passwords are prompted
for; existing passwords are not requested or changed. Before updating an existing
`.env`, setup saves its original contents under `.data/backups/setup-*/.env`.

Stop any running app before setup, and restart it afterward to load changed
configuration. If a step fails or you cancel, rerun the same command to continue.
Completed steps remain in place. Invalid existing configuration or family data
is reported rather than reset.

Setup manages `.env`. If settings also exist in the shell, `.env.local`,
`.env.development` or `.env.development.local`, consolidate the application's
settings into `.env` before running it. Setup stops rather than silently editing
a file that those overrides would hide.

Without Redis credentials, login uses local SQLite. If both Redis REST settings
are already configured, setup preserves them without testing or changing that
hosted store. Family data remains local in either case. New family files created
by setup must be inside `.data`; existing configured files elsewhere can be kept.

An interrupted process may leave `.data/setup.lock`. First stop any setup process
using this checkout, then remove that lock and rerun setup. Do not remove another
running process's lock.

Use the separate `auth:configure` and `auth:configure-owner` commands when you
intend to change passwords; setup is for preparing or completing an installation.

## Try another family

Use a separate checkout directory, run the three local commands there, and choose
an empty family or its JSON import. Keep its `.env` and `.data` independent from
the first checkout. Stop the first development server before starting the second,
or use the new server's actual address if it chooses another port.
Setup deliberately keeps an existing family rather than
offering to overwrite it. The editor can import into an existing family with
confirmation when that is intended.

## Host on Vercel without the Vercel CLI

The local setup command does not create cloud resources or deploy the site.
Use the dashboards for the initial hosted configuration:

1. [Import the repository into Vercel](https://vercel.com/docs/projects),
   using the Next.js framework preset and Node.js 22.
2. [Connect Upstash Redis to the project](https://upstash.com/docs/redis/howto/vercelintegration)
   for the Production environment. Verify that the project has the REST URL and
   writable REST token under `KV_REST_API_URL` and `KV_REST_API_TOKEN`. If the
   integration uses another prefix, add these names using the corresponding
   values from Upstash.
3. In the project's [environment settings](https://vercel.com/docs/environment-variables),
   add `PASSWORD_HASH`, `OWNER_PASSWORD_HASH` and `SESSION_SECRET` from your
   private local `.env`. Copy the values without their outer dotenv quotes.
   Store credentials as secret values. Optionally add `PASSWORD_RECOVERY` and
   `OWNER_PASSWORD_RECOVERY` too, retaining their inner JSON encoding for recovery.
4. Leave `FAMILY_DATA_FILE` and `DATABASE_URL` unset. Keep `FAMILY_INSTANCE_ID`
   unset for the default `main` family, or choose a stable instance ID before
   entering data. Deploy or redeploy after saving the hosted configuration.
5. Open the hosted `/edit` with the owner password. For an empty installation,
   enter the first records or import a JSON file, then select **Enregistrer**.
   Local data is never uploaded by deployment. To transfer your local family,
   first use **Télécharger le document complet** in the local editor, then import
   that download in the hosted editor.
6. Open the hosted `/` and verify the saved tree using the shared viewing password.

If the initial deployment was attempted before all environment settings were
available, save the missing settings and redeploy. No family data is created
during the build; the first owner save initializes the selected store.

Production and Preview use different family namespaces. A preview needs its own
credentials and initial family save; it does not show Production data automatically.
Keep separate credentials for each environment. For another family's deployment,
use a separate Vercel project and either a separate Redis database or a distinct,
stable `FAMILY_INSTANCE_ID`. Two projects sharing both the database and the
instance ID use the same family data.

Keep independent full-document downloads as backups. Deployment and scheduled
backup automation are a subsequent step; family edits themselves need no redeploy.
