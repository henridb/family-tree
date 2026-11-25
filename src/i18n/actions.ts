"use server";

import { cookies } from "next/headers";
import { isLocale, localeCookie } from "./locales";

/** Persist a validated preference without replacing mounted editor or viewer state. */
export async function setLocale(value: string): Promise<boolean> {
  if (!isLocale(value)) return false;
  (await cookies()).set(localeCookie, value, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}
