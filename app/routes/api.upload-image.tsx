import { ActionFunctionArgs, json, UploadHandler } from "@remix-run/node";
import { unstable_parseMultipartFormData } from "@remix-run/node";

// Configure your cloud storage here
async function uploadImage(file: File): Promise<string> {
  // For now, we'll create a data URL as a placeholder
  // In production, you'd upload this to a cloud storage service
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mimeType = file.type || 'image/png';
  return `data:${mimeType};base64,${base64}`;
}

interface UploadHandlerParams {
  name: string;
  filename?: string;
  contentType: string;
  data: AsyncIterable<Uint8Array>;
}

const uploadHandler: UploadHandler = async ({ 
  name, 
  filename, 
  data, 
  contentType 
}: UploadHandlerParams) => {
  if (name !== "image") return undefined;

  const chunks: Uint8Array[] = [];
  for await (const chunk of data) {
    chunks.push(chunk);
  }
  
  const buffer = Buffer.concat(chunks);
  const file = new File([buffer], filename || 'image.png', { type: contentType });
  const dataUrl = await uploadImage(file);
  return dataUrl;
};

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toLowerCase() !== "post") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

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

    return json({ imageUrl });
  } catch (error) {
    console.error('Image upload error:', error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to upload image" }, 
      { status: 400 }
    );
  }
} 