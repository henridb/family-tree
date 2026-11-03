"use client";

import { TreeDeciduous } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";

/** Render shared-password viewing login with pending and error feedback. */
export default function LoginPage() {
  const [password, setPassword] = useState("");
  const login = api.login.login.useMutation({
    /**
     * Clear the password and load a fresh viewer document, discarding the
     * previous in-memory query cache.
     */
    onSuccess: () => {
      setPassword("");
      // A new document also clears any previous user's in-memory query cache.
      window.location.replace("/");
    },
  });

  /**
   * Submit the shared password unless a login is already pending, preventing
   * native form navigation.
   */
  function handleForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!login.isPending) login.mutate(password);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-amber-100 px-5 py-10 text-amber-950">
      <form
        className="flex w-full max-w-md flex-col rounded-2xl border border-amber-900/15 bg-white/85 p-6 shadow-sm sm:p-8"
        onSubmit={handleForm}
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-full bg-amber-100 p-3">
            <TreeDeciduous aria-hidden="true" className="size-6" />
          </span>
          <p className="font-semibold tracking-wide">Family Tree</p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Accès à l’arbre généalogique
        </h1>
        <p className="mt-3 mb-6 text-sm leading-relaxed text-amber-900">
          Entrez le mot de passe partagé pour retrouver l’arbre familial, ses
          liens et ses générations.
        </p>
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          type="password"
          id="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          className="mt-2 mb-4 h-11 w-full border-amber-900/25 bg-white focus-visible:border-amber-800 focus-visible:ring-amber-800/30"
          onChange={(event) => setPassword(event.target.value)}
          value={password}
          disabled={login.isPending}
          aria-describedby={login.error ? "login-error" : undefined}
        />
        <Button
          type="submit"
          className="h-11 w-full cursor-pointer bg-amber-950 text-amber-50 hover:bg-amber-900"
          disabled={login.isPending}
        >
          {login.isPending ? "Connexion…" : "Entrer"}
        </Button>
        {login.error && (
          <p
            id="login-error"
            role="alert"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-950"
          >
            {login.error.data?.code === "UNAUTHORIZED" ||
            login.error.data?.code === "TOO_MANY_REQUESTS"
              ? login.error.message
              : "Connexion impossible. Réessayez."}
          </p>
        )}
      </form>
    </main>
  );
}
