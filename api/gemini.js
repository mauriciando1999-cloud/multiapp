const { GoogleGenerativeAI } = require('@google/generative-ai');

const SUPABASE_URL = 'https://zamiahmbgwqiralxinju.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GF4Xma460bOVv9WT64Q-cA_r-0DUHHX';

// Valida el JWT del usuario contra Supabase Auth y confirma que
// está en la whitelist (Multiapp es solo para gerentes/admin).
async function getWhitelistedEmail(jwt) {
    if (!jwt) return null;

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) return null;
    const user = await userRes.json();
    if (!user?.email) return null;

    const wlRes = await fetch(
        `${SUPABASE_URL}/rest/v1/whitelist?select=rol&email=eq.${encodeURIComponent(user.email)}`,
        { headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY } }
    );
    if (!wlRes.ok) return null;
    const rows = await wlRes.json();
    return rows.length > 0 ? user.email : null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Solo se acepta POST.' });
    }

    try {
        const jwt = (req.headers.authorization || '').replace('Bearer ', '');
        const email = await getWhitelistedEmail(jwt);
        if (!email) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }

        const { prompt, image, mimeType } = req.body;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Llave de API no configurada en Vercel.' });
        }

        // gemini-1.5-flash fue retirado por Google (404 not found); se
        // reemplaza por gemini-2.5-flash, que si esta disponible con esta
        // key. Se apaga el thinking (no hace falta para describir una
        // foto de un carro) para no gastar tokens de mas.
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { thinkingConfig: { thinkingBudget: 0 } }
        });

        let result;
        if (image && mimeType) {
            const imagePart = {
                inlineData: {
                    data: image,
                    mimeType: mimeType
                }
            };
            result = await model.generateContent([prompt, imagePart]);
        } else {
            result = await model.generateContent(prompt);
        }

        const response = await result.response;
        const text = response.text();

        return res.status(200).json({ respuesta: text });

    } catch (error) {
        console.error("Error crítico en Gemini API:", error);
        return res.status(500).json({ error: 'Fallo al procesar la IA: ' + error.message });
    }
}
