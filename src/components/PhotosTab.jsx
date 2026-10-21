// =================================================================
// TAB 2 — FOTOS (Etapa 2: se guardan en Supabase Storage)
//  - La cámara usa la MediaDevices API del navegador.
//  - Cada foto se sube al bucket "trip-photos" y se registra en la tabla "photos".
//  - Todos los del viaje ven las mismas fotos.
// =================================================================
import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, X } from "lucide-react";
import { COLORS } from "../constants";
import { supabase } from "../supabaseClient";
import { friendlyError } from "../helpers";

const BUCKET = "trip-photos";
const MAX_WIDTH = 1280; // se achican las fotos para no gastar el espacio gratis de Supabase

// Solo dejamos abrir links http(s) (por seguridad, la tabla la puede escribir cualquiera)
const safeUrl = (url) => (/^https?:\/\//i.test(url) ? url : undefined);

export default function PhotosTab({ session, active }) {
  const { tripId, memberId } = session;
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camOn, setCamOn] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState([]);

  // ---- Cargar fotos del viaje + actualizarse en vivo ----
  const loadPhotos = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("photos")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });
    if (loadError) {
      setError(friendlyError(loadError));
      return;
    }
    setPhotos(data ?? []);
  }, [tripId]);

  useEffect(() => {
    loadPhotos();
    const channel = supabase
      .channel(`photos-${tripId}-${memberId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, () => loadPhotos())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, memberId, loadPhotos]);

  // ---- Cámara ----
  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      // Solo guardamos el stream. El <video> todavía no existe en pantalla:
      // se dibuja cuando camOn pasa a true, y ahí lo conecta el useEffect de abajo.
      streamRef.current = stream;
      setCamOn(true);
    } catch (err) {
      setError("No se pudo acceder a la cámara: " + err.message);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };

  useEffect(() => {
    if (camOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [camOn]);

  // Apagar la cámara al salir de la pestaña (privacidad y batería)
  useEffect(() => {
    if (!active && streamRef.current) stopCamera();
  }, [active]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  // ---- Sacar foto y subirla ----
  async function uploadPhoto(blob) {
    const path = `${tripId}/${Date.now()}-${memberId.slice(0, 8)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: "image/jpeg" });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: insertError } = await supabase
      .from("photos")
      .insert({ trip_id: tripId, url: data.publicUrl });
    if (insertError) {
      // Si no se pudo registrar, no dejamos el archivo huérfano en Storage
      await supabase.storage.from(BUCKET).remove([path]);
      throw insertError;
    }
    await loadPhotos();
  }

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("La cámara todavía no está lista. Esperá un segundo y probá de nuevo.");
      return;
    }
    setError(null);
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setError("No se pudo crear la foto. Probá de nuevo.");
          return;
        }
        setUploading(true);
        try {
          await uploadPhoto(blob);
        } catch (err) {
          setError(friendlyError(err));
        } finally {
          setUploading(false);
        }
      },
      "image/jpeg",
      0.8
    );
  };

  // ---- Borrar foto (de la tabla y de Storage) ----
  const removePhoto = async (photo) => {
    const { error: deleteError } = await supabase.from("photos").delete().eq("id", photo.id);
    if (deleteError) {
      setError(friendlyError(deleteError));
      return;
    }
    // La URL pública termina en ".../trip-photos/<ruta del archivo>"
    const marker = `/${BUCKET}/`;
    const index = photo.url.indexOf(marker);
    if (index !== -1) {
      const path = decodeURIComponent(photo.url.slice(index + marker.length));
      await supabase.storage.from(BUCKET).remove([path]);
    }
    await loadPhotos();
  };

  return (
    <div style={{ padding: "16px" }}>
      {!camOn ? (
        <button
          onClick={startCamera}
          style={{
            width: "100%", padding: "14px", borderRadius: "12px", border: "none",
            background: COLORS.tealDark, color: "white", fontSize: "14px", fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer",
          }}
        >
          <Camera size={18} /> Abrir cámara
        </button>
      ) : (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", background: "#000" }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block" }} />
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <button
              onClick={takePhoto}
              disabled={uploading}
              style={{
                flex: 1, padding: "12px", borderRadius: "10px", border: "none",
                background: COLORS.coral, color: "white", fontWeight: 600,
                cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.7 : 1,
              }}
            >
              {uploading ? "Subiendo…" : "Sacar foto"}
            </button>
            <button
              onClick={stopCamera}
              style={{ padding: "12px 16px", borderRadius: "10px", border: `1px solid ${COLORS.line}`, background: "white", cursor: "pointer" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 12px", background: "#FDECEC", color: "#A43B3B", fontSize: "12.5px", borderRadius: "8px", marginTop: "10px", lineHeight: 1.45 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "14px" }}>
        {photos.map((p) => (
          <div key={p.id} style={{ position: "relative", borderRadius: "10px", overflow: "hidden" }}>
            <a href={safeUrl(p.url)} target="_blank" rel="noreferrer">
              <img
                src={p.url}
                alt="Foto del viaje"
                style={{ width: "100%", display: "block", aspectRatio: "1", objectFit: "cover" }}
              />
            </a>
            <button
              onClick={() => removePhoto(p)}
              aria-label="Borrar foto"
              style={{
                position: "absolute", top: "6px", right: "6px", width: "22px", height: "22px",
                borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "white",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {photos.length === 0 && (
        <p style={{ fontSize: "12.5px", color: "#9A9086", textAlign: "center", marginTop: "24px", lineHeight: 1.5 }}>
          Todavía no hay fotos. Las que saques se guardan en <strong>Supabase Storage</strong> y las ve todo el grupo.
        </p>
      )}
    </div>
  );
}