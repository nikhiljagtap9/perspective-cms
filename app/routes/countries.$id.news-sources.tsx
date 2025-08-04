import { Form, useNavigation, useOutletContext, useActionData, useLoaderData, useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/lib/db.server";
import type { Prisma } from "@prisma/client";
import { Wand2, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "~/components/ui/alert";

type LoaderData = {
  newsSources: Array<{
    id: string;
    name: string;
    url: string;
    notes: string | null;
    countryId: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

type ActionData = {
  errors?: { 
    name?: string;
    url?: string;
    notes?: string;
  };
  error?: string;
  success?: boolean;
};

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");

  const newsSources = await db.newsSource.findMany({
    where: { countryId: params.id },
    orderBy: { createdAt: "desc" }
  });

  return json<LoaderData>({ 
    newsSources: newsSources.map(source => ({
      ...source,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString()
    }))
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");
  
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = formData.get("name") as string;
    const url = formData.get("url") as string;
    const notes = formData.get("notes") as string;

    const errors: ActionData['errors'] = {};
    if (!name) errors.name = "Name is required";
    if (!url) errors.url = "URL is required";

    if (Object.keys(errors).length > 0) {
      return json<ActionData>({ errors }, { status: 400 });
    }

    const data: Prisma.NewsSourceCreateInput = {
      name,
      url,
      notes,
      country: {
        connect: { id: params.id }
      }
    };

    await db.newsSource.create({ data });
  } else if (intent === "delete") {
    const sourceId = formData.get("sourceId") as string;
    await db.newsSource.delete({
      where: { id: sourceId }
    });
  }

  return null;
}

export default function NewsSourcesTab() {
  const { country } = useOutletContext<{ country: any }>();
  const { newsSources } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Add fetcher for AI generation
  const generateFetcher = useFetcher();
  const isGenerating = generateFetcher.state !== "idle";

  const handleGenerate = async () => {
    // Submit the request using fetcher
    generateFetcher.submit(
      {},
      {
        method: "post",
        action: `/api/countries/${country.id}/generate-news-sources`,
      }
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">News Sources</h2>
          <p className="text-sm text-muted-foreground">
            Manage news sources for {country.name}.
          </p>
        </div>

        <div className="flex gap-4">
          <Form method="post" className="flex-1 space-y-4">
            <input type="hidden" name="intent" value="create" />
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
                {actionData?.errors?.name && (
                  <p className="text-sm text-red-500">{actionData.errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="url" className="text-sm font-medium">
                  URL
                </label>
                <input
                  type="url"
                  id="url"
                  name="url"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  required
                />
                {actionData?.errors?.url && (
                  <p className="text-sm text-red-500">{actionData.errors.url}</p>
                )}
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label htmlFor="notes" className="text-sm font-medium">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder="e.g., State-owned, Independent, Private"
                />
                {actionData?.errors?.notes && (
                  <p className="text-sm text-red-500">{actionData.errors.notes}</p>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add News Source"}
              </Button>

              <Button 
                type="button"
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Create with AI
                  </>
                )}
              </Button>
            </div>
          </Form>
        </div>

        <div className="pt-6 border-t">
          <h3 className="text-lg font-medium mb-4">Existing Sources</h3>
          <div className="space-y-4">
            {newsSources.map((source) => (
              <div key={source.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <h4 className="font-medium">{source.name}</h4>
                  {source.notes && (
                    <p className="text-sm text-muted-foreground">{source.notes}</p>
                  )}
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline">
                    {source.url}
                  </a>
                </div>
                <div className="flex gap-2">
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="sourceId" value={source.id} />
                    <Button variant="destructive" type="submit" size="sm">
                      Delete
                    </Button>
                  </Form>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 