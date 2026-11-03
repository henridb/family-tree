# Change or recover passwords

The viewing password lets relatives explore the tree. The separate owner
password allows editing. Keep the owner password private and choose a different
value from the viewing password.

Run the commands below in your local project folder. Stop the local server
first, then restart it after configuration changes.

## Change a password

```sh
npm run auth:configure       # change the shared viewing password
npm run auth:configure-owner # change the owner password
```

Each command privately asks for the new password and confirmation. The commands
accept 6–1024 characters and update your ignored `.env` file. Changing the viewing
password signs out existing sessions. Changing only the owner password signs
out owners while preserving viewing access.

For a hosted site, copy the updated settings to Vercel's private Production
environment variables and redeploy. A viewing-password change updates
`PASSWORD_HASH`, `SESSION_SECRET` and `PASSWORD_RECOVERY`; an owner-password
change updates `OWNER_PASSWORD_HASH` and `OWNER_PASSWORD_RECOVERY`. Local
configuration does not update the hosted settings automatically.

## Keep a recovery copy of an existing password

Setup and password configuration save recovery copies automatically. For an
older password without a recovery copy, run the corresponding command:

```sh
npm run auth:save-existing
npm run auth:save-existing-owner
```

Enter the current password privately. The command verifies it and adds recovery
metadata without changing the password or signing out existing sessions.

## Read a saved recovery copy

The following commands display the saved password in your terminal. Run only
the one you need, somewhere other people cannot see your screen:

```sh
node --env-file=.env -e "console.log(JSON.parse(process.env.PASSWORD_RECOVERY))"
node --env-file=.env -e "console.log(JSON.parse(process.env.OWNER_PASSWORD_RECOVERY))"
```

Recovery is reversible encoding, not encryption. Anyone who can read the
recovery values can recover the passwords. Keep `.env` and its backups private.
If no recovery copy exists and you have forgotten the password, its hash alone
cannot recover it; configure a new password instead.

You do not need to copy recovery values to Vercel. Keep your local `.env` or a
private backup so you can read them later. Vercel's
[Secret variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
cannot be read back after saving, so storing a recovery copy there does not
replace a readable private backup.

Recovery settings are optional. The application uses the password hashes for
login; editing a recovery value alone does not change a password.
