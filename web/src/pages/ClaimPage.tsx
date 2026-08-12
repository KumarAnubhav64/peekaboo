import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Dropzone from "../components/Dropzone";
import { ApiError, ClaimInfo, ClaimPhoto, ClaimResponse, getJson, postImage } from "../api";

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
        message: `✅ Identity verified (face match ${Math.round(data.similarity * 100)}%). Showing your photos below.`,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.data;
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
      <section className="card claim-card">
        <div className="spinner" />
        <p className="lead">Loading…</p>
      </section>
    );
  }

  if (phase === "rejected" || !info) {
    return (
      <section className="card claim-card">
        <h1>Link not found</h1>
        <p className="lead">This claim link is invalid or expired.</p>
        <a className="btn btn-primary" href="/">
          Go to homepage
        </a>
      </section>
    );
  }

  return (
    <>
      <section className="claim-wrap">
        <div className="card claim-card">
          <h1>Is this you in this photo?</h1>
          <p className="lead">
            A photo containing this face was uploaded. Verify it's really you with a selfie —
            then you'll see <strong>every photo</strong> in the system that has you in it.
          </p>

          <div className="claim-photo">
            <img src={info.crop_url} alt="The face in the photo" />
          </div>

          <Dropzone
            onFile={(f) => {
              setSelfie(f);
              setStatus(null);
            }}
            title={
              selfie ? (
                <>
                  Selected: <span className="link-like">{selfie.name}</span>
                </>
              ) : (
                "Upload a selfie to verify"
              )
            }
            subtitle="Use a clear, front-facing photo of yourself"
            icon="🤳"
          />

          <button
            className="btn btn-primary btn-lg"
            disabled={!selfie || phase === "busy"}
            onClick={verify}
          >
            {phase === "busy" ? "Verifying…" : "Verify my identity"}
          </button>

          {status && (
            <div className={`status ${status.kind}`}>
              {status.kind === "info" && <div className="spinner" />}
              {status.message}
            </div>
          )}
        </div>
      </section>

      {phase === "verified" && photos.length > 0 && (
        <section className="card gallery">
          <h2>
            Photos found with you in them{" "}
            <span className="pill">
              {photos.length} photo{photos.length === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="gallery-grid">
            {photos.map((p) => (
              <a key={p.photo_id} href={p.url} target="_blank" rel="noopener noreferrer">
                <img src={p.url} alt="A photo containing you" loading="lazy" />
              </a>
            ))}
          </div>
        </section>
      )}

      {phase === "verified" && photos.length === 0 && (
        <section className="card">
          <h2>No other photos found</h2>
          <p className="lead">You appear in no other photos in the system yet.</p>
        </section>
      )}
    </>
  );
}
