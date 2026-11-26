"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  FamilyDocumentInput,
  FamilyPersonInput,
} from "@/lib/family-document";
import { fieldStyle, selectStyle, personLabel, newId } from "./editor-fields";
import { BirthDateField } from "./birth-date-field";
/**
 * Filter, create and edit people in the parent draft, including people not yet
 * connected to a union.
 *
 * Keep permanent IDs stable and surface date-validation markers supplied by the
 * parent. Allow deletion only after relationship references are removed,
 * clearing the selected root when that person is deleted.
 */
export function PeopleEditor({
  draft,
  update,
  invalidBirthdates,
}: {
  draft: FamilyDocumentInput;
  update: (document: FamilyDocumentInput) => void;
  invalidBirthdates: ReadonlySet<string>;
}) {
  const t = useTranslations();
  const [selectedPerson, setSelectedPerson] = useState<string>();
  const [filter, setFilter] = useState("");
  const person = draft.people.find((p) => p.id === selectedPerson);
  const linked = new Set(
    draft.partnerships.flatMap((p) => [...p.personIds, ...p.childIds]),
  );
  /** Replace one person by permanent ID in a copied people array. */
  function updatePerson(value: FamilyPersonInput) {
    update({
      ...draft,
      people: draft.people.map((p) => (p.id === value.id ? value : p)),
    });
  }
  return (
    <section className="space-y-4 rounded-xl border border-amber-900/20 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {t("editor.peopleCount", { count: draft.people.length })}
        </h2>
        <Button
          variant="outline"
          onClick={() => {
            const value: FamilyPersonInput = {
              id: newId("p"),
              name: "",
              surname: "",
              sex: "male",
              dead: false,
            };
            update({ ...draft, people: [...draft.people, value] });
            setSelectedPerson(value.id);
          }}
        >
          {t("editor.addPerson")}
        </Button>
      </div>
      <label className={fieldStyle} htmlFor="people-filter">
        {t("editor.filterPeople")}
        <Input
          type="search"
          id="people-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <ul
          className="max-h-80 space-y-1 overflow-auto"
          aria-label={t("editor.peopleLabel")}
        >
          {draft.people
            .filter((p) =>
              personLabel(p, t("common.unnamed"))
                .toLocaleLowerCase()
                .includes(filter.toLocaleLowerCase()),
            )
            .map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPerson(p.id)}
                  aria-pressed={person?.id === p.id}
                  className={`w-full rounded border p-2 text-left ${person?.id === p.id ? "border-amber-800 bg-amber-100" : "border-amber-900/15"}`}
                >
                  {personLabel(p, t("common.unnamed"))}
                  {p.birthdate &&
                    !invalidBirthdates.has(p.id) &&
                    ` (${p.birthdate})`}
                  {invalidBirthdates.has(p.id) && (
                    <span className="ml-2 text-xs text-red-800">
                      {t("editor.invalidDate")}
                    </span>
                  )}
                  {!linked.has(p.id) && (
                    <span className="ml-2 text-xs">
                      {t("editor.unconnected")}
                    </span>
                  )}
                </button>
              </li>
            ))}
        </ul>
        {person ? (
          <div className="space-y-3" aria-label={t("editor.personLabel")}>
            <label className={fieldStyle} htmlFor="person-name">
              {t("person.firstName")}
              <Input
                id="person-name"
                value={person.name}
                onChange={(e) =>
                  updatePerson({ ...person, name: e.target.value })
                }
              />
            </label>
            <label className={fieldStyle} htmlFor="person-surname">
              {t("person.birthSurname")}
              <Input
                id="person-surname"
                value={person.surname}
                onChange={(e) =>
                  updatePerson({ ...person, surname: e.target.value })
                }
              />
            </label>
            <label className={fieldStyle}>
              {t("person.sex")}
              <select
                className={selectStyle}
                value={person.sex}
                onChange={(e) =>
                  updatePerson({
                    ...person,
                    sex: e.target.value as FamilyPersonInput["sex"],
                  })
                }
              >
                <option value="male">{t("person.male")}</option>
                <option value="female">{t("person.female")}</option>
              </select>
            </label>
            <BirthDateField
              key={person.id}
              value={person.birthdate ?? ""}
              invalid={invalidBirthdates.has(person.id)}
              onChange={(birthdate) => {
                const value = { ...person };
                if (birthdate) value.birthdate = birthdate;
                else delete value.birthdate;
                updatePerson(value);
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={person.dead ?? false}
                onChange={(e) =>
                  updatePerson({ ...person, dead: e.target.checked })
                }
              />
              {t("editor.deceased")}
            </label>
            <Button
              variant="outline"
              disabled={linked.has(person.id)}
              onClick={() => {
                if (window.confirm(t("editor.confirmDeletePerson"))) {
                  update({
                    ...draft,
                    rootPersonId:
                      draft.rootPersonId === person.id
                        ? null
                        : draft.rootPersonId,
                    people: draft.people.filter((p) => p.id !== person.id),
                  });
                  setSelectedPerson(undefined);
                }
              }}
            >
              {t("editor.deletePerson")}
            </Button>
            {linked.has(person.id) && (
              <p className="text-xs">{t("editor.unlinkFirst")}</p>
            )}
          </div>
        ) : (
          <p className="text-sm">{t("editor.selectPerson")}</p>
        )}
      </div>
    </section>
  );
}
