import { ActionFunctionArgs, LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, Link } from "@remix-run/react";
import { db } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { FEED_TYPES } from "~/lib/feed-types";

import { execFile } from "child_process";
import util from "util";

const execFileAsync = util.promisify(execFile);

export async function loader({ params }: LoaderFunctionArgs) {
  const { id } = params;

  if (!id) {
    throw new Response("Feed ID required", { status: 400 });
  }

  const feed = await db.scrapperData.findUnique({
    where: { id: Number(id) },
    include: { Country: true },
  });

  const countries = await db.country.findMany({
    orderBy: { name: "asc" },
  });

  if (!feed) {
    throw new Response("Feed not found", { status: 404 });
  }

  return json({ feed, countries, feedTypes: FEED_TYPES });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { id } = params;
  if (!id) throw new Response("Feed ID required", { status: 400 });

  const formData = await request.formData();
  const country_id = formData.get("countryId") as string;
  const url = formData.get("url") as string;
  const feedType = formData.get("feedType") as string;

  if (!country_id || !url || !feedType) {
    return json({ error: "All fields are required" }, { status: 400 });
  }

  // map ID → label (for Python script)
  const feedTypeObj = FEED_TYPES.find((f) => f.id === feedType);
  const feedTypeLabel = feedTypeObj?.label ?? "Main Feed";

  try {
    // 🔹 Run Python scraper again with updated URL + feedType
    const { stdout } = await execFileAsync(
      "./venv/bin/python",
      ["./scripts/scraper.py", url, feedTypeLabel]
    );

    
    let scrapedContent: string | null = null;
     try {
      // Validate JSON
      JSON.parse(stdout);
      scrapedContent = stdout; // keep as-is (valid JSON string)
    } catch (err) {
      scrapedContent = JSON.stringify({ error: "Invalid scraper output" });
    }

    // 🔹 Update DB with new scraped content
    await db.scrapperData.update({
      where: { id: Number(id) },
      data: {
        country_id,
        url,
        feed_type: feedType as any,
        content: scrapedContent,
      },
    });

    return redirect("/scrapper");
  } catch (error) {
    console.error("Error updating feed with scraper:", error);
    return json({ error: "Failed to update feed" }, { status: 500 });
  }
}

export default function EditFeed() {
  const actionData = useActionData<typeof action>();
  const { feed, countries, feedTypes } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Edit Feed</h1>
        <Button variant="secondary" asChild>
          <Link to="/scrapper">Back to Scrapper Feeds</Link>
        </Button>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <Form method="post" className="space-y-4">
          {/* Country */}
          <div className="space-y-2">
            <Label htmlFor="countryId">Country</Label>
            <Select name="countryId" defaultValue={feed.country_id}>
              <SelectTrigger>
                <SelectValue placeholder="Select a country" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Feed URL */}
          <div className="space-y-2">
            <Label htmlFor="url">Feed URL</Label>
            <Input
              id="url"
              name="url"
              type="url"
              required
              defaultValue={feed.url}
            />
          </div>

          {/* Feed Type */}
          <div className="space-y-2">
            <Label htmlFor="feedType">Feed Type</Label>
            <Select name="feedType" defaultValue={feed.feed_type}>
              <SelectTrigger>
                <SelectValue placeholder="Select feed type" />
              </SelectTrigger>
              <SelectContent>
                {feedTypes.map((ft) => (
                  <SelectItem key={ft.id} value={ft.id}>
                    {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {actionData?.error && (
            <div className="text-red-500 text-sm">{actionData.error}</div>
          )}

          <div className="flex gap-4">
            <Button type="submit">Update Feed</Button>
            <Button variant="outline" asChild>
              <Link to="/scrapper">Cancel</Link>
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
