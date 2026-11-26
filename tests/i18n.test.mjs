import assert from "node:assert/strict";
import { test } from "node:test";
import french from "../messages/fr.ts";
import english from "../messages/en.ts";
import { execFileSync } from "node:child_process";
import { resolveLocale, isLocale } from "../src/i18n/locales.ts";
import { parseFamilyDocument } from "../src/lib/family-document.ts";
import { validationFeedback } from "../src/i18n/validation.ts";
import { UserFacingError } from "../src/server/user-facing-error.ts";
import { birthDate } from "../src/lib/birth-date.ts";
import { formatBirthDate } from "../src/lib/format-birth-date.ts";

const catalogs = { fr: french, en: english };
/** Exercise the public formatter API without the suite's React Server import condition. */
function checkTranslations(script) {
  execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import {createTranslator} from 'next-intl';
    const catalogs = {};
    for (const language of ['fr', 'en']) {
      const url = new URL(language+'.ts', ${JSON.stringify(new URL("../messages/", import.meta.url).href)});
      catalogs[language] = (await import(url)).default;
    }
    ${script}
  `,
    ],
    { windowsHide: true, stdio: "pipe" },
  );
}
/** Flatten catalog namespaces for parity, syntax and interpolation checks. */
function entries(catalog) {
  return Object.entries(catalog).flatMap(([namespace, messages]) =>
    Object.entries(messages).map(([key, value]) => [
      `${namespace}.${key}`,
      value,
    ]),
  );
}
/** Identify ICU arguments without requiring identical plural cases between languages. */
function argumentsOf(message) {
  return [
    ...new Set(
      [...message.matchAll(/\{\s*([a-zA-Z]\w*)\s*[,}]/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

test("catalog keys and arguments agree, and all messages render without fallback", () => {
  const fr = new Map(entries(catalogs.fr));
  const en = new Map(entries(catalogs.en));
  assert.deepEqual([...fr.keys()].sort(), [...en.keys()].sort());
  for (const language of ["fr", "en"]) {
    for (const [key, message] of entries(catalogs[language])) {
      assert.deepEqual(argumentsOf(message), argumentsOf(fr.get(key)), key);
    }
  }
  checkTranslations(`
    const values={count:2,generation:3,name:'Alex',id:'p1',first:'Alex',second:'Bea',number:1,revision:4};
    for(const [language,locale] of [['fr','fr-FR'],['en','en-US']]) {
      const t=createTranslator({locale,messages:catalogs[language],onError(error){throw error;}});
      for(const [namespace,messages] of Object.entries(catalogs[language]))
        for(const key of Object.keys(messages)) assert.ok(t(namespace+'.'+key,values).length,namespace+'.'+key);
    }
  `);
});

test("visitor choice and installation defaults fall back independently", () => {
  assert.equal(resolveLocale("en-US", "fr-FR"), "en-US");
  assert.equal(resolveLocale(undefined, "en-US"), "en-US");
  assert.equal(resolveLocale("../../other", "en-US"), "en-US");
  assert.equal(resolveLocale("en-GB", "unsupported"), "fr-FR");
  assert.equal(resolveLocale(), "fr-FR");
  assert.equal(isLocale(null), false);
  assert.equal(resolveLocale("fr-FR", "en-US"), "fr-FR");
});

test("fixed languages override saved preferences and the choice-mode default", () => {
  for (const [mode, other] of [
    ["fr-FR", "en-US"],
    ["en-US", "fr-FR"],
  ]) {
    assert.equal(resolveLocale(other, other, mode), mode);
    assert.equal(resolveLocale(undefined, other, mode), mode);
    assert.equal(resolveLocale("unsupported", undefined, mode), mode);
  }
  assert.equal(resolveLocale("en-US", "fr-FR", "choice"), "en-US");
});

test("generation ordinals and counts follow each language", () => {
  checkTranslations(`
  const en = createTranslator({locale:"en-US", messages:catalogs.en});
  const fr = createTranslator({locale:"fr-FR", messages:catalogs.fr});
  for (const [generation, ordinal] of [[1,"1st"],[2,"2nd"],[3,"3rd"],[11,"11th"],[12,"12th"],[13,"13th"],[21,"21st"]])
    assert.equal(en("person.generationDescription", {generation,name:"Alex"}), ordinal+' generation from Alex');
  assert.equal(fr("person.generationDescription", {generation:1,name:"Alex"}), "1re génération depuis Alex");
  assert.equal(fr("person.generationDescription", {generation:2,name:"Alex"}), "2e génération depuis Alex");
  assert.equal(en("viewer.matches", {count:1}), "1 person found and highlighted");
  assert.equal(en("viewer.matches", {count:2}), "2 people found and highlighted");
  `);
});

test("US birth dates retain precision and canonical values", () => {
  for (const [input, expected] of [
    ["1968", "1968"],
    ["1968-05", "05/1968"],
    ["1968-05-12", "05/12/1968"],
    ["0005-05-12", "05/12/0005"],
  ]) {
    const value = birthDate(input);
    assert.equal(formatBirthDate(value, "en-US"), expected);
    assert.equal(value, input);
  }
  assert.equal(formatBirthDate(undefined, "en-US"), "?");
});

test("validation and API errors expose stable identifiers and preserve fallback contracts", () => {
  const document = {
    schemaVersion: 1,
    revision: 0,
    title: "",
    rootPersonId: null,
    people: [],
    partnerships: [],
  };
  try {
    parseFamilyDocument(document);
    assert.fail("Expected invalid title");
  } catch (error) {
    assert.equal(validationFeedback(error).key, "validation.title");
    assert.ok(error.message.includes("The family title must not be blank"));
  }
  const error = new UserFacingError("CONFLICT", "conflict");
  assert.equal(error.code, "CONFLICT");
  assert.equal(error.messageKey, "conflict");
  assert.equal(error.message, catalogs.fr.errors.conflict);
});
