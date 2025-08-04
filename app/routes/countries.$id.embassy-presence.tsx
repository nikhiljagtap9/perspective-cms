import { Form, useNavigation, useOutletContext, useActionData, useLoaderData, useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/lib/db.server";
import type { Prisma } from "@prisma/client";
import { Wand2, Loader2 } from "lucide-react";

type LoaderData = {
  embassyPresence: Array<{
    id: string;
    handle: string;
    countryId: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

type ActionData = {
  errors?: { 
    handle?: string;
  };
  error?: string;
  success?: boolean;
};

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");

  const embassyPresence = await db.embassyPresence.findMany({
    where: { countryId: params.id },
    orderBy: { createdAt: "desc" }
  });

  return json<LoaderData>({ 
    embassyPresence: embassyPresence.map(embassy => ({
      ...embassy,
      createdAt: embassy.createdAt.toISOString(),
      updatedAt: embassy.updatedAt.toISOString()
    }))
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");
  
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const handle = formData.get("handle") as string;

    const errors: ActionData['errors'] = {};
    if (!handle) errors.handle = "Handle is required";

    if (Object.keys(errors).length > 0) {
      return json<ActionData>({ errors }, { status: 400 });
    }

    // Delete any existing embassy presence for this country
    await db.embassyPresence.deleteMany({
      where: { countryId: params.id }
    });

    // Create the new embassy presence
    await db.embassyPresence.create({
      data: {
        handle,
        country: {
          connect: { id: params.id }
        }
      }
    });
  } else if (intent === "delete") {
    const embassyId = formData.get("embassyId") as string;
    await db.embassyPresence.delete({
      where: { id: embassyId }
    });
  }

  return null;
}

export default function EmbassyPresenceTab() {
  const { country } = useOutletContext<{ country: any }>();
  const { embassyPresence } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Add fetcher for AI generation
  const generateFetcher = useFetcher();
  const isGenerating = generateFetcher.state !== "idle";

  const handleGenerate = async () => {
    generateFetcher.submit(
      {},
      {
        method: "post",
        action: `/api/countries/${country.id}/generate-embassy-presence`,
      }
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">U.S. Embassy</h2>
          <p className="text-sm text-muted-foreground">
            Track the U.S. Embassy's Twitter handle for {country.name}.
          </p>
        </div>

        <div className="flex gap-4">
          <Form method="post" className="flex-1 space-y-4">
            <input type="hidden" name="intent" value="create" />
            <div className="space-y-2">
              <label htmlFor="handle" className="text-sm font-medium">
                Twitter Handle
              </label>
              <input
                type="text"
                id="handle"
                name="handle"
                className="w-full px-3 py-2 border rounded-md bg-background"
                placeholder="@handle"
                required
                defaultValue={embassyPresence[0]?.handle}
              />
              {actionData?.errors?.handle && (
                <p className="text-sm text-red-500">{actionData.errors.handle}</p>
              )}
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Handle"}
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
                    Finding Handle...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Find with AI
                  </>
                )}
              </Button>
            </div>
          </Form>
        </div>

        {embassyPresence.length > 0 && (
          <div className="pt-6 border-t">
            <h3 className="text-lg font-medium mb-4">Current Embassy</h3>
            <div className="space-y-4">
              {embassyPresence.map((embassy) => (
                <div key={embassy.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <a 
                      href={`https://twitter.com/${embassy.handle.replace('@', '')}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-sm text-blue-500 hover:underline"
                    >
                      {embassy.handle}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="embassyId" value={embassy.id} />
                      <Button variant="destructive" type="submit" size="sm">
                        Delete
                      </Button>
                    </Form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 