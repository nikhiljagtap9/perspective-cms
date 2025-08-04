import { ActionFunctionArgs, LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
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

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await db.user.findUnique({
    where: { id: params.id },
    select: { id: true, username: true, role: true }
  });

  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  return json({ user });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const username = formData.get("username") as string;
  const newPassword = formData.get("newPassword") as string;
  const role = formData.get("role") as "SUPERADMIN" | "ADMIN" | "USER";

  if (!username || !role) {
    return json({ error: "Username and role are required" }, { status: 400 });
  }

  try {
    const updateData: any = { username, role };
    
    if (newPassword) {
      updateData.password = await hashPassword(newPassword);
    }

    await db.user.update({
      where: { id: params.id },
      data: updateData,
    });

    return redirect("/users");
  } catch (error) {
    return json({ error: "Failed to update user" }, { status: 400 });
  }
}

export default function EditUser() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Edit User: {user.username}</h1>
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
              defaultValue={user.username}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select name="role" defaultValue={user.role}>
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
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              placeholder="Leave blank to keep current password"
            />
          </div>

          {actionData?.error && (
            <div className="text-red-500 text-sm">{actionData.error}</div>
          )}

          <div className="flex gap-4">
            <Button type="submit">
              Update User
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