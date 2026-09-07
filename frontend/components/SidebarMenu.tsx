"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { MENU_ITEMS, canAccessMenuItem } from "@/app/(admin)/config/menu.config";

export function SidebarMenu() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const menuItems = MENU_ITEMS.filter((item) => canAccessMenuItem(user, item));

  return (
    <aside className={`console-sidebar ${expanded ? "is-expanded" : ""}`}>
      <div className="sidebar-brand-row">
        <Link href="/pending" className="console-brand" aria-label="EMB Trip Ticket home">
          <Image src="/assets/emb-logo-cutout.png" width={44} height={44} alt="" priority />
          {expanded && (
            <span>
              <b>EMB</b>
              <small>TRIP OPERATIONS</small>
            </span>
          )}
        </Link>
        <button
          className="sidebar-collapse"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Collapse menu" : "Expand menu"}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
      </div>
      <nav className="console-nav" aria-label="Staff navigation">
        {menuItems.map(({ path, label, description, icon: Icon }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              href={path}
              className={active ? "active" : ""}
              title={expanded ? undefined : label}
            >
              <Icon aria-hidden="true" />
              {expanded && (
                <span>
                  <b>{label}</b>
                  <small>{description}</small>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {expanded && (
        <p className="sidebar-footnote">
          <span />
          Secure staff workspace
        </p>
      )}
    </aside>
  );
}
