const { GoogleGenerativeAI } = require('@google/generative-ai');

export default async function handler(req, res) {
    // ... (resto del código de seguridad que ya pusimos)
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // En esta versión, el modelo se llama así y la librería ya sabe dónde buscarlo
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // ...
}

export default async function handler(req, res) {
    // 1. Configuración de Seguridad y CORS (Previene bloqueos del navegador)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Respuesta rápida a las peticiones de verificación del navegador (Preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Solo se acepta POST.' });
    }

    try {
        // 2. Extraemos lo que nos envió el frontend (El texto, la foto y el formato)
        const { prompt, image, mimeType } = req.body;
        
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Llave de API no configurada en Vercel.' });
        }

        // 3. Inicializamos el motor de IA
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let result;

        // 4. Lógica de visión: Si hay imagen, mandamos imagen + texto
        if (image && mimeType) {
            const imagePart = {
                inlineData: {
                    data: image,
                    mimeType: mimeType
                }
            };
            // Enviamos el arreglo con el texto y la foto
            result = await model.generateContent([prompt, imagePart]);
        } else {
            // Si por alguna razón solo llega texto
            result = await model.generateContent(prompt);
        }

        // 5. Devolvemos la respuesta al frontend
        const response = await result.response;
        const text = response.text();

        return res.status(200).json({ respuesta: text });

    } catch (error) {
        console.error("Error crítico en Gemini API:", error);
        return res.status(500).json({ error: 'Fallo al procesar la IA: ' + error.message });
    }
}