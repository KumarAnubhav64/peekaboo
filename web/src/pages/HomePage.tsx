import { useState } from "react";
import Dropzone from "../components/Dropzone";
import AuthPage from "../components/AuthPage";
import { ApiError, copyText, postImage, UploadResponse } from "../api";
import { useAuth } from "../auth";

interface Status {
  kind: "error" | "ok" | "info";
  message: string;
}

export default function HomePage() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    if (busy) return; // ignore a second upload while the first is processing
    setBusy(true);
    setStatus({ kind: "info", message: "Detecting faces & creating links…" });
    setResult(null);
    try {
      const data = await postImage<UploadResponse>("/api/upload", file);
      setResult(data);
      setStatus({
        kind: "ok",
        message: `Done — share each person's private link.`,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Upload failed";
      setStatus({ kind: "error", message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="hero">
        <h1>Someone uploaded a photo with you in it?</h1>
        <p className="lead">
          Upload any photo. We detect every face and mint a private link for each person.
          When they verify with a selfie, they instantly see <em>every</em> photo containing them.
        </p>
      </section>

      <section className="steps">
        {[
          ["1", "Upload a photo", "Drop any picture. Faces are detected and embedded."],
          ["2", "Share the links", "Copy each person's private link and send it anywhere."],
          ["3", "They claim & see", "After a selfie verification they see all their photos."],
        ].map(([num, title, text]) => (
          <div className="step" key={num}>
            <span className="step-num">{num}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>

      {loading && (
        <section className="card claim-card">
          <div className="spinner" />
        </section>
      )}

      {!loading && !user && (
        <>
          <AuthPage />
        </>
      )}

      {user && (
        <section className="upload-card card">
        <Dropzone
          onFile={handleFile}
          title={
            busy ? (
              "Working…"
            ) : (
              <>
                Drag &amp; drop a photo, or <span className="link-like">browse</span>
              </>
            )
          }
          subtitle="JPG / PNG · up to 20 MB"
          icon="📷"
        />
        {status && (
          <div className={`status ${status.kind}`}>
            {status.kind === "info" && <div className="spinner" />}
            {status.message}
          </div>
        )}
        </section>
      )}

      {user && result && (
        <section className="card results">
          <h2>
            Photo processed <span className="pill">{result.faces.length} face{result.faces.length === 1 ? "" : "s"}</span>
          </h2>
          <div className="photo-row">
            <img className="photo-preview" src={result.photo.url} alt="Uploaded photo" />
            <div className="face-grid">
              {result.faces.map((f, i) => (
                <FaceCard key={f.id} index={i + 1} cropUrl={f.crop_url} shareUrl={f.share_url} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function FaceCard({ index, cropUrl, shareUrl }: { index: number; cropUrl: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const ok = await copyText(shareUrl);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="face-card card">
      <img className="face-crop" src={cropUrl} alt={`Detected face ${index}`} />
      <div className="face-body">
        <strong>Person {index}</strong>
        <div className="face-actions">
          <button className="btn btn-primary btn-sm" onClick={onCopy}>
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <a className="btn btn-ghost btn-sm" href={shareUrl} target="_blank" rel="noopener">
            Open
          </a>
        </div>
      </div>
    </div>
  );
}
