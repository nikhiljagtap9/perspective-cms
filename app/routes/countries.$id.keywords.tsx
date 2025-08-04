import { Form, useNavigation, useOutletContext, useActionData, useLoaderData, useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/lib/db.server";
import type { Prisma } from "@prisma/client";
import { Wand2, Loader2, X } from "lucide-react";
import React from "react";

type LoaderData = {
  keywords: Array<{
    id: string;
    keyword: string;
    countryId: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

type ActionData = {
  errors?: { keyword?: string };
  error?: string;
  success?: boolean;
};

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");

  const keywords = await db.keyword.findMany({
    where: { countryId: params.id },
    orderBy: { createdAt: "desc" }
  });

  return json<LoaderData>({ 
    keywords: keywords.map(keyword => ({
      ...keyword,
      createdAt: keyword.createdAt.toISOString(),
      updatedAt: keyword.updatedAt.toISOString()
    }))
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (!params.id) throw new Error("Country ID is required");
  
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const keywordInput = formData.get("keyword") as string;

    if (!keywordInput) {
      return json<ActionData>(
        { errors: { keyword: "Keyword is required" } },
        { status: 400 }
      );
    }

    // Split the input by commas and trim whitespace
    const keywords = keywordInput.split(",").map(k => k.trim()).filter(k => k.length > 0);

    if (keywords.length === 0) {
      return json<ActionData>(
        { errors: { keyword: "At least one valid keyword is required" } },
        { status: 400 }
      );
    }

    // Create all keywords in a transaction
    await db.$transaction(
      keywords.map(keyword => 
        db.keyword.create({
          data: {
            keyword,
            country: {
              connect: { id: params.id }
            }
          }
        })
      )
    );
  } else if (intent === "delete") {
    const keywordId = formData.get("keywordId") as string;
    await db.keyword.delete({
      where: { id: keywordId }
    });
  }

  return null;
}

export default function KeywordsTab() {
  const { country } = useOutletContext<{ country: any }>();
  const { keywords } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const formRef = React.useRef<HTMLFormElement>(null);

  // Add fetcher for AI generation
  const generateFetcher = useFetcher();
  const isGenerating = generateFetcher.state !== "idle";

  const [previewKeywords, setPreviewKeywords] = React.useState<string[]>([]);
  const [currentInput, setCurrentInput] = React.useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCurrentInput(value);

    // If the last character is a comma, add to preview
    if (value.endsWith(",")) {
      const newKeyword = value.slice(0, -1).trim();
      if (newKeyword) {
        setPreviewKeywords(prev => [...prev, newKeyword]);
        setCurrentInput("");
      }
    } else {
      // Update current input
      setCurrentInput(value);
    }
  };

  const removePreviewKeyword = (index: number) => {
    setPreviewKeywords(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // If there's current input, add it to preview keywords
    if (currentInput.trim()) {
      setPreviewKeywords(prev => [...prev, currentInput.trim()]);
      setCurrentInput("");
    }
    
    // Add all preview keywords to the form data
    const input = e.currentTarget.querySelector('input[name="keyword"]') as HTMLInputElement;
    if (input) {
      input.value = [...previewKeywords, currentInput].filter(k => k.trim()).join(",");
    }
  };

  React.useEffect(() => {
    if (navigation.state === "idle" && !actionData?.errors) {
      formRef.current?.reset();
      setPreviewKeywords([]);
      setCurrentInput("");
    }
  }, [navigation.state, actionData]);

  const handleGenerate = async () => {
    // Submit the request using fetcher
    generateFetcher.submit(
      {},
      {
        method: "post",
        action: `/api/countries/${country.id}/generate-keywords`,
      }
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">Keywords</h2>
          <p className="text-sm text-muted-foreground">
            Manage keywords/topics of interest for U.S. Embassy in {country.name}.
          </p>
        </div>

        <div className="flex gap-4">
          <Form ref={formRef} method="post" className="flex-1 space-y-4" onSubmit={handleSubmit}>
            <input type="hidden" name="intent" value="create" />
            <div className="space-y-2">
              <label htmlFor="keyword" className="text-sm font-medium">
                Keyword
              </label>
              <div className="space-y-2">
                {previewKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {previewKeywords.map((keyword, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1 px-2 py-1 text-sm bg-primary/10 text-primary rounded-full"
                      >
                        <span>{keyword}</span>
                        <button
                          type="button"
                          onClick={() => removePreviewKeyword(index)}
                          className="hover:text-primary/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  id="keyword"
                  name="keyword"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder={previewKeywords.length ? "Type and press comma to add more..." : "Enter keywords separated by commas (e.g. diplomacy, foreign policy, trade)"}
                  value={currentInput}
                  onChange={handleInputChange}
                />
              </div>
              {actionData?.errors?.keyword && (
                <p className="text-sm text-red-500">{actionData.errors.keyword}</p>
              )}
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting 
                  ? "Adding..." 
                  : `Add Keyword${(previewKeywords.length > 0 || currentInput.includes(",")) ? "s" : ""}`
                }
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
          <h3 className="text-lg font-medium mb-4">Existing Keywords</h3>
          <div className="space-y-4">
            {keywords.map((keyword) => (
              <div key={keyword.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">{keyword.keyword}</h4>
                </div>
                <div className="flex gap-2">
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="keywordId" value={keyword.id} />
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