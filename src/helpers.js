// =================================================================
// Funciones de ayuda compartidas por toda la app
// =================================================================

// ---- Sesión: qué viaje y qué persona sos en este dispositivo ----
// Se guarda en localStorage del navegador para no tener que volver
// a escribir el código cada vez que abrís la app.
const KEY = "triptogether-session";

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Sin localStorage la sesión dura hasta cerrar la pestaña. No es grave.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada que hacer
  }
}

// ---- Errores de Supabase explicados en criollo ----
export function friendlyError(err) {
  const msg = (err && err.message) || String(err);
  if (/schema cache|does not exist/i.test(msg)) {
    return "Faltan las tablas en Supabase. Corré el SQL del paso 6 del instructivo.";
  }
  if (/row-level security|violates row-level/i.test(msg)) {
    return "Supabase bloqueó la acción por permisos. Revisá las políticas del paso 6.5 del instructivo.";
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return "No se pudo conectar con Supabase. Revisá tu internet y el archivo .env.";
  }
  if (/Invalid API key|JWT/i.test(msg)) {
    return "La clave de Supabase del archivo .env no es correcta.";
  }
  return msg;
}

// ---- "hace 5 min" a partir de una fecha ISO ----
export function timeAgo(iso) {
  if (!iso) return null;
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 15) return "ahora";
  if (secs < 60) return `hace ${secs} s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}