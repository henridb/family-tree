import { type BirthDate } from "@/lib/birth-date";

export type TextMatch = { start: number; end: number };
export type NameHighlights = {
  name: TextMatch[];
  surname: TextMatch[];
  marriedSurname: TextMatch[];
};

export type human = {
  id: string;
  name: string;
  surname: string;
  sex: "male" | "female";
  birthdate?: BirthDate;
  dead?: boolean;
  match?: boolean;
  searchHighlights?: NameHighlights;
};

export type person = human & {
  partners?: (human & { children?: person[]; divorced?: boolean })[];
};
