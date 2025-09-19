// app/routes/usmentionresources.new.tsx
import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { db } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Link } from "@remix-run/react";

// Loader (not really needed now, but kept for consistency)
export async function loader({}: LoaderFunctionArgs) {
  return json({});
}

// Action → create new US Mention Source
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const notes = formData.get("notes") as string | null;

  if (!name || !url) {
    return json(
      { error: "Name and URL are required" },
      { status: 400 }
    );
  }

  await db.usMentionsSource.create({
    data: {
      name,
      url,
      notes,
    },
  });

  return redirect("/usmentionresources");
}

export default function NewUSMentionSource() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">New US Mentions Source</h1>
        <Button variant="secondary" asChild>
          <Link to="/usmentionresources">Back</Link>
        </Button>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <Form method="post" className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Source name"
            />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              name="url"
              type="url"
              required
              placeholder="https://example.com"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              name="notes"
              type="text"
              placeholder="e.g. State-owned, Independent"
            />
          </div>

          {actionData?.error && (
            <div className="text-red-500 text-sm">{actionData.error}</div>
          )}

          <div className="flex gap-4">
            <Button type="submit">Create Source</Button>
            <Button variant="outline" asChild>
              <Link to="/usmentionresources">Cancel</Link>
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
