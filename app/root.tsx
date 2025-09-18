import { json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useNavigation, // 👈 import this
} from "@remix-run/react";
import { getUserFromSession } from "./lib/auth.server";
import { db } from "./lib/db.server";
import "./tailwind.css";
import { Layout as AppLayout } from "~/components/layout";
import { ThemeProvider } from "~/lib/theme-provider";

export const links = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const isLoginPage = url.pathname === "/auth/login";
  const isProtectedRoute =
    url.pathname.startsWith("/countries") ||
    url.pathname.startsWith("/users") ||
    url.pathname.startsWith("/scrapper") ||
    url.pathname === "/";

  if (!isProtectedRoute) {
    return json({ user: null });
  }

  const cookieHeader = request.headers.get("Cookie");
  const cookies = Object.fromEntries(
    cookieHeader?.split(";").map((cookie) => cookie.trim().split("=")) ?? []
  );

  const token = cookies.auth_token;

  if (!token) {
    return isLoginPage ? json({ user: null }) : redirect("/auth/login");
  }

  const user = await getUserFromSession(token);
  if (!user) {
    return isLoginPage ? json({ user: null }) : redirect("/auth/login");
  }

  if (user.role === "USER") {
    return redirect("/auth/login");
  }

  return json({ user });
}

export default function App() {
  const { user } = useLoaderData<typeof loader>();
  const navigation = useNavigation(); // 👈 check navigation state
  const isLoading =
    navigation.state === "loading" || navigation.state === "submitting";

  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="h-full bg-background">
        <ThemeProvider>
          {/* 🔹 Global Loader */}
          {isLoading && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary"></div>
            </div>
          )}

          {user ? (
            <AppLayout>
              <Outlet />
            </AppLayout>
          ) : (
            <Outlet />
          )}
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
