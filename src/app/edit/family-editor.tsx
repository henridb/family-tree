"use client";

import { useEffect, useMemo, useState } from "react";
import { ZodError } from "zod";
import { PeopleEditor } from "./people-editor";
import { PartnershipsEditor } from "./partnerships-editor";
import { fieldStyle, selectStyle, personOptions } from "./editor-fields";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type RouterOutputs } from "@/trpc/react";
import {
  parseFamilyDocument,
  type FamilyDocument,
  type FamilyDocumentInput,
} from "@/lib/family-document";
import { projectFamilyDocument } from "@/lib/family-projection";
import { exportFamilyJson, importFamilyJson } from "@/lib/family-json";

const emptyDocument: FamilyDocument = {
  schemaVersion: 1,
  revision: 0,
  title: "Arbre familial",
  rootPersonId: null,
  people: [],
  partnerships: [],
};
type Snapshot = RouterOutputs["editor"]["read"];

/**
 * Download the validated document or selected nested tree as a JSON file, then
 * release its temporary object URL.
 */
function download(document: FamilyDocument, format: "document" | "tree") {
  const url = URL.createObjectURL(
    new Blob([exportFamilyJson(document, { format })], {
      type: "application/json",
    }),
  );
  const link = window.document.createElement("a");
  link.href = url;
  link.download = format === "document" ? "family.json" : "family-tree.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Load the owner snapshot and supply an explicit reload operation to the
 * editor.
 *
 * Avoid background window-focus refetches that could replace an active draft;
 * redirect unauthorized owners and provide retry feedback for failed reads.
 */
export function FamilyEditorLoader() {
  const router = useRouter();
  const query = api.editor.read.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (query.error?.data?.code === "UNAUTHORIZED")
      router.replace("/edit/login");
  }, [query.error, router]);
  if (query.isPending)
    return (
      <main className="p-8" role="status">
        Chargement de l’éditeur…
      </main>
    );
  if (!query.data)
    return (
      <main className="p-8" role="alert">
        Impossible de charger l’éditeur.{" "}
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  return (
    <FamilyEditor
      initial={query.data}
      reload={async () => {
        const result = await query.refetch();
        if (!result.data || result.error)
          throw new Error("Le rechargement a échoué.");
        return result.data;
      }}
    />
  );
}

/**
 * Edit a browser draft independently of the last loaded storage revision.
 *
 * Validate records and viewer compatibility before saving, preserve the draft
 * on conflicts, and require confirmation before discarding unsaved edits.
 * Imports replace only the draft; saves and restores use the loaded revision.
 * Keep detailed validation after the form to avoid shifting fields during
 * typing.
 */
function FamilyEditor({
  initial,
  reload,
}: {
  initial: Snapshot;
  reload: () => Promise<Snapshot>;
}) {
  const [base, setBase] = useState(initial.document);
  const [draft, setDraft] = useState<FamilyDocumentInput>(() =>
    structuredClone(initial.document ?? emptyDocument),
  );
  const [history, setHistory] = useState(initial.history);
  const [message, setMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const [loading, setLoading] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base ?? emptyDocument);
  const validation = useMemo(() => {
    try {
      const document = parseFamilyDocument(draft);
      const tree = projectFamilyDocument(document);
      return {
        document,
        tree,
        error: "",
        diagnostics: "",
        invalidBirthdates: new Set<string>(),
      };
    } catch (error) {
      const invalidBirthdates = new Set<string>();
      let message =
        error instanceof Error ? error.message : "Document invalide.";
      if (error instanceof ZodError) {
        const otherIssues = error.issues.filter((issue) => {
          const [field, index, property] = issue.path;
          if (
            field === "people" &&
            typeof index === "number" &&
            property === "birthdate"
          ) {
            const person = draft.people[index];
            if (person) invalidBirthdates.add(person.id);
            return false;
          }
          return true;
        });
        message = otherIssues[0]?.message ?? "";
      }
      return {
        document: null,
        tree: null,
        error: message,
        diagnostics:
          error instanceof ZodError
            ? JSON.stringify(error.issues, null, 2)
            : "",
        invalidBirthdates,
      };
    }
  }, [draft]);
  useEffect(() => {
    if (!dirty) return;
    /** Ask the browser to warn before leaving a page with unsaved draft changes. */
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  const save = api.editor.save.useMutation();
  const restore = api.editor.restore.useMutation();
  const logout = api.editor.logout.useMutation({
    /** Leave the editor after the owner logout succeeds. */
    onSuccess: () => window.location.replace("/edit/login"),
  });
  const busy =
    loading || save.isPending || restore.isPending || logout.isPending;
  /**
   * Replace the draft and clear stale mutation feedback without changing its
   * saved base revision.
   */
  function update(document: FamilyDocumentInput) {
    setDraft(document);
    setMessage("");
    save.reset();
    restore.reset();
  }
  /**
   * Accept a successful save or restore as the new draft/base and refresh
   * recovery choices.
   *
   * If the follow-up read fails, retain the confirmed saved document and report
   * only that history could not be refreshed.
   */
  async function acceptSaved(document: FamilyDocument) {
    setLoading(true);
    setDraft(document);
    setBase(document);
    setMessage(
      "Modifications enregistrées. Elles sont visibles dans l’arbre au prochain chargement.",
    );
    try {
      setHistory((await reload()).history);
    } catch {
      setMessage(
        "Modifications enregistrées. L’historique n’a pas pu être rechargé.",
      );
    } finally {
      setLoading(false);
    }
  }
  /**
   * Confirm discarding a dirty draft, then replace it with the latest saved
   * snapshot.
   *
   * Keep the existing draft if reloading fails and clear stale
   * validation-independent feedback only after a successful read.
   */
  async function reloadSaved() {
    if (
      dirty &&
      !window.confirm(
        "Abandonner les modifications non enregistrées et recharger l’arbre ?",
      )
    )
      return;
    setLoading(true);
    try {
      const snapshot = await reload();
      setBase(snapshot.document);
      setDraft(structuredClone(snapshot.document ?? emptyDocument));
      setHistory(snapshot.history);
      setMessage("Version enregistrée rechargée.");
      save.reset();
      restore.reset();
      setFileError("");
    } catch {
      setMessage("Impossible de recharger. Votre brouillon est conservé.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="min-h-dvh bg-amber-50 px-4 py-6 text-amber-950 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">
            Éditeur de l’arbre familial
          </h1>
          <div className="flex flex-wrap gap-3">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="self-center underline"
            >
              Voir l’arbre enregistré
            </a>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm("Quitter sans enregistrer le brouillon ?")
                ) {
                  setDraft(structuredClone(base ?? emptyDocument));
                  logout.mutate();
                }
              }}
            >
              Quitter l’édition
            </Button>
          </div>
        </header>
        <p>
          Les modifications restent dans ce brouillon jusqu’à l’enregistrement.
          Les personnes sans lien peuvent être ajoutées progressivement.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={busy || !validation.document || (!dirty && base !== null)}
            onClick={() => {
              setMessage("");
              save.mutate(
                { document: draft, expectedRevision: base?.revision ?? null },
                {
                  /** Adopt the confirmed saved document and refresh its revision history. */
                  onSuccess: (document) => void acceptSaved(document),
                },
              );
            }}
          >
            {save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void reloadSaved()}
          >
            Recharger la version enregistrée
          </Button>
          <span className="text-sm">
            {base ? `Version ${base.revision}` : "Arbre non initialisé"} ·{" "}
            {dirty
              ? "Modifications non enregistrées"
              : "Aucune modification en attente"}
          </span>
        </div>
        {message && (
          <p
            role="status"
            className="rounded border border-amber-900/20 bg-white p-3"
          >
            {message}
          </p>
        )}
        {(save.error ?? restore.error ?? logout.error) && (
          <p role="alert" className="rounded bg-red-50 p-3">
            {(save.error ?? restore.error ?? logout.error)?.message} Vous pouvez
            télécharger votre brouillon avant de recharger.
          </p>
        )}
        <fieldset disabled={busy} className="space-y-6 disabled:opacity-60">
          <legend className="sr-only">Contenu de l’arbre</legend>
          <section className="grid gap-4 rounded-xl border border-amber-900/20 bg-white p-4 sm:grid-cols-2">
            <h2 className="text-lg font-semibold sm:col-span-2">
              Arbre affiché
            </h2>
            <label className={fieldStyle} htmlFor="editor-title">
              Titre
              <Input
                id="editor-title"
                value={draft.title}
                onChange={(e) => update({ ...draft, title: e.target.value })}
              />
            </label>
            <label className={fieldStyle}>
              Personne de départ
              <select
                className={selectStyle}
                value={draft.rootPersonId ?? ""}
                onChange={(e) =>
                  update({ ...draft, rootPersonId: e.target.value || null })
                }
              >
                <option value="">Aucune pour le moment</option>
                {personOptions(draft.people)}
              </select>
            </label>
          </section>
          <PeopleEditor
            draft={draft}
            update={update}
            invalidBirthdates={validation.invalidBirthdates}
          />
          <PartnershipsEditor draft={draft} update={update} />
          <section className="space-y-3 rounded-xl border border-amber-900/20 bg-white p-4">
            <h2 className="text-lg font-semibold">Transférer et sauvegarder</h2>
            <p className="text-sm">
              Le document complet conserve toutes les personnes et les liens. Le
              JSON de l’arbre contient uniquement la vue choisie. Le format du
              fichier importé est détecté automatiquement.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!validation.document}
                onClick={() => download(validation.document!, "document")}
              >
                Télécharger le document complet
              </Button>
              <Button
                variant="outline"
                disabled={!validation.document || !validation.tree}
                onClick={() => download(validation.document!, "tree")}
              >
                Télécharger le JSON de l’arbre
              </Button>
            </div>
            <label className={fieldStyle} htmlFor="editor-import">
              Importer un fichier JSON (remplace le brouillon)
              <Input
                id="editor-import"
                type="file"
                className="cursor-pointer file:cursor-pointer"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (
                    !file ||
                    (dirty &&
                      !window.confirm(
                        "Remplacer le brouillon par le fichier importé ?",
                      ))
                  )
                    return;
                  setLoading(true);
                  void file
                    .text()
                    .then((text) => {
                      const document = importFamilyJson(text);
                      projectFamilyDocument(document);
                      update({ ...document, revision: base?.revision ?? 0 });
                      setFileError("");
                    })
                    .catch(() =>
                      setFileError(
                        "Fichier JSON invalide ou arbre incompatible avec la vue actuelle. Le brouillon est conservé.",
                      ),
                    )
                    .finally(() => setLoading(false));
                }}
              />
            </label>
            {fileError && <p role="alert">{fileError}</p>}
          </section>
          <section className="space-y-3 rounded-xl border border-amber-900/20 bg-white p-4">
            <h2 className="text-lg font-semibold">Versions précédentes</h2>
            <p className="text-sm">
              Les dix dernières versions sont conservées. Une restauration crée
              une nouvelle version ; elle n’efface pas la version actuelle.
              Téléchargez aussi des sauvegardes indépendantes.
            </p>
            <ul className="space-y-2">
              {history.map((previous) => (
                <li
                  key={previous.revision}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    Version {previous.revision} — {previous.title}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (
                        base &&
                        window.confirm(
                          "Restaurer cette version et remplacer le brouillon ?",
                        )
                      )
                        restore.mutate(
                          {
                            revision: previous.revision,
                            expectedRevision: base.revision,
                          },
                          {
                            /**
                             * Adopt the restored document's new revision and
                             * refresh recovery choices.
                             */
                            onSuccess: (document) => void acceptSaved(document),
                          },
                        );
                    }}
                  >
                    Restaurer
                  </Button>
                </li>
              ))}
            </ul>
            {history.length === 0 && (
              <p className="text-sm">Aucune version précédente.</p>
            )}
          </section>
        </fieldset>
        {!validation.document && (
          <section
            aria-labelledby="editor-validation-heading"
            className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4"
          >
            <h2
              id="editor-validation-heading"
              className="text-lg font-semibold"
            >
              Validation du document
            </h2>
            <p role="status" className="text-sm">
              L’enregistrement est bloqué :{" "}
              {validation.error ||
                "corrigez les dates de naissance signalées dans les fiches des personnes."}
            </p>
            {validation.diagnostics && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Détails de la validation
                </summary>
                <textarea
                  readOnly
                  rows={12}
                  aria-label="Diagnostics complets de validation"
                  value={validation.diagnostics}
                  className="mt-3 max-h-80 w-full resize-y rounded border border-red-200 bg-white p-3 font-mono text-xs"
                />
              </details>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
