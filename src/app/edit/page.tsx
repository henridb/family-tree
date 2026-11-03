import { redirect } from "next/navigation";
import { getOwnerSession, isOwner } from "@/server/auth";
import { FamilyEditorLoader } from "./family-editor";

/** Require a valid owner session before rendering the family editor loader. */
export default async function EditorPage() {
  if (!isOwner(await getOwnerSession())) redirect("/edit/login");
  return <FamilyEditorLoader />;
}
