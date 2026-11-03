# Family document storage

The storage layer saves a complete [family document](family-document.md), with
its recent revisions, in the existing Upstash Redis service. It is server-only.
The authenticated viewer projects its current document; the owner API handles
editing and recovery. Outside Vercel, the same operations use a private local file.

## Connecting a store

`createRedisFamilyStore` accepts the existing Upstash REST URL and token, an
explicit `environment` (`production`, `preview`, or `development`), and an
`instanceId`. IDs contain only letters, numbers, underscores, and hyphens, with
a maximum length of 128 characters. The combination identifies one family store.

Use different IDs for separate preview branches and local development sessions.
Preview and development environments must not select the production scope.
Family keys are separate from the existing login-counter keys. Creating the
store object does not initialize a family, issue a request, or set an expiry.

Application authorization belongs at the calling API boundary. This module does
not make a shared viewing session an editing session. The owner API also checks
selected-view compatibility before saving a document as
displayable; the store itself preserves any valid document, including unconnected
records and relationship shapes beyond the current viewer's capabilities.

## Reads, saves, and initialization

| Operation                                    | Result                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `read()`                                     | A validated family document, or `null` if no family has been saved |
| `save(document, null)`                       | Initialize only if the store is still empty                        |
| `save(document, revision)`                   | Replace only the revision the caller edited                        |
| `history()`                                  | Up to ten previous documents, newest first                         |
| `restore(previousRevision, currentRevision)` | Restore retained content as a new revision                         |
| `exportJson(options?)`                       | Export the current document or its nested tree                     |
| `importJson(text, revisionOrNull, options?)` | Validate and save an import using the same conflict checks         |

The initial stored revision is zero. Each replacement increments it by one.
Pass the revision originally loaded for editing; do not fetch a new revision
immediately before saving an older edit. Revision values in imported documents
do not replace the destination store's counter.

A conflicting save throws `FamilyStoreConflictError` and leaves the winner's
data and history intact. Reload the family and reconcile the changes before
trying again. Saves copy their inputs before asynchronous storage access; editing
a supplied or returned object cannot change stored records.

Initialization is an explicit operation, not a deployment side effect. An
existing family cannot be replaced by repeating a create-only initialization.

## History and recovery

Each successful replacement retains the previous current document, up to ten
previous revisions. Current content and history change together through one
atomic Redis comparison and replacement. Data has no automatic expiry.

Restoring revision 3 while editing revision 7 creates revision 8, containing the
content of revision 3. Revision 7 remains the newest historical entry. Restoring
does not rewind the counter or remove the ability to recover the pre-restore
family. A revision outside retained history must be recovered from an export.

History shares the current family's Redis key. Keep independent full-document
exports as well; scheduled backups to the private instance repository belong to
the later CI/backup milestone.

Malformed stored data and unsupported schema/storage versions fail explicitly.
They do not become an empty family and are not overwritten by import or save.
Unavailable storage also fails explicitly, without falling back to a sample or
local family. Invalid imports are rejected before storage access.

Writes are not retried automatically. If a connection fails after Redis accepted
a save, the response may be lost even though the change was committed. Reload
before retrying: the revision check prevents a stale retry from overwriting it.

## JSON formats

`importFamilyJson(text, options?)` and `exportFamilyJson(document, options?)`
are storage-independent helpers. Import detects the format automatically unless
`format` is supplied explicitly. Export defaults to `document`.

- `document` preserves the complete document, including unconnected people,
  partnership IDs, title, selected root, revision, and schema version. Use this
  format for backups and editing outside the application.
- `tree` accepts or produces the current nested tree format. Person IDs are
  required and birth dates are calendar strings. Import assigns new partnership
  IDs and revision zero; an optional `title` supplies the new document title.
  Export includes only the selected view and therefore cannot preserve records
  outside it or the full document's metadata. Export requires a selected root
  and a shape supported by the current projection.

Nested imports validate each person and relationship container before conversion.
Invalid dates, wrong container types, and unknown fields report their original
JSON field paths. Detection uses the top-level document fields to distinguish a
full document from a nested person tree, then validates that format. Malformed
documents are rejected without retrying them as a different format.

The helpers do not read or write files or hosted data. `FamilyStore.importJson`
performs the explicit save, using the supplied expected destination revision.
The [owner editor](family-editor.md) provides file selection, draft import,
downloads, and revision recovery behind separate editing access.

## Verification

The viewer reads the stored document through its existing authenticated tRPC
query. It does not return unconnected records or storage history. Production,
Preview, and Development use different Redis keys. See
[migration and local data](family-migration.md) for initial import and configuration.

Run `npm run test:family-store` for isolated storage, import/export, recovery,
concurrency, failure handling, and Upstash SDK checks. No hosted credentials are
needed. The normal SDK tests use a local HTTP fixture modeling Redis responses;
they do not execute the Lua script.

If `redis-server` and `redis-cli` are installed, the same command additionally
starts a temporary loopback Redis server and executes the actual save script
through the SDK's local REST fixture. This test disables Redis persistence and
stops only the process it started. It is explicitly skipped when those tools
are unavailable.
