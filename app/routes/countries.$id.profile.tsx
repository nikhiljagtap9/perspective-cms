import { Form, useNavigation, useOutletContext, useLoaderData, useFetcher, useSearchParams, useParams } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { CollapsibleSection } from "~/components/ui/collapsible-section";
import { RichTextEditor } from "~/components/ui/rich-text-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import type { ActionFunctionArgs, LoaderFunctionArgs, UploadHandler } from "@remix-run/node";
import { unstable_parseMultipartFormData, json } from "@remix-run/node";
import { db } from "~/lib/db.server";
import React from "react";
import {
  Info,
  Users,
  LandPlot,
  Book,
  DollarSign,
  Palette,
  Newspaper,
  Shield,
  Clock,
  TrendingUp,
  Globe,
  UserSquare2,
  Shield as ShieldIcon,
  Phone,
  Plus,
  Trash2,
  Wand2,
  AlertCircle,
  Loader2,
  ListPlus
} from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "~/components/ui/input";
import type { SectionKey } from "~/lib/openai.server";
import { Alert, AlertDescription } from "~/components/ui/alert";
import debounce from 'lodash/debounce';

// Configure your cloud storage here
async function uploadImage(file: File): Promise<string> {
  // For now, we'll create a data URL as a placeholder
  // In production, you'd upload this to a cloud storage service
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mimeType = file.type || 'image/png';
  return `data:${mimeType};base64,${base64}`;
}

const uploadHandler: UploadHandler = async ({ name, filename, data, contentType }) => {
  if (name !== "image") return undefined;

  const chunks = [];
  for await (const chunk of data) {
    chunks.push(chunk);
  }
  
  const buffer = Buffer.concat(chunks);
  const file = new File([buffer], filename || 'image.png', { type: contentType });
  const dataUrl = await uploadImage(file);
  return dataUrl;
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const generatingSectionsParam = url.searchParams.get("generating");
  const generatingSections = generatingSectionsParam ? generatingSectionsParam.split(",") : [];

  const [countryWithEmergencyNumbers, country] = await Promise.all([
    db.country.findUnique({
      where: { id: params.id },
      include: {
        emergencyNumbers: {
          orderBy: { createdAt: 'desc' }
        }
      }
    }),
    db.country.findUnique({
      where: { id: params.id },
      select: { name: true }
    })
  ]);

  if (!countryWithEmergencyNumbers || !country) {
    throw new Response("Country not found", { status: 404 });
  }

  // Get the generating sections
  const generatingContent = await db.contentGeneration.findMany({
    where: {
      countryName: country.name,
      status: {
        in: ['PENDING', 'COMPLETED']
      }
    },
    select: {
      section: true
    }
  });

  const dbGeneratingSections = generatingContent.map(gen => gen.section);
  const allGeneratingSections = [...new Set([...generatingSections, ...dbGeneratingSections])];

  return json({ 
    countryWithEmergencyNumbers, 
    inProgressGenerations: allGeneratingSections.length,
    generatingSections: allGeneratingSections
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await unstable_parseMultipartFormData(request, uploadHandler);
      const imageUrl = formData.get("image");
      
      if (!imageUrl || typeof imageUrl !== 'string') {
        return json({ error: 'No image data received' }, { status: 400 });
      }

      // Verify we have a valid data URL
      if (!imageUrl.startsWith('data:')) {
        return json({ error: 'Invalid image format' }, { status: 400 });
      }

      return json({ success: true, imageUrl });
    } catch (error) {
      console.error('Image upload error:', error);
      return json(
        { error: error instanceof Error ? error.message : "Failed to upload image" }, 
        { status: 400 }
      );
    }
  }

  // Handle regular form submissions
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add-emergency-number") {
    const name = formData.get("name") as string;
    const number = formData.get("number") as string;

    if (!name || !number) {
      return json({ error: "Name and number are required" }, { status: 400 });
    }

    await db.emergencyNumber.create({
      data: {
        name,
        number,
        countryId: params.id as string
      }
    });

    return json({ success: true });
  }

  if (intent === "delete-emergency-number") {
    const numberId = formData.get("numberId") as string;
    
    await db.emergencyNumber.delete({
      where: { id: numberId }
    });

    return json({ success: true });
  }

  const field = formData.get("field") as string;
  const content = formData.get("content") as string;

  if (!field) {
    return json({ error: "Field is required" }, { status: 400 });
  }

  await db.country.update({
    where: { id: params.id },
    data: { [field]: content || null }
  });

  return json({ success: true });
}

const SECTIONS = [
  { id: 'overview', title: 'Overview', icon: <Info className="h-5 w-5" /> },
  { id: 'demographics', title: 'Demographics', icon: <Users className="h-5 w-5" /> },
  { id: 'politics', title: 'Politics', icon: <LandPlot className="h-5 w-5" /> },
  { id: 'religion', title: 'Religion', icon: <Book className="h-5 w-5" /> },
  { id: 'economy', title: 'Economy', icon: <DollarSign className="h-5 w-5" /> },
  { id: 'culture', title: 'Culture', icon: <Palette className="h-5 w-5" /> },
  { id: 'media', title: 'Media', icon: <Newspaper className="h-5 w-5" /> },
  { id: 'humanRights', title: 'Human Rights', icon: <Shield className="h-5 w-5" /> },
  { id: 'history', title: 'History', icon: <Clock className="h-5 w-5" /> },
  { id: 'humanDevelopment', title: 'Human Development', icon: <TrendingUp className="h-5 w-5" /> },
  { id: 'diplomacy', title: 'Diplomacy', icon: <Globe className="h-5 w-5" /> },
  { id: 'politicalLeadership', title: 'Political Leadership', icon: <UserSquare2 className="h-5 w-5" /> },
  { id: 'militaryLeadership', title: 'Military Leadership', icon: <ShieldIcon className="h-5 w-5" /> },
] as const;

const POLL_INTERVAL = 3000; // Poll every 3 seconds

export default function ProfileTab() {
  const params = useParams();
  const { 
    countryWithEmergencyNumbers, 
    inProgressGenerations,
    generatingSections: initialGeneratingSections 
  } = useLoaderData<typeof loader>();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const bulkFetcher = useFetcher<{ error?: string; success?: boolean }>();
  
  // Initialize generatingSections with the data from the loader
  const [generatingSections, setGeneratingSections] = useState<Set<string>>(
    new Set(initialGeneratingSections)
  );

  // Update search params when generatingSections changes
  useEffect(() => {
    const sections = Array.from(generatingSections);
    if (sections.length > 0) {
      searchParams.set("generating", sections.join(","));
    } else {
      searchParams.delete("generating");
    }
    // Use { replace: true, preventScrollReset: true } to prevent scroll reset
    setSearchParams(searchParams, { 
      replace: true, 
      preventScrollReset: true 
    });
  }, [generatingSections, searchParams, setSearchParams]);

  console.log('Pending generations:', inProgressGenerations);
  const { country } = useOutletContext<{ country: any }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submittingField = navigation.formData?.get("field");
  const submittingIntent = navigation.formData?.get("intent");

  // Keep track of edited content before submitting
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [generationPolling, setGenerationPolling] = useState<Record<string, number>>({});

  // Keep track of editor references
  const editorRefs = React.useRef<Record<string, any>>({});

  // Add formRef near the top of the component
  const emergencyFormRef = React.useRef<HTMLFormElement>(null);

  // Add this state to track the current pending count
  const [currentInProgressCount, setCurrentInProgressCount] = useState(inProgressGenerations);

  // Add this state to track when we want to focus after a submission
  const [focusAfterSubmit, setFocusAfterSubmit] = useState(false);

  // Add this state to track the last submission state
  const [lastSubmissionState, setLastSubmissionState] = useState(navigation.state);

  // Update the effect to watch for navigation state changes
  useEffect(() => {
    // If we were submitting and now we're idle, focus the input
    if (lastSubmissionState === "submitting" && navigation.state === "idle") {
      nameInputRef.current?.focus();
    }
    // Update the last submission state
    setLastSubmissionState(navigation.state);
  }, [navigation.state]);

  // Function to check if a section has changes
  const hasChanges = (section: string) => {
    const originalContent = country[section] || '';
    const currentContent = editedContent[section];
    return currentContent !== undefined && currentContent !== originalContent;
  };

  const handleImageUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch('/api/upload-image', {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      if (!data.imageUrl) {
        throw new Error('No image URL in response');
      }

      return data.imageUrl;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  // Add fetcher for revalidating content
  const contentFetcher = useFetcher();
  
  // Modify the pollAllGenerations function to use fetcher instead of reload
  const pollAllGenerations = async () => {
    try {
      // First check for completed generations and save them
      const response = await fetch(`/api/countries/${country.id}/generate-content`, {
        // Add these headers to ensure we're not getting a cached response
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const data = await response.json();

      // Then get the current status
      const pendingResponse = await fetch(`/api/countries/${country.id}/pending-generations`);
      const pendingData = await pendingResponse.json();
      
      // Update states atomically
      setGeneratingSections(new Set(pendingData.generatingSections as string[]));
      setCurrentInProgressCount(pendingData.inProgressCount);

      if (data.error) {
        console.error(data.error);
      } else if (data.savedCount > 0) {
        // For each saved generation, fetch and update the content
        for (const gen of data.generations) {
          const contentResponse = await fetch(
            `/api/countries/${country.id}/profile?section=${gen.section}`
          );
          const contentData = await contentResponse.json();
          
          if (contentData.content) {
            const editor = editorRefs.current[gen.section];
            if (editor?.commands?.setContent) {
              editor.commands.setContent(contentData.content);
            }
            country[gen.section] = contentData.content;
          }
        }
      }

      // Continue polling if there are still sections generating
      if (pendingData.inProgressCount > 0) {
        const timeoutId = window.setTimeout(pollAllGenerations, POLL_INTERVAL);
        setGenerationPolling(prev => ({
          ...prev,
          all: timeoutId
        }));
      }
    } catch (error) {
      console.error('Error polling generations:', error);
      const timeoutId = window.setTimeout(pollAllGenerations, POLL_INTERVAL);
      setGenerationPolling(prev => ({
        ...prev,
        all: timeoutId
      }));
    }
  };

  // Add a debounced content update function
  const debouncedContentUpdate = React.useCallback(
    debounce((editor: any, content: string) => {
      if (editor?.commands?.setContent) {
        editor.commands.setContent(content);
      }
    }, 100),
    []
  );

  // Modify the fetcher effect to use debounced updates
  useEffect(() => {
    if (contentFetcher.data && contentFetcher.state === "idle") {
      const { section, content } = contentFetcher.data as { section: string; content: string };
      if (section && content) {
        // Update the editor content using debounced function
        const editor = editorRefs.current[section];
        debouncedContentUpdate(editor, content);
        
        // Update the country data
        country[section] = content;
        
        // Reset edited content for this section
        setEditedContent(prev => {
          const next = { ...prev };
          delete next[section];
          return next;
        });
      }
    }
  }, [contentFetcher.data, contentFetcher.state, debouncedContentUpdate]);

  // Start polling for all generations when the component mounts
  useEffect(() => {
    const timeoutId = window.setTimeout(pollAllGenerations, POLL_INTERVAL);
    setGenerationPolling(prev => ({
      ...prev,
      all: timeoutId
    }));

    return () => {
      Object.values(generationPolling).forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
    };
  }, []);

  // Modify the pollGenerationStatus function to handle content updates
  const pollGenerationStatus = async (section: string, generationId: string) => {
    try {
      const response = await fetch(`/api/countries/${country.id}/generate-content?generationId=${generationId}`);
      const data = await response.json();

      if (data.error) {
        console.error(data.error);
        setGeneratingSections(prev => {
          const next = new Set(prev);
          next.delete(section);
          return next;
        });
        setCurrentInProgressCount(prev => prev - 1);
        return;
      }

      if (data.status === 'ERROR') {
        console.error('Generation failed:', data.error);
        setGeneratingSections(prev => {
          const next = new Set(prev);
          next.delete(section);
          return next;
        });
        setCurrentInProgressCount(prev => prev - 1);
        return;
      }

      // If the content is saved, update the editor and remove from generating sections
      if (data.status === 'SAVED' && data.content) {
        // Update the editor content
        const editor = editorRefs.current[section];
        if (editor?.commands?.setContent) {
          editor.commands.setContent(data.content);
          // Also update the editedContent state to ensure it's in sync
          setEditedContent(prev => ({
            ...prev,
            [section]: data.content
          }));
        }

        // Update the country data
        country[section] = data.content;

        // Remove from generating sections
        setGeneratingSections(prev => {
          const next = new Set(prev);
          next.delete(section);
          return next;
        });
        setCurrentInProgressCount(prev => prev - 1);
        return;
      }

      // Continue polling if not saved yet
      const timeoutId = window.setTimeout(() => {
        pollGenerationStatus(section, generationId);
      }, POLL_INTERVAL);

      setGenerationPolling(prev => ({
        ...prev,
        [section]: timeoutId
      }));
    } catch (error) {
      console.error('Error polling generation status:', error);
      setGeneratingSections(prev => {
        const next = new Set(prev);
        next.delete(section);
        return next;
      });
      setCurrentInProgressCount(prev => prev - 1);
    }
  };

  const generateContent = async (section: SectionKey) => {
    // Immediately update UI state and URL
    setGeneratingSections(prev => {
      const next = new Set(prev);
      next.add(section);
      return next;
    });
    setCurrentInProgressCount(prev => prev + 1);

    try {
      const response = await fetch(`/api/countries/${country.id}/generate-content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ section }),
      });
      
      const data = await response.json();
      if (data.error) {
        console.error(data.error);
        // Revert UI state on error
        setGeneratingSections(prev => {
          const next = new Set(prev);
          next.delete(section);
          return next;
        });
        setCurrentInProgressCount(prev => prev - 1);
        return;
      }

      // Start polling for the result
      pollGenerationStatus(section, data.generationId);
    } catch (error) {
      console.error('Error starting content generation:', error);
      // Revert UI state on error
      setGeneratingSections(prev => {
        const next = new Set(prev);
        next.delete(section);
        return next;
      });
      setCurrentInProgressCount(prev => prev - 1);
    }
  };

  // Add a ref for the name input
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  // Add a ref for the number input
  const numberInputRef = React.useRef<HTMLInputElement>(null);

  // Add handler for emergency number paste
  const handleEmergencyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const match = value.match(/^(.*?):\s*(\d+)$/);
    
    if (match) {
      const [_, name, number] = match;
      // Update name field with formatted name
      e.target.value = name.trim();
      
      // Update number field
      if (numberInputRef.current) {
        numberInputRef.current.value = number;
        // Focus the number field
        numberInputRef.current.focus();
      }
    }
  };

  const [bulkNumbers, setBulkNumbers] = useState<Array<{ name: string; number: string }>>([]);
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  // Add handler for bulk text processing
  const handleBulkTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const lines = text.split('\n').filter(line => line.trim());
    const numbers = lines.map(line => {
      const match = line.match(/^(.*?):\s*(\d+)$/);
      if (match) {
        const [_, name, number] = match;
        return { name: name.trim(), number: number.trim() };
      }
      return null;
    }).filter((item): item is { name: string; number: string } => item !== null);
    
    setBulkNumbers(numbers);
  };

  // Add handler for bulk submission
  const handleBulkSubmit = async () => {
    try {
      const submissions = bulkNumbers.map(({ name, number }) => {
        const formData = new FormData();
        formData.append('intent', 'add-emergency-number');
        formData.append('name', name);
        formData.append('number', number);
        
        return new Promise((resolve, reject) => {
          bulkFetcher.submit(formData, { method: 'post' });
          const checkState = setInterval(() => {
            if (bulkFetcher.state === 'idle') {
              clearInterval(checkState);
              if (bulkFetcher.data?.error) {
                reject(bulkFetcher.data.error);
              } else {
                resolve(true);
              }
            }
          }, 100);
        });
      });

      await Promise.all(submissions);
      
      // Close dialog and reset state
      setShowBulkDialog(false);
      setBulkNumbers([]);
      // Refresh the page to show new numbers
      window.location.reload();
    } catch (error) {
      console.error('Bulk submission error:', error);
    }
  };

  return (
    <div className="space-y-6">
      {currentInProgressCount > 0 && (
        <Alert className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription className="flex-1">
            {currentInProgressCount} section{currentInProgressCount === 1 ? '' : 's'} being processed...
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h2 className="text-lg font-medium">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Manage profile information for {country.name}.
        </p>
      </div>

      <CollapsibleSection
        title="Emergency Numbers"
        icon={<Phone className="h-5 w-5" />}
        defaultOpen
      >
        <div className="space-y-4">
          <div className="grid gap-4">
            {countryWithEmergencyNumbers.emergencyNumbers?.map((number: any) => (
              <div key={number.id} className="flex items-center gap-4">
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div className="font-medium">{number.name}</div>
                  <div>{number.number}</div>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete-emergency-number" />
                  <input type="hidden" name="numberId" value={number.id} />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    type="submit"
                    disabled={isSubmitting && submittingIntent === "delete-emergency-number"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Form>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <Form 
              ref={emergencyFormRef}
              method="post" 
              className="flex-1 flex gap-4 items-end"
            >
              <input type="hidden" name="intent" value="add-emergency-number" />
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">Name</label>
                  <Input 
                    ref={nameInputRef}
                    id="name" 
                    name="name" 
                    placeholder="e.g., Police" 
                    required 
                    disabled={isSubmitting && submittingIntent === "add-emergency-number"}
                    onChange={handleEmergencyNameChange}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="number" className="text-sm font-medium">Number</label>
                  <Input 
                    ref={numberInputRef}
                    id="number" 
                    name="number" 
                    placeholder="e.g., 911" 
                    required 
                    disabled={isSubmitting && submittingIntent === "add-emergency-number"}
                  />
                </div>
              </div>
              <Button 
                type="submit"
                disabled={isSubmitting && submittingIntent === "add-emergency-number"}
              >
                {isSubmitting && submittingIntent === "add-emergency-number" ? (
                  "Adding..."
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Number
                  </>
                )}
              </Button>
            </Form>

            <div className="flex items-end">
              <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <ListPlus className="h-4 w-4 mr-2" />
                    Bulk Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Bulk Add Emergency Numbers</DialogTitle>
                    <DialogDescription>
                      Paste emergency numbers in the format "Name: Number" (one per line)
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <Textarea
                      placeholder="Police: 122&#10;Ambulance: 123&#10;Fire: 180"
                      className="min-h-[200px] font-mono"
                      onChange={handleBulkTextChange}
                    />
                    {bulkNumbers.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {bulkNumbers.length} numbers ready to add
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleBulkSubmit}
                      disabled={bulkNumbers.length === 0}
                    >
                      Add {bulkNumbers.length} Numbers
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <CollapsibleSection
            key={section.id}
            title={section.title}
            icon={section.icon}
            actions={
              <Button 
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent the collapsible from toggling
                  generateContent(section.id as SectionKey);
                }}
                disabled={
                  generatingSections.has(section.id) || 
                  Boolean(editedContent[section.id]?.trim() || country[section.id]?.trim())
                }
              >
                {generatingSections.has(section.id) ? (
                  "Generating..."
                ) : editedContent[section.id]?.trim() || country[section.id]?.trim() ? (
                  <>
                    <Wand2 className="h-4 w-4 mr-2 opacity-50" />
                    Generated
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Auto-Generate
                  </>
                )}
              </Button>
            }
          >
            <Form method="post" className="space-y-4">
              <input type="hidden" name="field" value={section.id} />
              <input 
                type="hidden" 
                name="content" 
                value={editedContent[section.id] ?? country[section.id] ?? ''} 
              />
              
              <RichTextEditor
                content={editedContent[section.id] ?? country[section.id] ?? ''}
                onChange={(content) => {
                  setEditedContent(prev => ({
                    ...prev,
                    [section.id]: content
                  }));
                }}
                placeholder={`Enter ${section.title.toLowerCase()} information...`}
                onUploadImage={handleImageUpload}
                onEditorReady={(editor) => {
                  // Store the editor instance itself
                  editorRefs.current[section.id] = editor;
                }}
              />

              <Button 
                type="submit" 
                disabled={
                  (isSubmitting && submittingField === section.id) || 
                  !hasChanges(section.id)
                }
              >
                {isSubmitting && submittingField === section.id 
                  ? "Saving..." 
                  : hasChanges(section.id)
                    ? "Save Changes"
                    : "No Changes"
                }
              </Button>
            </Form>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
} 