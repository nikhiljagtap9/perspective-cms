import { Form, useNavigation, useOutletContext, useActionData, useLoaderData, useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/lib/db.server";
import type { Prisma } from "@prisma/client";
import { Wand2, Loader2 } from "lucide-react";

type LoaderData = {
  governmentMessaging: Array<{
    id: string;
    name: string;
    handle: string;
    notes: string | null;
    countryId: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

type ActionData = {
  errors?: { 
    name?: string;
    handle?: string;
    notes?: string;
  };
  error?: string;
  success?: boolean;
};

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");

  const governmentMessaging = await db.governmentMessaging.findMany({
    where: { countryId: params.id },
    orderBy: { createdAt: "desc" }
  });

  return json<LoaderData>({ 
    governmentMessaging: governmentMessaging.map(entity => ({
      ...entity,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    }))
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");
  
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = formData.get("name") as string;
    const handle = formData.get("handle") as string;
    const notes = formData.get("notes") as string;

    const errors: ActionData['errors'] = {};
    if (!name) errors.name = "Name is required";
    if (!handle) errors.handle = "Handle is required";

    if (Object.keys(errors).length > 0) {
      return json<ActionData>({ errors }, { status: 400 });
    }

    const data: Prisma.GovernmentMessagingCreateInput = {
      name,
      handle,
      notes,
      country: {
        connect: { id: params.id }
      }
    };

    await db.governmentMessaging.create({ data });
  } else if (intent === "delete") {
    const entityId = formData.get("entityId") as string;
    await db.governmentMessaging.delete({
      where: { id: entityId }
    });
  }

  return null;
}

export default function GovernmentMessagingTab() {
  const { country } = useOutletContext<{ country: any }>();
  const { governmentMessaging } = useLoaderData<typeof loader>();
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
        action: `/api/countries/${country.id}/generate-government-messaging`,
      }
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">Government Messaging</h2>
          <p className="text-sm text-muted-foreground">
            Manage government entities and their social media presence in {country.name}.
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
                  placeholder="Ministry of Foreign Affairs (Ministerio de Relaciones Exteriores)"
                  required
                />
                {actionData?.errors?.name && (
                  <p className="text-sm text-red-500">{actionData.errors.name}</p>
                )}
              </div>

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
                />
                {actionData?.errors?.handle && (
                  <p className="text-sm text-red-500">{actionData.errors.handle}</p>
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
                  placeholder="Brief description of their role and responsibilities"
                />
                {actionData?.errors?.notes && (
                  <p className="text-sm text-red-500">{actionData.errors.notes}</p>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Entity"}
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
          <h3 className="text-lg font-medium mb-4">Existing Government Entities</h3>
          <div className="space-y-4">
            {governmentMessaging.map((entity) => (
              <div key={entity.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <h4 className="font-medium">{entity.name}</h4>
                  {entity.notes && (
                    <p className="text-sm text-muted-foreground">{entity.notes}</p>
                  )}
                  <a 
                    href={`https://twitter.com/${entity.handle.replace('@', '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-sm text-blue-500 hover:underline"
                  >
                    {entity.handle}
                  </a>
                </div>
                <div className="flex gap-2">
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="entityId" value={entity.id} />
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