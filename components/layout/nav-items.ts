import {
  LayoutDashboard,
  Users,
  FolderKanban,
  ListTodo,
  Calendar,
  ChartLine,
  UserCircle,
  Settings,
  ShieldCheck,
  LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  shortLabel?: string
  Icon: LucideIcon
  adminOnly?: boolean
}

// Single source of truth for navigation items. Used by both the desktop
// sidebar and the mobile bottom nav / More sheet.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", shortLabel: "Home", Icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", Icon: Users },
  { href: "/projects", label: "Projects", Icon: FolderKanban },
  { href: "/tasks", label: "Tasks", Icon: ListTodo },
  { href: "/calendar", label: "Calendar", shortLabel: "Cal", Icon: Calendar },
  { href: "/reports", label: "Reports", Icon: ChartLine },
  { href: "/profile", label: "Profile", Icon: UserCircle },
  { href: "/settings", label: "Settings", Icon: Settings },
  { href: "/admin", label: "Admin", Icon: ShieldCheck, adminOnly: true },
]

// Which items get a primary slot on the mobile bottom nav. Everything not in
// this list goes into the More sheet. The Log interaction action occupies the
// centre slot separately, so keep this list at 4 entries.
export const MOBILE_PRIMARY_HREFS = new Set(["/", "/contacts", "/tasks", "/calendar"])
