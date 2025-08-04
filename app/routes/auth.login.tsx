import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { db } from "~/lib/db.server";
import { createUserSession, hashPassword } from "~/lib/auth.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "~/lib/theme-provider";

type ActionData = {
  error?: string;
  success?: boolean;
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return json<ActionData>({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { username } });
  
  if (!user) {
    return json<ActionData>({ error: "Invalid username or password" }, { status: 401 });
  }

  const hashedPassword = await hashPassword(password);
  if (user.password !== hashedPassword || user.role === 'USER') {
    return json<ActionData>({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = await createUserSession(user.id);
  
  return redirect("/", {
    headers: {
      "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    },
  });
}

export default function Login() {
  const actionData = useActionData<ActionData>();
  const [theme, setTheme] = useTheme();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </Button>

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Login to Dashboard</h1>
          <p className="text-muted-foreground mt-2">Please sign in to continue</p>
        </div>

        <div className="bg-card shadow-md rounded-lg p-6">
          <Form method="post" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
              />
            </div>

            {actionData?.error && (
              <div className="text-red-500 text-sm">{actionData.error}</div>
            )}

            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
} 