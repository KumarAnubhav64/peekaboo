import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Lock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Dropzone from "@/components/Dropzone";
import { ApiError, getJson, postImage, type ClaimInfo, type ClaimPhoto, type ClaimResponse } from "@/api";

type Phase = "loading" | "ready" | "busy" | "verified" | "rejected";

interface Status {
  kind: "error" | "ok" | "info";
  message: string;
}

export default function ClaimPage() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [selfie, setSelfie] = useState<File | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [photos, setPhotos] = useState<ClaimPhoto[]>([]);

  useEffect(() => {
    getJson<ClaimInfo>(`/api/claim-info/${token}`)
      .then((d) => {
        setInfo(d);
        setPhase("ready");
      })
      .catch(() => setPhase("rejected"));
  }, [token]);

  const verify = async () => {
    if (!selfie) return;
    setPhase("busy");
    setStatus({ kind: "info", message: "Verifying your identity…" });
    try {
      const data = await postImage<ClaimResponse>(`/api/claim/${token}`, selfie);
      setPhotos(data.photos);
      setPhase("verified");
      setStatus({
        kind: "ok",
        message: `Identity verified (face match ${Math.round(data.similarity * 100)}%). Showing your photos below.`,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.data as Record<string, unknown>;
        if (body.status === "no_face") {
          setStatus({
            kind: "error",
            message: "No face found in your selfie — use a clear, front-facing photo.",
          });
        } else if (typeof body.similarity === "number") {
          setStatus({
            kind: "error",
            message: `Verification failed. We couldn't confirm this is you (face match ${Math.round(
              Number(body.similarity) * 100,
            )}%). Try another selfie.`,
          });
        } else {
          setStatus({ kind: "error", message: err.message });
        }
      } else {
        setStatus({ kind: "error", message: "Verification failed. Try another selfie." });
      }
      setPhase("ready");
    }
  };

  if (phase === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (phase === "rejected" || !info) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" /> Link not found
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This claim link is invalid or expired.
            </p>
            <Button asChild>
              <Link to="/">Go to homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Is this you in this photo?</CardTitle>
          <p className="text-sm text-muted-foreground">
            A photo containing this face was uploaded. Verify it's really you with a selfie —
            then you'll see <strong>every photo</strong> that has you in it.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <div className="overflow-hidden rounded-2xl ring-1 ring-border">
              <img
                src={info.crop_url}
                alt="The face in the photo"
                className="h-52 w-52 object-cover"
              />
            </div>
          </div>

          <Dropzone
            onFile={(f) => {
              setSelfie(f);
              setStatus(null);
            }}
            title={selfie ? `Selected: ${selfie.name}` : "Upload a selfie to verify"}
            subtitle="Use a clear, front-facing photo of yourself"
          />

          <Button
            className="w-full"
            size="lg"
            disabled={!selfie || phase === "busy"}
            onClick={verify}
          >
            {phase === "busy" ? <Loader2 className="animate-spin" /> : <Lock />}
            {phase === "busy" ? "Verifying…" : "Verify my identity"}
          </Button>

          {status && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                status.kind === "error"
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : status.kind === "ok"
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                    : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {status.kind === "info" && <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />}
              {status.kind === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              {status.kind === "error" && <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              {status.message}
            </div>
          )}
        </CardContent>
      </Card>

      {phase === "verified" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Photos found with you in them</CardTitle>
            <Badge variant="accent">
              {photos.length} photo{photos.length === 1 ? "" : "s"}
            </Badge>
          </CardHeader>
          <CardContent>
            {photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((p) => (
                  <a
                    key={p.photo_id}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="overflow-hidden rounded-lg ring-1 ring-border transition-transform hover:scale-[1.02]"
                  >
                    <img src={p.url} alt="A photo containing you" loading="lazy" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You appear in no other photos in the system yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
