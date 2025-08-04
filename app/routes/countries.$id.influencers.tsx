import { Form, useNavigation, useOutletContext, useActionData, useLoaderData, useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/lib/db.server";
import type { Prisma } from "@prisma/client";
import { Wand2, Loader2 } from "lucide-react";

type LoaderData = {
  influencers: Array<{
    id: string;
    name: string;
    handle: string;
    role: string;
    politicalLeaning: number;
    url: string;
    countryId: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

type ActionData = {
  errors?: { 
    name?: string;
    handle?: string;
    role?: string;
    politicalLeaning?: string;
    url?: string;
  };
  error?: string;
  success?: boolean;
};

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");

  const influencers = await db.influencer.findMany({
    where: { countryId: params.id },
    orderBy: { createdAt: "desc" }
  });

  return json<LoaderData>({ 
    influencers: influencers.map(influencer => ({
      ...influencer,
      createdAt: influencer.createdAt.toISOString(),
      updatedAt: influencer.updatedAt.toISOString()
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
    const role = formData.get("role") as string;
    const politicalLeaning = formData.get("politicalLeaning") as string;
    const url = formData.get("url") as string;

    const errors: ActionData['errors'] = {};
    if (!name) errors.name = "Name is required";
    if (!handle) errors.handle = "Handle is required";
    if (!role) errors.role = "Role is required";
    if (!politicalLeaning) errors.politicalLeaning = "Political leaning is required";
    if (!url) errors.url = "URL is required";

    if (Object.keys(errors).length > 0) {
      return json<ActionData>({ errors }, { status: 400 });
    }

    const data: Prisma.InfluencerCreateInput = {
      name,
      handle,
      role,
      politicalLeaning: parseFloat(politicalLeaning),
      url,
      country: {
        connect: { id: params.id }
      }
    };

    await db.influencer.create({ data });
  } else if (intent === "delete") {
    const influencerId = formData.get("influencerId") as string;
    await db.influencer.delete({
      where: { id: influencerId }
    });
  }

  return null;
}

export default function InfluencersTab() {
  const { country } = useOutletContext<{ country: any }>();
  const { influencers } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Add fetcher for AI generation
  const generateFetcher = useFetcher<{ error?: string }>();
  const isGenerating = generateFetcher.state !== "idle";
  const generationError = generateFetcher.data?.error;

  const handleGenerate = async () => {
    // Submit the request using fetcher
    generateFetcher.submit(
      {},
      {
        method: "post",
        action: `/api/countries/${country.id}/generate-influencers`,
      }
    );
  };

  const getPoliticalLeaningLabel = (value: number) => {
    if (value <= -3) return "Far Left";
    if (value <= -2) return "Left";
    if (value <= -1) return "Center-Left";
    if (value <= 1) return "Center";
    if (value <= 2) return "Center-Right";
    if (value <= 3) return "Right";
    return "Far Right";
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        {generationError && (
          <div className="p-4 border border-red-200 bg-red-50 rounded-md">
            <p className="text-sm text-red-600">Error generating influencers: {generationError}</p>
          </div>
        )}

        <div>
          <h2 className="text-lg font-medium">Influencers</h2>
          <p className="text-sm text-muted-foreground">
            Manage key influencers for {country.name}.
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
                <label htmlFor="handle" className="text-sm font-medium">
                  Handle
                </label>
                <input
                  type="text"
                  id="handle"
                  name="handle"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  required
                />
                {actionData?.errors?.handle && (
                  <p className="text-sm text-red-500">{actionData.errors.handle}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="role" className="text-sm font-medium">
                  Role
                </label>
                <input
                  type="text"
                  id="role"
                  name="role"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  required
                />
                {actionData?.errors?.role && (
                  <p className="text-sm text-red-500">{actionData.errors.role}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="politicalLeaning" className="text-sm font-medium">
                  Political Leaning (-3 to 3)
                </label>
                <input
                  type="number"
                  id="politicalLeaning"
                  name="politicalLeaning"
                  min="-3"
                  max="3"
                  step="0.5"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  -3 (Far Left) to 3 (Far Right)
                </p>
                {actionData?.errors?.politicalLeaning && (
                  <p className="text-sm text-red-500">{actionData.errors.politicalLeaning}</p>
                )}
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label htmlFor="url" className="text-sm font-medium">
                  URL
                </label>
                <input
                  type="url"
                  id="url"
                  name="url"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder="https://twitter.com/username"
                  required
                />
                {actionData?.errors?.url && (
                  <p className="text-sm text-red-500">{actionData.errors.url}</p>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Influencer"}
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
          <h3 className="text-lg font-medium mb-4">Existing Influencers</h3>
          <div className="space-y-4">
            {influencers.map((influencer) => (
              <div key={influencer.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <h4 className="font-medium">{influencer.name}</h4>
                  <p className="text-sm text-muted-foreground">{influencer.handle}</p>
                  <p className="text-sm">{influencer.role}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {getPoliticalLeaningLabel(influencer.politicalLeaning)} ({influencer.politicalLeaning})
                    </span>
                    <span className="text-sm">•</span>
                    <a href={influencer.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline">
                      Profile
                    </a>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="influencerId" value={influencer.id} />
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