import "./lines.css";

import { redirect } from "next/navigation";

import { getSession, getOwnerSession, hasViewingAccess } from "@/server/auth";
import { FamilyTree } from "./_components/family-tree";

/** Require a valid viewing or owner session before rendering the family viewer. */
export default async function Page() {
  const [session, ownerSession] = await Promise.all([
    getSession(),
    getOwnerSession(),
  ]);
  if (!hasViewingAccess(session, ownerSession)) redirect("/login");
  return <FamilyTree />;
}
