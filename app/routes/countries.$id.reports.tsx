import { useLoaderData, useNavigation, useParams } from "@remix-run/react";
import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useState } from "react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Trash2 } from "lucide-react";

interface Report {
  id: string;
  name: string;
  fileUrl: string;
  createdAt: string;
}

export async function loader({ params }: LoaderFunctionArgs) {
  const { id } = params;
  const url = new URL(`/api/countries/${id}/reports`, process.env.APP_URL || 'http://localhost:3000');
  const response = await fetch(url);
  const data = await response.json();
  return json(data);
}

export default function CountryReports() {
  const { reports } = useLoaderData<typeof loader>();
  const { id } = useParams();
  const navigation = useNavigation();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) return;

    try {
      // Upload to /api/upload-file endpoint
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("filename", file.name);
      
      const uploadResponse = await fetch("/api/upload-file", {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const { url: fileUrl } = await uploadResponse.json();

      // Create the report
      const reportResponse = await fetch(`/api/countries/${id}/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          fileUrl,
        }),
      });

      if (!reportResponse.ok) {
        throw new Error('Failed to create report');
      }

      // Reset form
      setName("");
      setFile(null);
      window.location.reload();
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to upload report');
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm("Are you sure you want to delete this report?")) {
      return;
    }

    try {
      const response = await fetch(`/api/countries/${id}/reports`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reportId }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete report');
      }

      window.location.reload();
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to delete report');
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground">
            Report Name
          </label>
          <Input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="file" className="block text-sm font-medium text-foreground">
            File
          </label>
          <input
            type="file"
            id="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mt-1 block w-full text-foreground"
            required
          />
        </div>
        <Button
          type="submit"
          disabled={navigation.state === "submitting"}
        >
          {navigation.state === "submitting" ? "Uploading..." : "Upload Report"}
        </Button>
      </form>

      <div className="mt-8">
        <h3 className="text-lg font-medium text-foreground">Uploaded Reports</h3>
        <div className="mt-4 space-y-4">
          {reports?.map((report: Report) => (
            <div
              key={report.id}
              className="flex items-center justify-between p-4 bg-card rounded-lg border"
            >
              <div>
                <h4 className="text-sm font-medium text-foreground">{report.name}</h4>
                <p className="text-sm text-muted-foreground">
                  {new Date(report.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Button
                  variant="link"
                  asChild
                  className="text-primary hover:text-primary/90"
                >
                  <a
                    href={report.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(report.id)}
                  className="text-destructive hover:text-destructive/90"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 