import { ActionFunctionArgs, LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { db } from "~/lib/db.server";
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

import { FEED_TYPES } from "~/lib/feed-types";

import { execFile } from "child_process";
import util from "util";

const execFileAsync = util.promisify(execFile);

// Loader → fetch countries for dropdown
export async function loader({}: LoaderFunctionArgs) {
  const countries = await db.country.findMany({
    orderBy: { name: "asc" },
  });
  return json({ countries, feedTypes: FEED_TYPES });
}

// Action → create feed
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const country_id = formData.get("countryId");
  const url = formData.get("url") as string;
  const feedType = formData.get("feedType") as string;

  if (!country_id || !url || !feedType) {
    return json({ error: "All fields are required" }, { status: 400 });
  }

  //   try {
  //   const newFeed = await db.scrapperData.create({
  //     data: {
  //       country_id,
  //       url,
  //       feed_type: feedType as any,
  //       content: null, // leave empty until scraper fills it
  //     },
  //   });

  //   // Redirect to unique feed URL
  // //  return redirect(`/feed?feed_id=${newFeed.id}`);
  //   return redirect("/scrapper");
    
  // } catch (error) {
  //   console.log("error " + error);
  //   return json({ error: "Feed already exists or invalid data" }, { status: 400 });
  // }

  // map ID → label (for Python script)
  const feedTypeObj = FEED_TYPES.find((f) => f.id === feedType);
  const feedTypeLabel = feedTypeObj?.label ?? "Main Feed";

  try {
    // Run Python script 
    const { stdout } = await execFileAsync("./venv/bin/python", [
      "./scripts/scraper.py",
      url,
      feedTypeLabel,
    ]);

  //  console.log("stdout " + stdout);
    let scrapedContent: string | null = null;
    try {
      // Validate JSON
      JSON.parse(stdout);
      scrapedContent = stdout; // keep as-is (valid JSON string)
    } catch (err) {
      scrapedContent = JSON.stringify({ error: "Invalid scraper output" });
    }

    // Save feed
    const newFeed = await db.scrapperData.create({
      data: {
        country_id,
        url,
        feed_type: feedType as any,
        content: scrapedContent,
      },
    });

    return redirect("/scrapper");
  } catch (error) {
    console.error("Scraper error", error);
    return json({ error: "Scraper failed" }, { status: 500 });
  }

 }

export default function NewFeed() {
  const actionData = useActionData<typeof action>();
  const { countries, feedTypes } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Create New Feed</h1>
        <Button variant="secondary" asChild>
          <Link to="/scrapper">Back to Scrapper Feeds</Link>
        </Button>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <Form method="post" className="space-y-4">
          {/* Country */}
          <div className="space-y-2">
            <Label htmlFor="countryId">Country</Label>
            <Select name="countryId">
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
              placeholder="https://example.com/feed"
            />
          </div>

          {/* Feed Type */}
          <div className="space-y-2">
            <Label htmlFor="feedType">Feed Type</Label>
            <Select name="feedType" defaultValue="MAIN_FEED">
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
            <Button type="submit">Create Feed</Button>
            <Button variant="outline" asChild>
              <Link to="/feeds">Cancel</Link>
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
