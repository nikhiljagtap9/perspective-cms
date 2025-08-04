import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();
    const fileData = formData.get("file");
    const filename = formData.get("filename") as string;

    if (!fileData || !(fileData instanceof File)) {
      return json({ error: "No file provided" }, { status: 400 });
    }

    // Convert the file to a Blob with the correct type
    const blob = new Blob([await fileData.arrayBuffer()], { type: fileData.type });
    
    const { url } = await put(`reports/${uuidv4()}-${filename}`, blob, {
      access: 'public',
      contentType: fileData.type,
    });

    return json({ url });
  } catch (error) {
    console.error('Error uploading file:', error);
    return json(
      { error: "Failed to upload file", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 