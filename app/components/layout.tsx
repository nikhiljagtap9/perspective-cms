import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "~/components/ui/navigation-menu";
import { Link, useLocation, Form } from "@remix-run/react";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "~/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <div className="w-64 border-r bg-card px-4 py-6">
        <div className="flex h-full flex-col">
          <div className="space-y-6">
            <h1 className="text-xl font-bold">Perspective CMS</h1>
            <NavigationMenu orientation="vertical" className="w-full">
              <NavigationMenuList className="flex-col items-start space-x-0 space-y-2">
                <NavigationMenuItem className="w-full">
                  <Link 
                    to="/countries" 
                    className={cn(
                      navigationMenuTriggerStyle(),
                      "w-full justify-start",
                      isActive('/countries') && "bg-accent text-accent-foreground"
                    )}
                  >
                    Countries
                  </Link>
                </NavigationMenuItem>
                <NavigationMenuItem className="w-full">
                  <Link 
                    to="/users" 
                    className={cn(
                      navigationMenuTriggerStyle(),
                      "w-full justify-start",
                      isActive('/users') && "bg-accent text-accent-foreground"
                    )}
                  >
                    Users
                  </Link>
                </NavigationMenuItem>
                <NavigationMenuItem className="w-full">
                  <Link 
                    to="/usmentionresources" 
                    className={cn(
                      navigationMenuTriggerStyle(),
                      "w-full justify-start",
                      isActive('/usmentionresources') && "bg-accent text-accent-foreground"
                    )}
                  >
                    US Mention Sources 
                  </Link>
                </NavigationMenuItem>
                <NavigationMenuItem className="w-full">
                  <Link 
                    to="/scrapper" 
                    className={cn(
                      navigationMenuTriggerStyle(),
                      "w-full justify-start",
                      isActive('/scrapper') && "bg-accent text-accent-foreground"
                    )}
                  >
                    Scrapper 
                  </Link>
                </NavigationMenuItem>
                <NavigationMenuItem className="w-full">
                  <Form action="/auth/logout" method="post">
                    <button 
                      type="submit"
                      className={cn(
                        navigationMenuTriggerStyle(),
                        "w-full justify-start",
                      )}
                    >
                      Logout
                    </button>
                  </Form>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          <div className="mt-auto">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 px-8 py-6">
        {children}
      </main>
    </div>
  );
}