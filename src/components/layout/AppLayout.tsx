import { Link, useLocation } from "react-router-dom";
import { Package, ShoppingCart, BarChart3, Plus, BookUser, Settings, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNav } from "./MobileNav"; // Import the new component

// Desktop Sidebar Items
const navItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/inventory/add", label: "Add Stock", icon: Plus },
  { href: "/billing", label: "Billing", icon: ShoppingCart },
  { href: "/analytics", label: "Analytics", icon: Package },
  { href: "/manage", label: "Manage", icon: Package },
  { href: "/udhaar", label: "Udhaar", icon: BookUser }, // Updated Icon
  { href: "/sales", label: "Sales", icon: FileText },   // Updated Icon
  { href: "/settings", label: "Settings", icon: Settings }, // Updated Icon
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  // We no longer need mobileMenuOpen state!
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      
      {/* --- DESKTOP SIDEBAR (Unchanged) --- */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-border bg-card px-6 pb-4">
          <div className="flex h-16 shrink-0 items-center gap-2">
            <img src="/logo.png" alt="Logo" className="h-8 w-8 object-contain" />
            <span className="text-xl font-bold text-foreground">Biillo Retail</span>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul className="flex flex-1 flex-col gap-y-2">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      className={cn(
                        "group flex gap-x-3 rounded-lg p-3 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      {/* 1. lg:pl-64: Pushes content right on desktop to make room for sidebar
          2. pb-24: Adds padding at bottom on mobile so content isn't hidden by the new Tab Bar
      */}
      <main className="lg:pl-64 pb-24 lg:pb-0 transition-all duration-200">
        
        {/* Optional: Minimal Mobile Brand Header (If you want a logo at the top on mobile) */}
        <div className="lg:hidden flex items-center gap-2 px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
           <img src="/logo.png" alt="Logo" className="h-6 w-6 object-contain" />
           <span className="font-bold text-lg">Biillo Retail</span>
        </div>

        <div className="px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      {/* --- MOBILE BOTTOM NAV --- */}
      <MobileNav />

    </div>
  );
}