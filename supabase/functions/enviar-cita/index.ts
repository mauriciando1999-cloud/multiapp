import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ⚠️ IMPORTANTE: REEMPLAZA ESTO CON LA URL PÚBLICA DE TU LOGO EN SUPABASE (O CUALQUIER URL PÚBLICA)
const LOGO_URL = "https://tu-proyecto.supabase.co/storage/v1/object/public/recursos/logo-multiamerica.png"; 

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, nombre, tipo, detalles } = await req.json()
    
    const fechaCita = detalles?.fecha || "A convenir";
    const horaCita = detalles?.hora || "A convenir";
    const lugarCita = detalles?.lugar || "Sede Principal Multiamerica, Caracas";

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: dbError } = await supabase
      .from('calendario_entrevistas')
      .insert([{
          prospecto_nombre: nombre,
          prospecto_email: email,
          fecha_hora: `${detalles?.fecha}T${detalles?.hora}`,
          ubicacion: lugarCita,
          tipo_entrevista: tipo
      }]);

    if (dbError) console.error("Error al guardar en calendario:", dbError);

    const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? '';
    const GMAIL_PASS = Deno.env.get('GMAIL_PASS') ?? '';

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: GMAIL_USER,
          password: GMAIL_PASS,
        },
      },
    });

    await client.send({
      from: `Multiamerica <${GMAIL_USER}>`,
      to: email,
      subject: `Citación a Entrevista: ${nombre}`,
      content: "text/html",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
          <div style="background-color: #ea580c; padding: 40px; text-align: center;">
            <img src="${LOGO_URL}" alt="Multiamerica Logo" style="max-height: 80px; width: auto; margin-bottom: 10px;">
            <h1 style="color: white; margin: 0; font-style: italic; font-size: 24px; letter-spacing: 2px;">MULTIAMERICA</h1>
          </div>
          
          <div style="padding: 40px; color: #333;">
            <h2 style="color: #ea580c;">¡Hola, ${nombre}!</h2>
            <p style="font-size: 16px; line-height: 1.5;">Nos complace invitarte a una entrevista presencial tras evaluar tu perfil con nuestra tecnología.</p>
            
            <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <p style="margin: 8px 0; font-size: 16px;"><strong>📅 FECHA:</strong> ${fechaCita}</p>
              <p style="margin: 8px 0; font-size: 16px;"><strong>⏰ HORA:</strong> ${horaCita}</p>
              <p style="margin: 8px 0; font-size: 16px;"><strong>📍 LUGAR:</strong> ${lugarCita}</p>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #555;">Por favor, confirma tu asistencia respondiendo a este correo o vía WhatsApp. Te recomendamos llegar 10 minutos antes.</p>
            <p style="margin-top: 40px; font-size: 14px; color: #777;">Atentamente,<br><strong style="color: #333;">Equipo de Talento Multiamerica</strong></p>
          </div>
        </div>`,
    })

    await client.close()

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})