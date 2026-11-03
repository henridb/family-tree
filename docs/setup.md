# Set up your own family tree

This guide takes you from a computer with no development tools installed to a
website your family can visit. You will install two tools, make your own copy of
the project, choose passwords locally, then configure hosting in your browser.
You do not need to install the Vercel command-line tool or a code editor.

Each installation is for one family tree. The website has two passwords: a shared
password for viewing, and a different owner password for editing.

## 1. Install Git and Node.js

Git downloads the project onto your computer. Node.js runs the application and
includes npm, which installs its dependencies. Use **Node.js 22.x**.

### Windows: use PowerShell and WinGet

Open **PowerShell** from the Start menu. A terminal is a window where you type
commands. Run these commands one at a time, pressing Enter after each:

```powershell
winget install --id Git.Git --exact --source winget
winget install --id OpenJS.NodeJS.22 --exact --source winget
```

The Node.js installer adds Node and npm to PATH, which lets the terminal find
their commands. Follow the installation prompts, then close PowerShell or
Windows Terminal completely and reopen PowerShell to pick up the updated PATH.

If `winget` is not found, install or update **App Installer** using
[Microsoft’s WinGet instructions](https://learn.microsoft.com/en-us/windows/package-manager/winget/#install-winget),
then reopen PowerShell. You can also use the
[Git installer](https://git-scm.com/downloads) and
[Node.js 22 installer](https://nodejs.org/en/download).

If PowerShell reports that `npm.ps1` cannot run because scripts are disabled, so
either allow it to run (allowing scripts to run introduces a risk so we let you
look for how to do it) or use `npm.cmd` wherever the documentation says `npm`;
for example, `npm.cmd run setup`. This is a PowerShell script-policy issue,
separate from PATH.

### macOS or Linux: use your terminal and your package manager of choice

Install [Git](https://git-scm.com/downloads) and
[Node.js 22](https://nodejs.org/en/download) (with `apt`, `brew`, etc...), then
open **Terminal**.

### Check your installation

On either system, run:

```sh
git --version
node --version
npm --version
```

Each check should print a version; Node’s should start with `v22.`. If a command
is not found after installation, close the terminal completely, reopen it, and
check again. If needed, restart the computer.

## 2. Create your accounts and fork the project

1. Create a [GitHub account](https://github.com/signup). GitHub keeps your copy
   of the application code.
2. Create a [Vercel account](https://vercel.com/signup). Vercel hosts the website;
   signing in through GitHub makes connecting your copy easier.
3. Open [the Family Tree repository](https://github.com/henridb/family-tree).
   Select **Fork**, choose your own account as the owner, keep the name
   `family-tree`, and select **Create fork**. A fork is your own copy on GitHub.

Upstash stores the hosted family records. Its connection step later in this
guide may also ask you to create or sign into an Upstash account.

## 3. Download your fork

On **your fork's** GitHub page, select **Code**, choose **HTTPS**, and copy its
address. In the terminal, type `git clone`, a space, then paste that address.
It will look like this; replace `YOUR-USERNAME` with your GitHub username:

```sh
git clone https://github.com/YOUR-USERNAME/family-tree.git
cd family-tree
```

The first command creates a `family-tree` folder beneath the terminal's current
folder. The second enters it. Keep this folder: it will contain your local
configuration and any locally entered family data.

See GitHub's [forking guide](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo)
if you need help finding the buttons or cloning your fork.

## 4. Choose your passwords and start locally

Inside the `family-tree` folder, run:

```sh
npm ci
npm run setup
npm run dev
```

Wait for each command to finish before entering the next. The last command keeps
running while the local website is open.

Setup asks you to:

1. Start an empty family or import an existing JSON file. To try the fictional
   family pictured in the README, choose import and enter `examples/family.json`.
2. Enter and confirm a viewing password, then a different owner password.
   Nothing appears while typing passwords; this is normal.
3. Let setup prepare the local settings and storage.

Passwords must contain 6–1024 characters. Keep the owner password private;
give family members only the viewing password.

For an import, enter the path to your JSON file. Absolute paths such as
`C:\Users\you\Downloads\family.json` work, including spaces and surrounding
quotes. The file must contain JSON. A TypeScript `.ts` file needs conversion
before it can be imported.

Open <http://localhost:3000/edit> in your browser and sign in with the owner
password. Add people and unions, choose the starting person, and select
**Enregistrer**. Open <http://localhost:3000> to see the saved tree. If the
terminal reports a different port, use that address instead.

The editor lets you enter people progressively before connecting everyone or
choosing a starting person. See [the editor guide](family-editor.md) for details.

Setup creates a file named `.env` in the project folder. Files starting with a
dot may be hidden by your file manager. You will need some of its settings for hosting. On Windows, open it with Notepad using
**File → Open**, selecting **All files** if necessary. On macOS, hidden files
can be shown in Finder with Command+Shift+Period. Keep the file private: it
includes settings that can grant access to the site and recover its passwords.

## 5. Create the Vercel project

1. In the [Vercel dashboard](https://vercel.com/new), create a project by importing
   **your GitHub fork**. If it is missing, allow Vercel access to that repository.
2. Keep the **Next.js** framework preset. Set the Node.js version to **22.x** in
   the project settings if needed.
3. Continue to create the project. If Vercel immediately attempts a deployment,
   it may fail because the private settings are not present yet. Finish the
   following steps before retrying; you do not need to recreate the project.

## 6. Connect storage and copy your private settings

### Add Upstash Redis

From the project's storage/integrations area, find **Upstash Redis** in the
[Vercel Marketplace](https://vercel.com/marketplace). Create or connect a Redis
database and connect it to this project's **Production** environment. Follow
any Upstash account prompts.

In the project's **Settings → Environment Variables**, verify that the
integration supplied:

| Name                | Value comes from                                       |
| ------------------- | ------------------------------------------------------ |
| `KV_REST_API_URL`   | The Upstash REST URL                                   |
| `KV_REST_API_TOKEN` | The Upstash writable REST token, not a read-only token |

If the integration used another prefix, create variables with the exact names
above using the corresponding Upstash values. A `REDIS_URL` connection string
alone does not replace these two REST settings.

### Copy three values from your local `.env`

Add these variables for **Production**. Store them as **Secret** values:

| Name                  | What to copy                                     |
| --------------------- | ------------------------------------------------ |
| `PASSWORD_HASH`       | The value after `PASSWORD_HASH=` in `.env`       |
| `OWNER_PASSWORD_HASH` | The value after `OWNER_PASSWORD_HASH=` in `.env` |
| `SESSION_SECRET`      | The value after `SESSION_SECRET=` in `.env`      |

Copy only the value, removing any quotes around it. For example,
`SESSION_SECRET="example"` would become `example` in the dashboard. Copy the
generated hash strings for the two password variables, not the passwords you
typed during setup. Never paste the whole `.env` file into an issue or commit it.

Leave `DATABASE_URL` and `FAMILY_DATA_FILE` **unset on Vercel**. They describe
local files and are not needed for the hosted website. Leave `FAMILY_INSTANCE_ID`
unset for a single tree.

Keep `PASSWORD_RECOVERY` and `OWNER_PASSWORD_RECOVERY` in your private local
`.env` and backups; they are not required on Vercel. Anyone who can read them
can recover the passwords. See [password recovery](passwords.md).

The [Vercel environment-variable guide](https://vercel.com/docs/environment-variables)
and [Upstash integration guide](https://upstash.com/docs/redis/howto/vercelintegration)
describe the provider settings.

## 7. Redeploy and enter your hosted family

1. In the Vercel project's **Deployments** tab, open the deployment menu and
   select **Redeploy** after all settings are saved. Updated settings take effect
   in a new deployment. If a build still fails, inspect its build log for missing
   variable names and compare them with the tables above.
2. Once deployment succeeds, open the website's address with `/edit` at the end
   and sign in with your owner password.
3. Enter your family or import a JSON file, choose the starting person, and
   select **Enregistrer**.
4. Open the website's main address and verify the tree. Share that address and
   the viewing password with your relatives.

Your local family is **not uploaded by deployment**. To transfer it, open the
local editor, select **Télécharger le document complet**, then import that
download in the hosted editor and save. You can also start directly in the
hosted editor and keep the local example only for practice.

You can now stop the local server with **Ctrl+C** in its terminal. The hosted
website keeps running independently, and future family edits can be made in
its browser editor without deploying again. Keep independent full-document
downloads as backups; recent revision history does not replace them.

## Rerun setup or try another family

Stop the local server before rerunning `npm run setup`, then restart it afterward.
Setup preserves existing passwords, family data and revisions. It fills in
missing configuration rather than replacing a family. Use
[the password commands](passwords.md) when you intend to change credentials.

To try another family, clone into a separate directory and run setup there.
Keep each copy's `.env` and `.data` separate. For another hosted family, use
another Vercel project and a separate Redis database, or a distinct, stable
`FAMILY_INSTANCE_ID`. Sharing both the database and instance ID shares the data.

Production and Preview have separate family stores. Preview deployments need
their own credentials and initial family save. Configure Production first;
see [architecture](architecture.md) before setting up additional environments.

## Troubleshoot an interrupted local setup

You can rerun setup after cancelling or fixing an error; completed steps stay in
place. Before changing an existing `.env`, setup keeps its original contents in
`.data/backups/setup-*/.env`. Keep these backups private.

Setup manages `.env`. If application settings also exist in your shell,
`.env.local`, `.env.development` or `.env.development.local`, consolidate them
into `.env` first. Setup reports conflicting overrides rather than silently
editing a file the application would not use.

An interrupted setup can leave `.data/setup.lock`. Stop any setup process using
that copy before removing its lock and trying again. Do not remove a lock while
another process is still running. Invalid configuration or data is reported
rather than reset.
