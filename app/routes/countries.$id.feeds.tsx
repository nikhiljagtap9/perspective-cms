import { Form, useNavigation, useOutletContext } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { FEED_TYPES } from "~/lib/feed-types";
import { PlusCircle, Trash2, MoveUp, MoveDown, Edit as EditIcon, X as CloseIcon, Check as SaveIcon } from "lucide-react";
import type { ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";
import { useState } from "react";
import { RichTextEditor } from "~/components/ui/rich-text-editor";

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "createFeed") {
    const name = formData.get("feedName") as string;
    const url = formData.get("feedUrl") as string;
    const type = formData.get("feedType") as string;
    const extraInfo = formData.get("extraInfo") as string;

    if (!name || !url || !type) {
      return new Response(
        JSON.stringify({ 
          errors: { 
            feedName: name ? undefined : "Name is required",
            feedUrl: url ? undefined : "URL is required",
            feedType: type ? undefined : "Type is required"
          } 
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get max order and add new feed at the end
    const maxOrder = await db.feed.findFirst({
      where: { countryId: params.id },
      orderBy: { order: 'desc' },
      select: { order: true }
    });

    await db.feed.create({
      data: {
        name,
        url,
        type: type as any, // TODO: Fix type
        extraInfo,
        countryId: params.id!,
        order: maxOrder ? maxOrder.order + 1 : 0
      }
    });

    return null;
  }

  if (intent === "deleteFeed") {
    const feedId = formData.get("feedId") as string;
    await db.feed.delete({
      where: { id: feedId }
    });
    return null;
  }

  if (intent === "moveFeed") {
    const feedId = formData.get("feedId") as string;
    const direction = formData.get("direction") as "up" | "down";

    const feed = await db.feed.findUnique({
      where: { id: feedId },
      include: {
        country: {
          include: {
            feeds: {
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    });

    if (!feed) return null;

    const feeds = feed.country.feeds;
    const currentIndex = feeds.findIndex(f => f.id === feedId);
    
    if (direction === "up" && currentIndex > 0) {
      const prevFeed = feeds[currentIndex - 1];
      await db.$transaction([
        db.feed.update({
          where: { id: feed.id },
          data: { order: prevFeed.order }
        }),
        db.feed.update({
          where: { id: prevFeed.id },
          data: { order: feed.order }
        })
      ]);
    } else if (direction === "down" && currentIndex < feeds.length - 1) {
      const nextFeed = feeds[currentIndex + 1];
      await db.$transaction([
        db.feed.update({
          where: { id: feed.id },
          data: { order: nextFeed.order }
        }),
        db.feed.update({
          where: { id: nextFeed.id },
          data: { order: feed.order }
        })
      ]);
    }

    return null;
  }

  if (intent === "updateFeed") {
    const feedId = formData.get("feedId") as string;
    const name = formData.get("name") as string;
    const url = formData.get("url") as string;
    const type = formData.get("type") as string;
    const extraInfo = formData.get("extraInfo") as string;

    if (!name || !url || !type) {
      return new Response(
        JSON.stringify({ 
          errors: { 
            name: name ? undefined : "Name is required",
            url: url ? undefined : "URL is required",
            type: type ? undefined : "Type is required"
          } 
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await db.feed.update({
      where: { id: feedId },
      data: { name, url, type: type as any, extraInfo }
    });

    return null;
  }

  return null;
}

export default function FeedsTab() {
  const { country } = useOutletContext<{ country: any }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [newFeedExtraInfo, setNewFeedExtraInfo] = useState("");
  const [editingExtraInfo, setEditingExtraInfo] = useState<Record<string, string>>({});

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Manage Feeds</h2>
        <p className="text-sm text-muted-foreground">
          Add and manage news feeds for {country.name}.
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <div className="space-y-4">
          <Form method="post" className="space-y-4 p-4 border rounded-lg">
            <input type="hidden" name="intent" value="createFeed" />
            <div className="space-y-2">
              <label htmlFor="feedName" className="text-sm font-medium">
                Feed Name
              </label>
              <input
                type="text"
                id="feedName"
                name="feedName"
                className="w-full px-3 py-2 border rounded-md bg-background"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="feedUrl" className="text-sm font-medium">
                Feed URL
              </label>
              <input
                type="url"
                id="feedUrl"
                name="feedUrl"
                className="w-full px-3 py-2 border rounded-md bg-background"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="feedType" className="text-sm font-medium">
                Feed Type
              </label>
              <select
                id="feedType"
                name="feedType"
                className="w-full px-3 py-2 border rounded-md bg-background"
                required
              >
                <option value="">Select a type</option>
                {FEED_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Extra Information
              </label>
              <input 
                type="hidden" 
                name="extraInfo" 
                value={newFeedExtraInfo} 
              />
              <RichTextEditor
                content={newFeedExtraInfo}
                onChange={setNewFeedExtraInfo}
                placeholder="Add any additional information about this feed..."
                onUploadImage={handleImageUpload}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Feed
            </Button>
          </Form>
        </div>

        <div className="space-y-4">
          {country.feeds.length > 0 ? (
            <div className="border rounded-lg divide-y">
              {country.feeds.map((feed: any, index: number) => (
                <div key={feed.id} className="p-4 space-y-4">
                  {editingFeedId === feed.id ? (
                    <Form method="post" className="space-y-4">
                      <input type="hidden" name="intent" value="updateFeed" />
                      <input type="hidden" name="feedId" value={feed.id} />
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Feed Name</label>
                        <input
                          name="name"
                          defaultValue={feed.name}
                          className="w-full px-3 py-2 border rounded-md bg-background"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Feed URL</label>
                        <input
                          type="url"
                          name="url"
                          defaultValue={feed.url}
                          className="w-full px-3 py-2 border rounded-md bg-background"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Feed Type</label>
                        <select
                          name="type"
                          defaultValue={feed.type}
                          className="w-full px-3 py-2 border rounded-md bg-background"
                          required
                        >
                          {FEED_TYPES.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Extra Information</label>
                        <input 
                          type="hidden" 
                          name="extraInfo" 
                          value={editingExtraInfo[feed.id] ?? feed.extraInfo ?? ''} 
                        />
                        <RichTextEditor
                          content={editingExtraInfo[feed.id] ?? feed.extraInfo ?? ''}
                          onChange={(content) => {
                            setEditingExtraInfo(prev => ({
                              ...prev,
                              [feed.id]: content
                            }));
                          }}
                          placeholder="Add any additional information about this feed..."
                          onUploadImage={handleImageUpload}
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setEditingFeedId(null);
                            setEditingExtraInfo(prev => {
                              const newState = { ...prev };
                              delete newState[feed.id];
                              return newState;
                            });
                          }}
                        >
                          <CloseIcon className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                        <Button type="submit" size="sm">
                          <SaveIcon className="w-4 h-4 mr-2" />
                          Save Changes
                        </Button>
                      </div>
                    </Form>
                  ) : (
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium truncate">{feed.name}</h3>
                          <span className="text-xs bg-secondary px-2 py-1 rounded-full">
                            {FEED_TYPES.find(t => t.id === feed.type)?.label}
                          </span>
                        </div>
                        <a 
                          href={feed.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground hover:underline truncate block"
                        >
                          {feed.url}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <Form method="post" className="flex gap-1">
                          <input type="hidden" name="intent" value="moveFeed" />
                          <input type="hidden" name="feedId" value={feed.id} />
                          <Button 
                            type="submit" 
                            variant="ghost" 
                            size="sm"
                            name="direction"
                            value="up"
                            disabled={index === 0}
                          >
                            <MoveUp className="w-4 h-4" />
                          </Button>
                          <Button 
                            type="submit" 
                            variant="ghost" 
                            size="sm"
                            name="direction"
                            value="down"
                            disabled={index === country.feeds.length - 1}
                          >
                            <MoveDown className="w-4 h-4" />
                          </Button>
                        </Form>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingFeedId(feed.id)}
                        >
                          <EditIcon className="w-4 h-4" />
                        </Button>
                        <Form method="post">
                          <input type="hidden" name="intent" value="deleteFeed" />
                          <input type="hidden" name="feedId" value={feed.id} />
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </Form>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <p>No feeds added yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 