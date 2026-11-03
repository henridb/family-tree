import Link from "next/link";

/** Keep missing pages readable on the paper background in every browser color scheme. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-12 text-center text-amber-950">
      <p aria-hidden="true" className="text-5xl font-semibold">
        404
      </p>
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="max-w-md">
        La page que vous cherchez n’existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-amber-950 px-4 py-2 font-medium text-amber-50 hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-950"
      >
        Revenir à l’arbre
      </Link>
    </main>
  );
}
