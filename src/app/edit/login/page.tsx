import { redirect } from "next/navigation";
import Link from "next/link";
import { env } from "@/env";
import { getOwnerSession, isOwner } from "@/server/auth";
import { OwnerLogin } from "./owner-login";

/**
 * Redirect valid owners to the editor, otherwise show owner login or explain
 * that editing is not configured.
 */
export default async function OwnerLoginPage() {
  if (isOwner(await getOwnerSession())) redirect("/edit");
  if (!env.OWNER_PASSWORD_HASH)
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Édition non activée</h1>
        <p className="mt-4">
          Le propriétaire de ce site doit configurer son accès pour activer
          l’édition.
        </p>
        <Link className="mt-4 inline-block underline" href="/">
          Retour à l’arbre
        </Link>
      </main>
    );
  return <OwnerLogin />;
}
