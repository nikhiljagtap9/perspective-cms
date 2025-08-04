import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { Form, useNavigation, Link } from "@remix-run/react";
import { db } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { COUNTRIES, getFlagEmoji } from "~/lib/countries";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const name = formData.get("name") as string;
  const code = formData.get("code") as string;
  const embassyInUsUrl = formData.get("embassyInUsUrl") as string;
  const usEmbassyUrl = formData.get("usEmbassyUrl") as string;

  if (!name || !code) {
    return new Response(
      JSON.stringify({ 
        errors: { 
          name: name ? undefined : "Name is required",
          code: code ? undefined : "Code is required"
        } 
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  await db.country.create({
    data: { 
      name,
      code: code.toUpperCase(),
      embassyInUsUrl: embassyInUsUrl || null,
      usEmbassyUrl: usEmbassyUrl || null
    }
  });

  return redirect("/countries");
}

export default function NewCountryPage() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Add New Country</h1>

      <Form method="post" className="space-y-4">
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              className="w-full px-3 py-2 border rounded-md bg-background"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="code" className="text-sm font-medium">
              Country Code
            </label>
            <select
              id="code"
              name="code"
              className="w-full px-3 py-2 border rounded-md bg-background"
              required
            >
              <option value="">Select a country</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {getFlagEmoji(c.code)} {c.name} ({c.code})
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              Two-letter country code (ISO 3166-1 alpha-2)
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="embassyInUsUrl" className="text-sm font-medium">
              Embassy in US Website
            </label>
            <input
              type="url"
              id="embassyInUsUrl"
              name="embassyInUsUrl"
              className="w-full px-3 py-2 border rounded-md bg-background"
              placeholder="https://embassy-website.com"
            />
            <p className="text-sm text-muted-foreground">
              URL of the country's embassy website in the United States
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="usEmbassyUrl" className="text-sm font-medium">
              US Embassy Website
            </label>
            <input
              type="url"
              id="usEmbassyUrl"
              name="usEmbassyUrl"
              className="w-full px-3 py-2 border rounded-md bg-background"
              placeholder="https://us-embassy-website.com"
            />
            <p className="text-sm text-muted-foreground">
              URL of the US embassy website in this country
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Country"}
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/countries">
              Cancel
            </Link>
          </Button>
        </div>
      </Form>
    </div>
  );
} 