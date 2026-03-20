/**
 * Hub Session Tracker — Contact Center
 */
const CONTACTCENTER_SISTEMA_ID = '89e254d3-f45f-445c-b6b3-cb6e11054ec1'

async function getPublicIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json')
    return (await res.json()).ip || null
  } catch { return null }
}

function getGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    )
  })
}

export async function trackLogin(supabase, userId) {
  try {
    const [ip, geo] = await Promise.all([getPublicIP(), getGeo()])
    await supabase.from('hub_logs_sesion').insert({
      user_id: userId, evento: 'login', sistema_id: CONTACTCENTER_SISTEMA_ID,
      ip_address: ip, user_agent: navigator.userAgent,
      latitud: geo?.lat || null, longitud: geo?.lng || null,
      metadata: { source: 'contact-center' },
    })
  } catch (e) { console.warn('[HubTracker]', e) }
}

export async function trackLogout(supabase, userId) {
  try {
    await supabase.from('hub_logs_sesion').insert({
      user_id: userId, evento: 'logout', sistema_id: CONTACTCENTER_SISTEMA_ID,
      user_agent: navigator.userAgent, metadata: { source: 'contact-center' },
    })
  } catch (e) { console.warn('[HubTracker]', e) }
}
