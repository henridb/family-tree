# Editing your family

Open `/edit` to add people, connect partners and children, choose the displayed
root, and correct existing information. This uses a separate owner password.
The shared family password continues to grant viewing access only.

## Enable owner access

After configuring the existing viewing credentials, run:

```sh
npm run auth:configure-owner
```

Enter and confirm a separate owner password privately. Reusing the shared
viewing password is rejected. The command updates `OWNER_PASSWORD_HASH` and
`OWNER_PASSWORD_RECOVERY` in the ignored `.env` file. It preserves the viewing
password, its recovery copy, and the session secret. Restart the local app.

For Vercel, copy the generated `OWNER_PASSWORD_HASH` into the project's private
settings for the intended environment, without its surrounding `.env` quotes,
then redeploy. Keep your current `PASSWORD_HASH` and `SESSION_SECRET` unchanged.
Do not paste passwords or hashes into issues or commit them. No additional
service or individual user account is required.

Without an owner hash, editing is disabled and the viewer still works. Owner
sessions expire after seven days. Changing or removing the owner hash revokes
existing owner sessions without revoking viewing sessions. **Quitter l’édition**
ends only the owner session. Owners can also open the saved tree using their
owner session; family members continue to use the shared viewing password.

## Recover the owner password

New owner configurations save a recovery copy automatically. For an owner
password configured earlier, save its recovery copy without changing the
password or invalidating sessions:

```sh
npm run auth:save-existing-owner
```

Enter the current owner password privately. The command verifies it against the
existing owner hash and updates only `OWNER_PASSWORD_RECOVERY`. It preserves
both password hashes, viewing recovery metadata, and the session secret. If the
password has already been forgotten and no recovery copy exists, the hash alone
cannot recover it.

To display the saved owner password locally:

```sh
node --env-file=.env -e "console.log(JSON.parse(process.env.OWNER_PASSWORD_RECOVERY))"
```

For hosted recovery, keep `OWNER_PASSWORD_RECOVERY` in the project's private
environment settings too, just as for `PASSWORD_RECOVERY`. The app does not read
either recovery value. These copies use recoverable encoding, not encryption;
anyone who can read them can recover the passwords. Keep them private.

## Make changes

Changes remain in a local browser draft until you select **Enregistrer**. The
next viewer fetch sees the saved version; saving data does not deploy code.
Avoid closing a tab with unsaved changes; the editor asks before discarding them.

- Add a person, then select their record to edit their name, sex, birth date,
  and deceased marker. Leave unknown dates empty; partial years and months are
  supported. Permanent identities are preserved when details change.
- People marked **Sans lien** have no partnership or parent relationship yet.
  They can remain in the document while you enter information progressively.
- Add a union, select its partners, and attach existing people as its children.
  Each child belongs to one parental union. Reorder children and unions with
  their up/down buttons; these orders affect the displayed tree.
- Removing a union or child link keeps the people. A person can be deleted only
  after their relationship references have been removed. Deleting the selected
  root clears the root selection.
- Select a root, or leave it unset while entering data. The editor rejects
  invalid relationships and selected views that the current viewer cannot render.
  The document contract describes the current two-partnership and unique-card
  limitations.

## Concurrent edits and recovery

An editor saves against the revision originally loaded. If another tab or owner
has saved first, the stale save is rejected and its draft stays in the browser.
Download that draft if needed, then select **Recharger la version enregistrée**.
The editor does not merge competing drafts automatically.

If the save response is lost, the save may still have succeeded. Reload before
retrying. A server failure never silently switches to another family or service.

The **Versions précédentes** section retains ten previous revisions. Restoring
one creates a new revision and preserves the version being replaced. Restoration
also checks the current revision and viewer compatibility. Keep downloaded
backups independently of this recent history.

## Import and export

**Télécharger le document complet** preserves all people, including unconnected
ones, relationships, ordering, selected root, and metadata. **Télécharger le JSON
de l’arbre** exports only the selected view. Downloads contain private family
information; store them privately.

Select a JSON file; its format is detected automatically. A valid import
replaces the browser draft, with confirmation if it has pending changes. It
does not replace the saved family until **Enregistrer** is selected. Invalid
imports preserve the draft. Destination revision numbers are managed by the
store rather than taken from the imported file.

## Local files

Outside Vercel, the editor uses the same private file as the viewer. Existing
plain documents remain readable. On the first editor save, the file becomes one
storage envelope containing the current document and recent history. Use the
editor's full-document download to transfer data; this storage envelope is not
an import/export format.

Local application saves use an exclusive sibling `.lock` file and atomic
replacement of the document and history together. Do not edit the file manually
while using the editor. If the process is forcibly stopped during a save and a
lock remains, stop all app processes using that file before removing its sibling
`.lock` and restarting. The editor never automatically removes another writer's
lock. Keep the containing directory writable and on persistent local storage.

Hosted deployments continue to use the environment's Redis namespace. Local
editing never writes to Production merely because hosted credentials are present.
