"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";

/**
 * Render the separate owner-password login form and open the editor after
 * successful authentication.
 */
export function OwnerLogin() {
  const [password, setPassword] = useState("");
  const login = api.editor.login.useMutation({
    /** Clear the password and load a fresh editor page after the owner cookie is saved. */
    onSuccess: () => {
      setPassword("");
      window.location.replace("/edit");
    },
  });
  return (
    <main className="flex min-h-dvh items-center justify-center bg-amber-50 p-5 text-amber-950">
      <form
        className="w-full max-w-md space-y-5 rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (!login.isPending) login.mutate(password);
        }}
      >
        <h1 className="text-2xl font-semibold">Modifier l’arbre familial</h1>
        <p>
          L’édition utilise le mot de passe du propriétaire, distinct du mot de
          passe partagé pour consulter l’arbre.
        </p>
        <Label htmlFor="owner-password">Mot de passe propriétaire</Label>
        <Input
          id="owner-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          maxLength={1024}
          disabled={login.isPending}
        />
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? "Connexion…" : "Ouvrir l’éditeur"}
        </Button>
        {login.error && (
          <p role="alert">
            {login.error.data?.code === "UNAUTHORIZED" ||
            login.error.data?.code === "TOO_MANY_REQUESTS"
              ? login.error.message
              : "Connexion impossible. Réessayez."}
          </p>
        )}
        <Link href="/" className="block underline">
          Retour à l’arbre
        </Link>
      </form>
    </main>
  );
}
