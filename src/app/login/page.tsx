import Link from "next/link";
import { login } from "@/actions/auth";
import { Logo } from "@/app/Logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e0e0f] px-4">
      <form
        action={login}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-[#3a3a3e] bg-[#1a1a1c] p-6"
      >
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <h1 className="text-xl font-bold text-[#f0f0ee]">Gym Tracker</h1>
        </div>

        {message && (
          <p className="rounded-md bg-[#1e2f1a] px-3 py-2 text-sm text-[#8aff6e]">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-[#888884]">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="min-h-[44px] w-full rounded-lg border border-[#3a3a3e] bg-[#242427] px-3 py-2 text-base text-[#f0f0ee]"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-[#888884]">
            Wachtwoord
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="min-h-[44px] w-full rounded-lg border border-[#3a3a3e] bg-[#242427] px-3 py-2 text-base text-[#f0f0ee]"
          />
        </div>

        <button
          type="submit"
          className="min-h-[44px] w-full rounded-lg bg-[#c8f542] px-3 py-2 text-base font-semibold text-[#0e0e0f] hover:opacity-90"
        >
          Inloggen
        </button>

        <p className="text-center text-sm text-[#888884]">
          Nog geen account?{" "}
          <Link href="/signup" className="text-[#c8f542] hover:underline">
            Registreren
          </Link>
        </p>
      </form>
    </div>
  );
}
