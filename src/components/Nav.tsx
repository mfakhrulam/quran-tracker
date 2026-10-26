"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowsClockwise,
  BookOpenText,
  ClockCounterClockwise,
  GearSix,
  MapTrifold,
  SquaresFour,
  Target,
  SignOut,
} from "@phosphor-icons/react";

const LINKS = [
  { href: "/", label: "Ringkasan", short: "Ringkasan", Icon: SquaresFour },
  { href: "/catat", label: "Catat", short: "Catat", Icon: BookOpenText },
  { href: "/murajaah", label: "Murajaah", short: "Murajaah", Icon: ArrowsClockwise },
  { href: "/riwayat", label: "Riwayat", short: "Riwayat", Icon: ClockCounterClockwise },
  { href: "/peta", label: "Peta", short: "Peta", Icon: MapTrifold },
  { href: "/target", label: "Target", short: "Target", Icon: Target },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Nav() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]">
              <span className="font-arabic text-[17px] leading-none">ق</span>
            </span>
            <span className="hidden text-[15px] font-bold tracking-tight text-ink sm:block">
              Hafalan
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, label, Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-soft hover:bg-ink/5 hover:text-ink",
                  ].join(" ")}
                >
                  <Icon size={17} weight={active ? "fill" : "regular"} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/pengaturan"
              aria-label="Pengaturan"
              aria-current={isActive(pathname, "/pengaturan") ? "page" : undefined}
              className={[
                "btn btn-ghost h-9 w-9 p-0",
                isActive(pathname, "/pengaturan") ? "text-brand-700" : "",
              ].join(" ")}
            >
              <GearSix size={17} weight={isActive(pathname, "/pengaturan") ? "fill" : "regular"} />
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="btn btn-ghost h-9 px-2.5 text-[13px]"
                aria-label="Keluar dari akun"
              >
                <SignOut size={16} />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Navigasi utama"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-between px-2">
          {LINKS.map(({ href, short, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                  active ? "text-brand-700" : "text-ink-faint hover:text-ink-soft",
                ].join(" ")}
              >
                <Icon size={20} weight={active ? "fill" : "regular"} />
                {short}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
