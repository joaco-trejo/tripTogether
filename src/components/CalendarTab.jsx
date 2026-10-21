// =================================================================
// TAB 3 — CALENDARIO COMPARTIDO (Etapa 2: tabla "events" en Supabase)
// Todos los del viaje ven y editan las mismas actividades, en vivo.
// =================================================================
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { COLORS } from "../constants";
import { supabase } from "../supabaseClient";
import { friendlyError } from "../helpers";

export default function CalendarTab({ session }) {
  const { tripId, memberId } = session;
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("events")
      .select("*")
      .eq("trip_id", tripId)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });
    if (loadError) {
      setError(friendlyError(loadError));
    } else {
      setError(null);
      setEvents(data ?? []);
    }
    setLoading(false);
  }, [tripId]);

  // Carga inicial + recarga automática cuando alguien agrega o borra una actividad
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`events-${tripId}-${memberId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, memberId, load]);

  const addEvent = async () => {
    if (!title.trim() || !date) return;
    const { error: insertError } = await supabase
      .from("events")
      .insert({ trip_id: tripId, title: title.trim(), date });
    if (insertError) {
      setError(friendlyError(insertError));
      return;
    }
    setTitle("");
    setDate("");
    await load();
  };

  const removeEvent = async (id) => {
    const { error: deleteError } = await supabase.from("events").delete().eq("id", id);
    if (deleteError) {
      setError(friendlyError(deleteError));
      return;
    }
    await load();
  };

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ background: "white", borderRadius: "12px", padding: "12px", marginBottom: "14px" }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Actividad (ej: Llegada al hotel)"
          maxLength={80}
          style={{ width: "100%", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${COLORS.line}`, fontSize: "13px", marginBottom: "8px" }}
        />
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ flex: 1, padding: "9px 10px", borderRadius: "8px", border: `1px solid ${COLORS.line}`, fontSize: "13px" }}
          />
          <button
            onClick={addEvent}
            aria-label="Agregar actividad"
            style={{ background: COLORS.coral, color: "white", border: "none", borderRadius: "8px", padding: "0 16px", fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 12px", background: "#FDECEC", color: "#A43B3B", fontSize: "12.5px", borderRadius: "8px", marginBottom: "12px", lineHeight: 1.45 }}>
          {error}
        </div>
      )}

      {loading && <p style={{ fontSize: "12.5px", color: "#9A9086" }}>Cargando calendario…</p>}

      {!loading && events.length === 0 && !error && (
        <p style={{ fontSize: "12.5px", color: "#9A9086", textAlign: "center", marginTop: "16px" }}>
          Sin actividades todavía. Agregá la primera del viaje.
        </p>
      )}

      {events.map((e) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "white", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px" }}>
          <div style={{ width: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: COLORS.tealDark }}>
              {e.date ? e.date.slice(8, 10) : "–"}
            </div>
            <div style={{ fontSize: "9.5px", color: "#9A9086", textTransform: "uppercase" }}>
              {e.date ? monthShort(e.date) : ""}
            </div>
          </div>
          <div style={{ flex: 1, fontSize: "13.5px" }}>{e.title}</div>
          <button
            onClick={() => removeEvent(e.id)}
            aria-label="Borrar actividad"
            style={{ border: "none", background: "transparent", color: "#C79A9A", cursor: "pointer" }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      <p style={{ fontSize: "11.5px", color: "#9A9086", marginTop: "10px", lineHeight: 1.5 }}>
        Este calendario vive en una tabla de <strong>Supabase</strong>: cuando alguien del grupo agrega o borra una
        actividad, todos lo ven al instante.
      </p>
    </div>
  );
}

function monthShort(iso) {
  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const m = parseInt(iso.slice(5, 7), 10) - 1;
  return months[m] || "";
}