import Link from "next/link";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/catat", label: "Catat" },
  { href: "/riwayat", label: "Riwayat" },
  { href: "/peta", label: "Peta" },
  { href: "/target", label: "Target" },
];

export default function Nav() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm font-medium text-neutral-700 hover:text-emerald-700">
            {l.label}
          </Link>
        ))}
        <form action="/api/auth/logout" method="post" className="ml-auto">
          <button className="rounded border border-neutral-300 px-3 py-1 text-sm">Keluar</button>
        </form>
      </nav>
    </header>
  );
}
