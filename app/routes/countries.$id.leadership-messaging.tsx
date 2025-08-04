import { Form, useNavigation, useOutletContext, useActionData, useLoaderData, useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/lib/db.server";
import type { Prisma } from "@prisma/client";
import { Wand2, Loader2 } from "lucide-react";

type LoaderData = {
  leadershipMessaging: Array<{
    id: string;
    name: string;
    title: string;
    handle: string;
    politicalLeaning: string | null;
    countryId: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

type ActionData = {
  errors?: { 
    name?: string;
    title?: string;
    handle?: string;
    politicalLeaning?: string;
  };
  error?: string;
  success?: boolean;
};

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");

  const leadershipMessaging = await db.leadershipMessaging.findMany({
    where: { countryId: params.id },
    orderBy: { createdAt: "desc" }
  });

  return json<LoaderData>({ 
    leadershipMessaging: leadershipMessaging.map(leader => ({
      ...leader,
      createdAt: leader.createdAt.toISOString(),
      updatedAt: leader.updatedAt.toISOString()
    }))
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");
  
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = formData.get("name") as string;
    const title = formData.get("title") as string;
    const handle = formData.get("handle") as string;
    const politicalLeaning = formData.get("politicalLeaning") as string;

    const errors: ActionData['errors'] = {};
    if (!name) errors.name = "Name is required";
    if (!title) errors.title = "Title is required";
    if (!handle) errors.handle = "Handle is required";

    if (Object.keys(errors).length > 0) {
      return json<ActionData>({ errors }, { status: 400 });
    }

    const data: Prisma.LeadershipMessagingCreateInput = {
      name,
      title,
      handle,
      politicalLeaning,
      country: {
        connect: { id: params.id }
      }
    };

    await db.leadershipMessaging.create({ data });
  } else if (intent === "delete") {
    const leaderId = formData.get("leaderId") as string;
    await db.leadershipMessaging.delete({
      where: { id: leaderId }
    });
  }

  return null;
}

export default function LeadershipMessagingTab() {
  const { country } = useOutletContext<{ country: any }>();
  const { leadershipMessaging } = useLoaderData<typeof loader>();
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
        action: `/api/countries/${country.id}/generate-leadership-messaging`,
      }
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">Leadership Messaging</h2>
          <p className="text-sm text-muted-foreground">
            Manage key government leaders and their social media presence in {country.name}.
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
                  placeholder="Full Name"
                  required
                />
                {actionData?.errors?.name && (
                  <p className="text-sm text-red-500">{actionData.errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder="e.g., Minister of Foreign Affairs"
                  required
                />
                {actionData?.errors?.title && (
                  <p className="text-sm text-red-500">{actionData.errors.title}</p>
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

              <div className="space-y-2">
                <label htmlFor="politicalLeaning" className="text-sm font-medium">
                  Political Leaning
                </label>
                <input
                  type="text"
                  id="politicalLeaning"
                  name="politicalLeaning"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder="e.g., Center-right, pro-Western (or Unknown)"
                />
                {actionData?.errors?.politicalLeaning && (
                  <p className="text-sm text-red-500">{actionData.errors.politicalLeaning}</p>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Leader"}
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
          <h3 className="text-lg font-medium mb-4">Existing Leaders</h3>
          <div className="space-y-4">
            {leadershipMessaging.map((leader) => (
              <div key={leader.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <h4 className="font-medium">{leader.name}</h4>
                  <p className="text-sm text-muted-foreground">{leader.title}</p>
                  {leader.politicalLeaning && (
                    <p className="text-sm text-muted-foreground">
                      Political Leaning: {leader.politicalLeaning}
                    </p>
                  )}
                  <a 
                    href={`https://twitter.com/${leader.handle.replace('@', '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-sm text-blue-500 hover:underline"
                  >
                    {leader.handle}
                  </a>
                </div>
                <div className="flex gap-2">
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="leaderId" value={leader.id} />
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