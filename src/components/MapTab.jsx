// =================================================================
// TAB 1 — MAPA (Etapa 2: ubicaciones reales con Supabase)
//  - Tu ubicación sale de la Geolocation API del navegador.
//  - Cada ~5 segundos tu posición se guarda en la tabla "locations".
//  - Las posiciones de los demás se leen de Supabase y se actualizan
//    en vivo gracias a Realtime (sin recargar la página).
// =================================================================
import { useState, useEffect, useRef } from "react";
import { Users, Navigation } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { COLORS, FRIEND_COLORS } from "../constants";
import { supabase } from "../supabaseClient";
import { friendlyError, timeAgo } from "../helpers";

const SEND_EVERY_MS = 5000; // cada cuánto se sube tu posición
const REFRESH_EVERY_MS = 30000; // red de seguridad: recarga el grupo por si Realtime falla

export default function MapTab({ session, active }) {
  const { tripId, memberId, memberName } = session;
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const [myPos, setMyPos] = useState(null);
  const [others, setOthers] = useState([]); // el resto del grupo
  const [geoError, setGeoError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [, setTick] = useState(0); // fuerza a refrescar los "hace 2 min"

  // 1) Crear el mapa, una sola vez
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current).setView([-34.6, -58.4], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
  }, []);

  // Al volver a esta pestaña, el mapa tiene que recalcular su tamaño
  useEffect(() => {
    if (active && mapRef.current) {
      const t = setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 50);
      return () => clearTimeout(t);
    }
  }, [active]);

  // 2) Tu ubicación: se lee del dispositivo y se sube a Supabase
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Este navegador no soporta geolocalización.");
      return;
    }
    let latest = null; // última posición leída
    let sent = null; // última posición subida

    const sendIfNew = () => {
      if (!latest || latest === sent) return;
      sent = latest;
      supabase
        .from("locations")
        .upsert({
          member_id: memberId,
          lat: latest.lat,
          lng: latest.lng,
          updated_at: new Date().toISOString(),
        })
        .then(({ error }) => setSendError(error ? friendlyError(error) : null));
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyPos(latest);
        setGeoError(null);
        if (!sent) sendIfNew(); // la primera vez se sube enseguida
      },
      (err) => setGeoError("No se pudo acceder a tu ubicación: " + err.message),
      { enableHighAccuracy: true }
    );
    const timer = setInterval(sendIfNew, SEND_EVERY_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
    };
  }, [memberId]);

  // 3) El resto del grupo: carga inicial + actualizaciones en vivo
  useEffect(() => {
    async function loadMembers() {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, created_at, locations(lat, lng, updated_at)")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true });
      if (error) {
        setLoadError(friendlyError(error));
        return;
      }
      setLoadError(null);
      const list = (data ?? []).map((m, i) => {
        // Según cómo detecte Supabase la relación, "locations" puede venir como objeto o como lista
        const loc = Array.isArray(m.locations) ? m.locations[0] : m.locations;
        return {
          id: m.id,
          name: m.name,
          // El color depende del orden de llegada, así todos ven el mismo color para cada persona
          color: FRIEND_COLORS[i % FRIEND_COLORS.length],
          lat: loc ? loc.lat : null,
          lng: loc ? loc.lng : null,
          updatedAt: loc ? loc.updated_at : null,
        };
      });
      setOthers(list.filter((m) => m.id !== memberId));
    }

    loadMembers();

    const channel = supabase
      .channel(`map-${tripId}-${memberId}`)
      // Alguien se unió o salió del viaje → recargamos la lista
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, () => loadMembers())
      // Alguien movió su ubicación → actualizamos solo a esa persona
      .on("postgres_changes", { event: "*", schema: "public", table: "locations" }, (payload) => {
        const row = payload.new;
        if (!row || !row.member_id) return;
        setOthers((prev) =>
          prev.map((m) =>
            m.id === row.member_id ? { ...m, lat: row.lat, lng: row.lng, updatedAt: row.updated_at } : m
          )
        );
      })
      .subscribe();

    const refresh = setInterval(loadMembers, REFRESH_EVERY_MS);
    const tick = setInterval(() => setTick((n) => n + 1), 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [tripId, memberId]);

  // 4) Dibujar tu marcador y centrar el mapa en vos la primera vez
  useEffect(() => {
    if (!mapRef.current || !myPos) return;
    if (markersRef.current.me) {
      markersRef.current.me.setLatLng([myPos.lat, myPos.lng]);
    } else {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${COLORS.tealDark};border:3px solid white;box-shadow:0 0 0 3px ${COLORS.tealDark}55"></div>`,
      });
      markersRef.current.me = L.marker([myPos.lat, myPos.lng], { icon })
        .addTo(mapRef.current)
        .bindPopup("Vos");
      mapRef.current.setView([myPos.lat, myPos.lng], 15);
    }
  }, [myPos]);

  // 5) Dibujar los marcadores de los demás (crear, mover o quitar según cambie la lista)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set();

    others.forEach((m) => {
      if (m.lat == null) return; // todavía no mandó su ubicación
      seen.add(m.id);
      const existing = markersRef.current[m.id];
      if (existing) {
        existing.setLatLng([m.lat, m.lng]);
        return;
      }
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${m.color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
      });
      // El nombre lo escribe otra persona: se pone como texto (no como HTML) por seguridad
      const label = document.createElement("span");
      label.textContent = m.name;
      markersRef.current[m.id] = L.marker([m.lat, m.lng], { icon }).addTo(map).bindPopup(label);
    });

    // Quitar los marcadores de quienes ya no están
    Object.keys(markersRef.current).forEach((id) => {
      if (id === "me" || seen.has(id)) return;
      markersRef.current[id].remove();
      delete markersRef.current[id];
    });
  }, [others]);

  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const points = others.filter((m) => m.lat != null).map((m) => [m.lat, m.lng]);
    if (myPos) points.push([myPos.lat, myPos.lng]);
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
  };

  const errors = [geoError, loadError, sendError].filter(Boolean);

  return (
    <div style={{ position: "relative" }}>
      <div ref={mapDivRef} style={{ height: "280px", width: "100%", background: "#dfe7e4" }} />

      {errors.map((msg) => (
        <div key={msg} style={{ padding: "10px 16px", background: "#FDECEC", color: "#A43B3B", fontSize: "12.5px" }}>
          {msg}
        </div>
      ))}

      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: COLORS.tealDark }}>
            <Users size={15} /> Grupo ({others.length + 1})
          </div>
          <button
            onClick={fitAll}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              background: COLORS.coral, color: "white", border: "none",
              borderRadius: "20px", padding: "6px 12px", fontSize: "12.5px",
              fontWeight: 600, cursor: "pointer",
            }}
          >
            <Navigation size={14} /> Ver a todos
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: "white", borderRadius: "10px", marginBottom: "6px" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: COLORS.tealDark }} />
          <span style={{ fontSize: "13px" }}>Vos ({memberName})</span>
          <span style={{ marginLeft: "auto", fontSize: "11px", color: "#9A9086" }}>
            {myPos ? "ubicación real activa" : "buscando ubicación…"}
          </span>
        </div>

        {others.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: "white", borderRadius: "10px", marginBottom: "6px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: m.color }} />
            <span style={{ fontSize: "13px" }}>{m.name}</span>
            <span style={{ marginLeft: "auto", fontSize: "11px", color: "#9A9086" }}>
              {m.lat == null ? "sin ubicación todavía" : timeAgo(m.updatedAt)}
            </span>
          </div>
        ))}

        {others.length === 0 && (
          <p style={{ fontSize: "12.5px", color: "#9A9086", marginTop: "10px", lineHeight: 1.5 }}>
            Todavía no se unió nadie más. Pasales el código del viaje (arriba de todo) a tus amigos.
          </p>
        )}

        <p style={{ fontSize: "11.5px", color: "#9A9086", marginTop: "10px", lineHeight: 1.5 }}>
          Cada celular manda su ubicación a <strong>Supabase</strong> cada pocos segundos, y los demás la ven en
          vivo en el mapa.
        </p>
      </div>
    </div>
  );
}