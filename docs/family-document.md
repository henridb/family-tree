# Family document contract

This is the version 1 data contract used by the family editor and storage
layer. It is implemented independently of persistence. The website reads the
stored document and projects its selected descendant view.

## Document and view

A document contains every entered person and partnership. A view contains the
selected root and the descendant branches the current viewer can represent.
People may be entered before they are connected to the root. They remain in the
document and in exports, even when absent from the selected view. The editor
identifies people without relationship links so entry can happen progressively.

`rootPersonId: null` means no root has been selected. This is valid for an empty
installation and while entering its first records. Projection returns `null`;
the editor supports entering data before selecting a root.

```json
{
  "schemaVersion": 1,
  "revision": 0,
  "title": "Famille exemple",
  "rootPersonId": "alex",
  "people": [
    {
      "id": "alex",
      "name": "Alex",
      "surname": "Martin",
      "sex": "male",
      "birthdate": "1940"
    },
    {
      "id": "bea",
      "name": "Béatrice",
      "surname": "Durand",
      "sex": "female",
      "birthdate": "1942-02"
    },
    {
      "id": "cam",
      "name": "Camille",
      "surname": "Martin",
      "sex": "female"
    }
  ],
  "partnerships": [
    {
      "id": "unionab",
      "personIds": ["alex", "bea"],
      "childIds": ["cam"]
    }
  ]
}
```

`schemaVersion` identifies the document format. `revision` is a nonnegative safe
integer reserved for the storage layer's conflict checks. Converting an existing
tree creates revision zero; projection never changes it. Future schema versions
need an explicit migration and are rejected by the version 1 parser.

## People

- IDs are permanent strings matching `^[a-z][a-z0-9]*$`. They must be unique
  among people and must survive corrections to names and dates.
- `name` and `surname` retain the entered spelling, accents, and whitespace.
  Empty names are accepted to preserve incomplete existing records.
- `surname` is the source surname. Married display names remain derived.
- `birthdate` is omitted when unknown, or contains `YYYY`, `YYYY-MM`, or a
  valid `YYYY-MM-DD`. Partial dates stay partial; timestamps are rejected.
- `dead` means "marked as deceased" and defaults to `false` when omitted.
  Explicit `true` and `false` are preserved; `null` is rejected. A false value
  means no deceased marker is set, rather than a verified assertion that the
  person is alive. Parsed documents and exports include this flag for everyone.
- Version 1 retains the current `male`/`female` sex values. Adding other values
  requires corresponding naming and display support; relationships do not infer
  gender roles or require partners of different sexes.

`match`, `searchHighlights`, generations, ancestry paths, and displayed surnames
belong to a view and are not stored. Unknown document fields are rejected, so
typos and unsupported metadata cannot silently disappear on import.

## Partnerships and ordering

Each partnership has its own permanent ID, unique among partnerships, exactly
two distinct person references, an ordered `childIds` array, and a `divorced`
flag. This flag means "marked as divorced" and defaults to `false` when omitted;
`null` is rejected. A false value does not assert that the partners are married.
The two participants have equal relationship roles; their tuple position does
not designate a father, mother, or branch owner.

Version 1 stores one partnership per unordered pair of people. A child belongs
to at most one parental partnership and cannot appear twice within it. Repeated
relationship events between the same two people, separate biological/adoptive
parent sets, and single-parent relationships need a later contract extension.
No placeholder people are created automatically for missing parents.

The relative order of partnerships in the document is their display order for
each participant. The order of `childIds` is the sibling display order. Neither
is inferred from names, dates, IDs, or returned database order. Reordering people
does not change the diagram. A future per-person partnership order would require
an explicit addition to the format.

All references, IDs, pairs, and parent-child relationships are validated across
the entire document, including records outside the view. Ancestry cycles and
self-parenting are invalid. Partnership links themselves need not form a tree;
whether a selected view can represent them is a separate question.

## Projection and current viewer limits

`projectFamilyDocument(value, rootPersonId?)` validates the document and returns
the existing nested `person` transport, using the supplied root override or the
stored root. Each partnership's children stay attached to its projected partner.
A descendant selected as root omits its ancestors without deleting them from
the document or changing the stored root.

Projection fails with `FamilyProjectionError` when the selected shape would:

- Display one person more than once (`REPEATED_PERSON`). The current card IDs,
  connectors, collapse state, and context lookups assume one occurrence.
- Omit additional partnerships belonging to someone displayed only as a partner
  (`PARTNER_BRANCHES`). Choosing a different root can sometimes represent them.
- Give a branch more than two partners (`TOO_MANY_PARTNERSHIPS`). The current
  desktop diagram lays out at most two partner cards, even though the document
  can store more.
- Use an unknown root override (`UNKNOWN_ROOT`). Invalid references in the
  document itself produce schema validation errors with field paths.

These are limits of this projection and viewer, not reasons to discard valid
stored records. Editor mutations check the chosen projection as well as
document validity before claiming that the edited family is displayable. The
editor must explain an unsupported view without removing its records.

Successful projection emits fresh objects. It does not mutate the document or
attach transient view state to stored people. Validation and projection use
iterative ancestry/branch traversal so deep input does not exhaust the call stack.
The current React viewer and its other helpers still have their own depth and
size constraints; this is not a claim that the UI can render arbitrarily large
families.

## Conversion and verification

`familyDocumentFromTree(tree, options?)` converts a typed existing tree into a
document. Person IDs and all stored person/relationship fields are preserved;
view annotations are omitted. New partnership IDs are assigned once and must
then be retained. An optional ID factory supports reproducible conversion.
The default title is `Arbre familial`; callers can supply a title.

Empty optional partner/child lists are canonicalized to omission when projected.
Omitted `dead` and `divorced` flags become explicit `false` values in the document
and projected tree. Explicit `true` and `false` remain present. Unknown birth
dates stay omitted.
Conversion, parsing, and projection do not share mutable objects with their
inputs. A JSON serialization round trip preserves the document's values.

Run `npm run test:family-document` for fictional-data contract, projection,
round-trip, non-mutation, invalid-reference, and unsupported-view checks.

The [storage and JSON import/export layer](family-storage.md) implements explicit
Upstash saves, revision checks, and recovery using this contract. The protected
viewer projects this document on request. See [migration and local data](family-migration.md)
for importing an existing family, and [the owner editor](family-editor.md) for
subsequent data entry and recovery.
