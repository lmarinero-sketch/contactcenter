/**
 * Screenshot Guard — Universal (para todos los subsistemas)
 * 
 * Detecta intentos de captura de pantalla y los registra
 * en hub_logs_sesion del Hub central vía RPC.
 * 
 * Todos los sistemas usan RPC porque no tienen sesión
 * autenticada en el Supabase del Hub (RLS bloquea inserts directos).
 */
import { createClient } from '@supabase/supabase-js'

const HUB_SUPABASE_URL = import.meta.env.VITE_HUB_SUPABASE_URL
const HUB_SUPABASE_ANON_KEY = import.meta.env.VITE_HUB_SUPABASE_ANON_KEY

let hubClient = null
function getHubClient() {
  if (!HUB_SUPABASE_URL || !HUB_SUPABASE_ANON_KEY) return null
  if (!hubClient) hubClient = createClient(HUB_SUPABASE_URL, HUB_SUPABASE_ANON_KEY)
  return hubClient
}

let initialized = false
let userIdentifier = null
let sistemaId = null
let cooldown = false

const COOLDOWN_MS = 5000

async function logScreenshotAttempt(method) {
  if (cooldown) return
  cooldown = true
  setTimeout(() => { cooldown = false }, COOLDOWN_MS)

  console.warn(`[ScreenshotGuard] 📸 Captura detectada: ${method}`)

  try {
    const hub = getHubClient()
    if (!hub) return

    await hub.rpc('hub_log_external_event', {
      p_user_identifier: userIdentifier || 'unknown',
      p_evento: 'screenshot_attempt',
      p_sistema_id: sistemaId,
      p_ip: null,
      p_user_agent: navigator.userAgent,
      p_latitud: null,
      p_longitud: null,
      p_metadata: { method, url: window.location.href },
    })
  } catch (e) {
    console.warn('[ScreenshotGuard] Error logging:', e)
  }
}

function handleKeyDown(e) {
  if (e.key === 'PrintScreen') {
    e.preventDefault()
    logScreenshotAttempt('PrintScreen')
    return
  }
  if (e.ctrlKey && e.key === 'p') {
    logScreenshotAttempt('Ctrl+P (Print)')
    return
  }
  if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
    logScreenshotAttempt(`Cmd+Shift+${e.key} (Mac)`)
    return
  }
}

function handleBeforePrint() {
  logScreenshotAttempt('Print Dialog')
}

/**
 * Inicializa el Screenshot Guard
 * @param {object} options
 * @param {string} options.userId - UUID o username del usuario
 * @param {string} options.sistemaId - UUID del sistema en hub_sistemas
 */
export function initScreenshotGuard({ userId, sistemaId: sId } = {}) {
  if (initialized) return
  initialized = true
  userIdentifier = userId
  sistemaId = sId

  document.addEventListener('keydown', handleKeyDown, { capture: true })
  window.addEventListener('beforeprint', handleBeforePrint)

  console.info('[ScreenshotGuard] 🛡️ Activo')
}

export function updateScreenshotUser(newUserId) {
  userIdentifier = newUserId
}

export function destroyScreenshotGuard() {
  document.removeEventListener('keydown', handleKeyDown, { capture: true })
  window.removeEventListener('beforeprint', handleBeforePrint)
  initialized = false
}
