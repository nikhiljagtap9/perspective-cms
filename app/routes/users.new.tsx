import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { db } from "~/lib/db.server";
import { hashPassword } from "~/lib/auth.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Link } from "@remix-run/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as "SUPERADMIN" | "ADMIN" | "USER";

  if (!username || !password || !role) {
    return json({ error: "All fields are required" }, { status: 400 });
  }

  try {
    await db.user.create({
      data: {
        username,
        password: await hashPassword(password),
        role,
      },
    });

    return redirect("/users");
  } catch (error) {
    return json({ error: "Username already exists" }, { status: 400 });
  }
}

export default function NewUser() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Create New User</h1>
        <Button variant="secondary" asChild>
          <Link to="/users">Back to Users</Link>
        </Button>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
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
            <Label htmlFor="role">Role</Label>
            <Select name="role" defaultValue="USER">
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="USER">User</SelectItem>
              </SelectContent>
            </Select>
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

          <div className="flex gap-4">
            <Button type="submit">
              Create User
            </Button>
            <Button variant="outline" asChild>
              <Link to="/users">Cancel</Link>
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
} 