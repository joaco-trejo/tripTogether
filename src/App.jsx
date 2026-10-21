import { useState, useEffect } from "react";
import { MapPin, Camera, CalendarDays, LogOut } from "lucide-react";
import { COLORS } from "./constants";
import { supabase } from "./supabaseClient";
import { loadSession, saveSession, clearSession } from "./helpers";
import JoinScreen from "./components/JoinScreen";
import MapTab from "./components/MapTab";
import PhotosTab from "./components/PhotosTab";
import CalendarTab from "./components/CalendarTab";

// ---------------------------------------------------------------
// Marco de la app (tamaño de celular, fuentes y estilos globales)
// ---------------------------------------------------------------
function Shell({ children }) {
  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: COLORS.sand,
        color: COLORS.ink,
        minHeight: "600px",
        maxWidth: "420px",
        margin: "0 auto",
        borderRadius: "20px",
        overflow: "hidden",
        boxShadow: "0 20px 50px rgba(11,51,65,0.25)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        .fr-title { font-family: 'Fraunces', serif; }
        .leaflet-container { font-family: 'Inter', sans-serif; }
        * { box-sizing: border-box; }
        input, button { font-family: inherit; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.line}; border-radius: 3px; }
      `}</style>
      {children}
    </div>
  );
}

export default function TripPlannerApp() {
  const [tab, setTab] = useState("map");
  // session = { tripId, tripName, tripCode, memberId, memberName } o null si todavía no te uniste
  const [session, setSession] = useState(loadSession);
  const [checking, setChecking] = useState(Boolean(session));

  // Al abrir la app con una sesión guardada, confirmamos que esa persona todavía
  // existe en Supabase (por si se borró la base o saliste del viaje desde otro lado).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase
      .from("members")
      .select("id")
      .eq("id", session.memberId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // Si hubo un error de red, dejamos la sesión como está (puede ser solo falta de internet)
        if (!error && !data) {
          clearSession();
          setSession(null);
        }
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // Solo al montar: no queremos revalidar cada vez que cambia la sesión
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoined = (newSession) => {
    saveSession(newSession);
    setSession(newSession);
    setTab("map");
  };

  const handleLeave = async () => {
    if (!window.confirm("¿Salir del viaje? Vas a dejar de aparecer en el mapa.")) return;
    try {
      // Al borrar al miembro, Supabase borra también su ubicación (on delete cascade)
      await supabase.from("members").delete().eq("id", session.memberId);
    } catch {
      // Si falla (sin internet), igual salimos de este dispositivo
    }
    clearSession();
    setSession(null);
  };

  if (checking) {
    return (
      <Shell>
        <p style={{ padding: "40px 20px", textAlign: "center", color: "#9A9086", fontSize: "13px" }}>
          Cargando…
        </p>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <JoinScreen onJoined={handleJoined} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Header tab={tab} session={session} onLeave={handleLeave} />

      <div style={{ flex: 1, overflowY: "auto", minHeight: "440px" }}>
        {/* Las tres pestañas quedan montadas siempre y solo se ocultan con CSS:
            así no pierden su estado (mapa, cámara) al cambiar de pestaña. */}
        <div style={{ display: tab === "map" ? "block" : "none" }}>
          <MapTab session={session} active={tab === "map"} />
        </div>
        <div style={{ display: tab === "photos" ? "block" : "none" }}>
          <PhotosTab session={session} active={tab === "photos"} />
        </div>
        <div style={{ display: tab === "calendar" ? "block" : "none" }}>
          <CalendarTab session={session} />
        </div>
      </div>

      <BottomNav tab={tab} setTab={setTab} />
    </Shell>
  );
}

function Header({ tab, session, onLeave }) {
  const titles = {
    map: "Dónde está cada uno",
    photos: "Fotos del viaje",
    calendar: "Calendario compartido",
  };
  return (
    <div
      style={{
        background: COLORS.teal,
        color: COLORS.sand,
        padding: "20px 20px 16px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "12px",
            letterSpacing: "0.02em",
            opacity: 0.75,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.tripName} · código{" "}
          <strong data-testid="trip-code" style={{ letterSpacing: "0.08em" }}>
            {session.tripCode}
          </strong>
        </div>
        <div className="fr-title" style={{ fontSize: "22px", fontWeight: 600, marginTop: "2px" }}>
          {titles[tab]}
        </div>
      </div>
      <button
        onClick={onLeave}
        title="Salir del viaje"
        aria-label="Salir del viaje"
        style={{
          background: "rgba(255,255,255,0.12)",
          border: "none",
          color: COLORS.sand,
          borderRadius: "10px",
          width: "34px",
          height: "34px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const items = [
    { id: "map", label: "Mapa", icon: MapPin },
    { id: "photos", label: "Fotos", icon: Camera },
    { id: "calendar", label: "Calendario", icon: CalendarDays },
  ];
  return (
    <div style={{ display: "flex", borderTop: `1px solid ${COLORS.line}`, background: "#fff" }}>
      {items.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              padding: "10px 0 12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              cursor: "pointer",
              color: active ? COLORS.coral : "#9A9086",
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 2} />
            <span style={{ fontSize: "11px", fontWeight: active ? 600 : 500 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}