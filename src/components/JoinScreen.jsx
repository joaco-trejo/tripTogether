// =================================================================
// PANTALLA INICIAL — unirse a un viaje con un código, o crear uno nuevo.
// Es lo que genera el tripId y el memberId que usan las tres pestañas.
// =================================================================
import { useState } from "react";
import { Users } from "lucide-react";
import { COLORS } from "../constants";
import { supabase } from "../supabaseClient";
import { friendlyError } from "../helpers";

// Sin 0/O ni 1/I para que el código sea fácil de dictar por WhatsApp o en persona
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: "10px",
  border: `1px solid ${COLORS.line}`,
  fontSize: "14px",
  background: "white",
};

const labelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: COLORS.tealDark,
  margin: "14px 0 6px",
};

export default function JoinScreen({ onJoined }) {
  const [mode, setMode] = useState("join"); // "join" = unirme | "create" = crear
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [tripName, setTripName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Agrega a esta persona como miembro del viaje y avisa a la app
  async function addMember(trip) {
    const { data: member, error: memberError } = await supabase
      .from("members")
      .insert({ trip_id: trip.id, name: name.trim() })
      .select()
      .single();
    if (memberError) throw memberError;
    onJoined({
      tripId: trip.id,
      tripName: trip.name,
      tripCode: trip.code,
      memberId: member.id,
      memberName: member.name,
    });
  }

  async function joinTrip() {
    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, "");
    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("*")
      .eq("code", cleanCode)
      .maybeSingle();
    if (tripError) throw tripError;
    if (!trip) throw new Error("No existe ningún viaje con ese código. Revisalo y probá de nuevo.");
    await addMember(trip);
  }

  async function createTrip() {
    let trip = null;
    // El código tiene que ser único: si justo coincide con otro, se reintenta
    for (let i = 0; i < 5 && !trip; i++) {
      const { data, error: insertError } = await supabase
        .from("trips")
        .insert({ name: tripName.trim(), code: makeCode() })
        .select()
        .single();
      if (!insertError) trip = data;
      else if (insertError.code !== "23505") throw insertError;
    }
    if (!trip) throw new Error("No se pudo generar un código único. Probá de nuevo.");
    await addMember(trip);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Escribí tu nombre.");
    if (mode === "join" && !code.trim()) return setError("Escribí el código del viaje.");
    if (mode === "create" && !tripName.trim()) return setError("Ponele un nombre al viaje.");

    setLoading(true);
    try {
      if (mode === "join") await joinTrip();
      else await createTrip();
      // Si salió bien, App.jsx cambia de pantalla y este componente desaparece
    } catch (err) {
      setError(friendlyError(err));
      setLoading(false);
    }
  }

  const tabStyle = (active) => ({
    flex: 1,
    padding: "9px 0",
    border: "none",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "white" : "transparent",
    color: active ? COLORS.tealDark : "#9A9086",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
  });

  return (
    <div>
      <div style={{ background: COLORS.teal, color: COLORS.sand, padding: "28px 20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", opacity: 0.7 }}>
          <Users size={14} /> Viaje con amigos
        </div>
        <div className="fr-title" style={{ fontSize: "28px", fontWeight: 700, marginTop: "6px" }}>
          TripTogether
        </div>
        <div style={{ fontSize: "13px", opacity: 0.8, marginTop: "6px", lineHeight: 1.5 }}>
          Mapa en vivo, fotos y calendario compartido para tu grupo.
        </div>
      </div>

      <form onSubmit={submit} style={{ padding: "18px 20px 24px" }}>
        <div style={{ display: "flex", gap: "4px", background: "#EADFCF", padding: "4px", borderRadius: "11px" }}>
          <button type="button" onClick={() => setMode("join")} style={tabStyle(mode === "join")}>
            Unirme a un viaje
          </button>
          <button type="button" onClick={() => setMode("create")} style={tabStyle(mode === "create")}>
            Crear viaje
          </button>
        </div>

        <label style={labelStyle}>Tu nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Joaquín"
          maxLength={30}
          style={inputStyle}
        />

        {mode === "join" ? (
          <>
            <label style={labelStyle}>Código del viaje</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ej: K7M2QX"
              maxLength={12}
              autoCapitalize="characters"
              style={{ ...inputStyle, letterSpacing: "0.12em", textTransform: "uppercase" }}
            />
          </>
        ) : (
          <>
            <label style={labelStyle}>Nombre del viaje</label>
            <input
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              placeholder="Ej: Mar del Plata 2026"
              maxLength={40}
              style={inputStyle}
            />
          </>
        )}

        {error && (
          <div style={{ marginTop: "14px", padding: "10px 12px", background: "#FDECEC", color: "#A43B3B", fontSize: "12.5px", borderRadius: "8px", lineHeight: 1.45 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            marginTop: "18px",
            padding: "13px",
            borderRadius: "12px",
            border: "none",
            background: COLORS.coral,
            color: "white",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Un momento…" : mode === "join" ? "Unirme" : "Crear viaje"}
        </button>

        <p style={{ fontSize: "11.5px", color: "#9A9086", marginTop: "14px", lineHeight: 1.5 }}>
          {mode === "join"
            ? "Pedile el código a quien armó el viaje. Lo ves arriba de todo en su pantalla."
            : "Al crear el viaje se genera un código. Pasáselo a tus amigos para que se unan."}
        </p>
      </form>
    </div>
  );
}