import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useNavigation } from "@remix-run/react";
import { db } from "~/lib/db.server";
import { PlusCircle, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { getFlagEmoji } from "~/lib/countries";
import { Form, useSubmit } from "@remix-run/react";
import { Switch } from "~/components/ui/switch";
import { json, redirect } from "@remix-run/node";
import { useState } from "react";
import { Input } from "~/components/ui/input";

export async function loader({ request }: LoaderFunctionArgs) {
  const isAdmin = true; // Replace with your actual admin check

  const countries = await db.country.findMany({
    where: isAdmin ? undefined : { published: true },
    orderBy: { name: 'asc' }
  });

  return { countries };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const countryId = formData.get("countryId") as string;
  const published = formData.get("published") === "true";

  await db.country.update({
    where: { id: countryId },
    data: { published }
  });

  return json({ success: true });
}

export default function CountriesPage() {
  const { countries } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isUpdating = (countryId: string) => {
    if (!navigation.formData) return false;
    return navigation.formData.get("countryId") === countryId;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Countries ({filteredCountries.length})</h1>
        <Button asChild>
          <Link to="/countries/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Country
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search countries..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="border rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-4 font-medium">Name</th>
              <th className="text-left p-4 font-medium">Code</th>
              <th className="text-left p-4 font-medium">Flag</th>
              <th className="text-left p-4 font-medium">Created</th>
              <th className="text-left p-4 font-medium">Updated</th>
              <th className="text-left p-4 font-medium">Published</th>
              <th className="p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filteredCountries.map((country) => (
              <tr key={country.id} className="border-b last:border-b-0">
                <td className="p-4">{country.name}</td>
                <td className="p-4">{country.code}</td>
                <td className="p-4">{country.code ? getFlagEmoji(country.code) : '-'}</td>
                <td className="p-4">{new Date(country.createdAt).toLocaleDateString()}</td>
                <td className="p-4">{new Date(country.updatedAt).toLocaleDateString()}</td>
                <td className="p-4">
                  <Form method="post" className="flex items-center space-x-2">
                    <input type="hidden" name="countryId" value={country.id} />
                    <input 
                      type="hidden" 
                      name="published" 
                      value={(!country.published).toString()} 
                    />
                    <Switch 
                      checked={country.published}
                      disabled={isUpdating(country.id)}
                      className={isUpdating(country.id) ? "opacity-50 cursor-wait" : ""}
                      onCheckedChange={(checked) => {
                        const form = new FormData();
                        form.set("countryId", country.id);
                        form.set("published", (!country.published).toString());
                        submit(form, { method: "post" });
                      }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {isUpdating(country.id) ? "Updating..." : (country.published ? "Published" : "Draft")}
                    </span>
                  </Form>
                </td>
                <td className="p-4 text-right">
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/countries/${country.id}`}>
                      Edit
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
            {countries.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  No countries found. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
} 