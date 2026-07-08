import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

async function procesarPostulante(record: any, supabase: any, models: string[]) {
  try {
    console.log(`[CORE] Iniciando análisis para ID: ${record.id}`);
    
    // 1. Descarga del CV
    const { data: fileBlob, error: dlError } = await supabase.storage.from('curriculums').download(record.cv_url);
    if (dlError) throw new Error(`Storage: ${dlError.message}`);
    const b64 = encodeBase64(await fileBlob.arrayBuffer());

    let success = false;
    let resJson;

    // 2. Intentar con modelos disponibles (Resiliencia)
    for (const model of models) {
      if (success) break;
      console.log(`[IA] Consultando modelo: ${model}`);
      
      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: "Analiza este CV. Califica de 1 a 10 las siguientes habilidades exactas: Ventas, Cierre, CRM, Negociación, Energía. Responde ÚNICAMENTE un JSON con esta estructura: {\"habilidades\": [{\"skill\": \"Ventas\", \"score\": 8}, ...], \"resumen\": \"texto\"}" },
            { inline_data: { mime_type: "application/pdf", data: b64 } }
          ]}],
          generationConfig: { response_mime_type: "application/json" }
        })
      });

      if (aiRes.ok) {
        resJson = await aiRes.json();
        success = true;
      } else {
        console.warn(`[IA] Modelo ${model} falló o está saturado.`);
        await wait(1000);
      }
    }

    if (!success || !resJson.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("No se obtuvo respuesta válida de la IA.");
    }

    // 3. Parseo y Validación de Datos
    const aiText = resJson.candidates[0].content.parts[0].text;
    const cleanData = JSON.parse(aiText.replace(/```json|```/g, "").trim());

    if (!cleanData.habilidades || !cleanData.resumen) {
      throw new Error("El JSON de la IA no contiene habilidades o resumen.");
    }

    // 4. ACTUALIZACIÓN FINAL (Solo si llegamos aquí con datos)
    console.log(`[DB] Guardando métricas y marcando como procesado para ${record.id}`);
    const { error: upError } = await supabase.from('postulantes').update({
        habilidades_ia: cleanData.habilidades, // Array JSONB
        resumen_ia: cleanData.resumen,       // Texto
        estatus: 'Procesado por IA'            // Cambio de estatus al final
    }).eq('id', record.id);

    if (upError) throw upError;
    
    return true;

  } catch (e) {
    console.error(`[ERROR] Fallo en ID ${record.id}:`, e.message);
    // Opcional: Marcar como Error en la DB para no reintentar infinitamente
    await supabase.from('postulantes').update({ estatus: 'Error en Procesamiento' }).eq('id', record.id);
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    const { record } = await req.json();
    const supabase = createClient(SB_URL, SB_SERVICE_ROLE);

    // Listar modelos
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
    const listData = await listRes.json();
    const models = listData.models?.filter((m: any) => m.name.includes("flash")).map((m: any) => m.name).sort().reverse();

    // Procesar el actual
    await procesarPostulante(record, supabase, models);

    // Barrer pendientes
    const { data: pendientes } = await supabase
      .from('postulantes')
      .select('*')
      .eq('estatus', 'Pendiente')
      .neq('id', record.id)
      .limit(3);

    if (pendientes) {
      for (const p of pendientes) {
        await procesarPostulante(p, supabase, models);
        await wait(500);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
})