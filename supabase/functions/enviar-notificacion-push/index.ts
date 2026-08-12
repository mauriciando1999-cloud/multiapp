import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Secreto propio del webhook, igual que en analizar-talento: independiente
// de la service_role key para no desincronizarse si esta rota de formato.
const WEBHOOK_SECRET = Deno.env.get('NOTIF_WEBHOOK_SECRET')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// Arma el titulo/cuerpo de la notificacion segun la tabla que disparo el
// Database Webhook. "tipo" debe coincidir con las claves de push_subscriptions.prefs.
function construirNotificacion(table: string, record: any) {
  switch (table) {
    case 'consultas_showroom': {
      const autos = Array.isArray(record.vehiculos) ? record.vehiculos.join(', ') : ''
      return {
        tipo: 'lead',
        titulo: '🟢 Nuevo Lead',
        cuerpo: `${record.cliente_nombre || 'Un cliente'} consultó por ${autos || 'un vehículo'}`,
        url: '/consultas.html'
      }
    }
    case 'inventario':
      return {
        tipo: 'vehiculo',
        titulo: '🚗 Vehículo Agregado',
        cuerpo: `${record.marca || ''} ${record.modelo || ''} (${record.anio || 'S/A'}) se añadió al inventario`,
        url: '/inventario.html'
      }
    case 'postulantes':
      return {
        tipo: 'curriculum',
        titulo: '📄 Nuevo Currículum',
        cuerpo: `${record.nombre || ''} ${record.apellido || ''} envió su postulación`,
        url: '/admin_postulantes.html'
      }
    case 'consignaciones':
      return {
        tipo: 'consignacion',
        titulo: '📋 Nueva Solicitud de Consignación',
        cuerpo: `${record.nombre || 'Un cliente'} quiere consignar su ${record.vehiculo || 'vehículo'}`,
        url: `/revision_detalle.html?id=${record.id}`
      }
    case 'ventas':
      return {
        tipo: 'venta',
        titulo: '💰 Venta Cerrada',
        cuerpo: `${record.vehiculo || 'Un vehículo'} se vendió por $${Number(record.precio_venta || 0).toLocaleString()}`,
        url: '/analisis_ventas.html'
      }
    default:
      return null
  }
}

// Por ahora estos tipos solo le llegan al admin (curriculums los gestiona
// solo el admin, y ventas es info gerencial). El resto le llega a
// cualquiera que lo haya activado en sus preferencias.
const TIPOS_SOLO_ADMIN = new Set(['curriculum', 'venta'])

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return new Response('No autorizado', { status: 401 })
    }

    const payload = await req.json()
    const notif = construirNotificacion(payload.table, payload.record)
    if (!notif) return new Response('Tabla no soportada, nada que notificar', { status: 200 })

    const supabase = createClient(SB_URL, SB_SERVICE_ROLE)
    const { data: subsRaw, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq(`prefs->>${notif.tipo}`, 'true')

    if (error) throw error

    let subs = subsRaw || []
    if (TIPOS_SOLO_ADMIN.has(notif.tipo) && subs.length > 0) {
      const { data: admins } = await supabase.from('whitelist').select('email').eq('rol', 'admin')
      const emailsAdmin = new Set((admins || []).map((a: any) => (a.email || '').toLowerCase()))
      subs = subs.filter((s: any) => emailsAdmin.has((s.operador_email || '').toLowerCase()))
    }

    if (subs.length === 0) return new Response('Sin suscriptores para este tipo', { status: 200 })

    const payloadStr = JSON.stringify({ title: notif.titulo, body: notif.cuerpo, url: notif.url })

    let enviados = 0
    let expirados = 0
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr
        )
        enviados++
      } catch (e) {
        const status = e?.statusCode
        if (status === 404 || status === 410) {
          // Suscripción vencida o el navegador la invalidó: la borramos.
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          expirados++
        } else {
          console.error('Error enviando push a', sub.id, e?.message || e)
        }
      }
    }

    return new Response(JSON.stringify({ enviados, expirados, total: subs.length }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })
  } catch (e) {
    console.error('Error crítico en enviar-notificacion-push:', e)
    return new Response(e.message, { status: 500 })
  }
})
