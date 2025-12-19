
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

/**
 * Helper function to retry operations with exponential backoff.
 */
async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const errorCode = error?.status || error?.code;
    const isTransientError = errorCode === 503 || errorCode === 429 || (error.message && error.message.includes('overloaded'));

    if (retries > 0 && isTransientError) {
      console.warn(`Gemini API overloaded or rate-limited (${errorCode}). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Extrae datos técnicos de la tela usando Gemini 3 Flash.
 */
export const extractFabricData = async (base64Data: string, mimeType: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  try {
    const prompt = `
    Eres un experto en extracción de datos para "Creata Collection".
    Analiza el documento (PDF) o imagen (Muestra de color).
    Extrae: Nombre (modelo limpio), Proveedor (busca logos o encabezados), Resumen Técnico (Español), Specs (Composición, Martindale, Uso, Peso).
    Retorna JSON.
    `;

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            supplier: { type: Type.STRING },
            technicalSummary: { type: Type.STRING },
            specs: {
              type: Type.OBJECT,
              properties: {
                composition: { type: Type.STRING },
                martindale: { type: Type.STRING },
                usage: { type: Type.STRING },
                weight: { type: Type.STRING }
              }
            }
          }
        }
      }
    }));

    return JSON.parse(response.text || '{}');
  } catch (error: any) {
    console.error("Error extrayendo datos de tela:", error);
    throw error;
  }
};

/**
 * Detecta el nombre de un color a partir de una muestra de tela.
 */
export const extractColorFromSwatch = async (base64Data: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  try {
    const prompt = "Identifica el nombre del color en esta muestra. Retorna solo el texto en español.";
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
          { text: prompt }
        ]
      }
    }));
    return response.text?.trim() || null;
  } catch (error) {
    return null;
  }
};

/**
 * Genera un diseño de tela fotorrealista usando Nano Banana Pro (Gemini 3 Pro Image).
 */
export const generateFabricDesign = async (prompt: string, aspectRatio: string = "1:1", imageSize: string = "1K"): Promise<string | null> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    try {
        const fullPrompt = `Textura de tela de alta calidad: ${prompt}. Fotografía textil profesional, iluminación de estudio, tejido detallado visible.`;
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: {
                parts: [{ text: fullPrompt }]
            },
            config: {
                imageConfig: { 
                    aspectRatio: aspectRatio as any, 
                    imageSize: imageSize as any 
                }
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (error) {
        console.error("Error generating fabric design:", error);
        throw error;
    }
};

/**
 * Visualización de retapizado usando Nano Banana Pro (Gemini 3 Pro Image).
 * Prioriza la física de la nueva tela sobre las arrugas originales, manteniendo la forma del mueble.
 */
export const visualizeUpholstery = async (
    furnitureImageBase64: string, 
    fabricSwatchBase64: string,
    fabricSpecs?: { composition: string; weight?: string; technicalSummary?: string }
) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    try {
        const physicalContext = fabricSpecs 
            ? `DATOS TÉCNICOS DE LA TELA A APLICAR: ${fabricSpecs.technicalSummary || ''}. Composición: ${fabricSpecs.composition}. Peso: ${fabricSpecs.weight || 'Medio'}.`
            : "Tela de tapicería estándar.";

        // 🔒 PROMPT BLINDADO - CÓDIGO DE SEGURIDAD 6
        // RESTRICCIÓN ABSOLUTA DE MODIFICACIÓN GEOMÉTRICA
        const prompt = `
        ACTÚA COMO UN EXPERTO EN SIMULACIÓN TEXTIL Y RETAPIZADO VIRTUAL:
        
        INPUTS:
        - IMAGEN 1 (BASE): Mueble original.
        - IMAGEN 2 (TEXTURA): Tela nueva.

        TAREA: Reemplazar EXCLUSIVAMENTE EL MATERIAL del tapizado de la Imagen 1 con la Tela de la Imagen 2.

        REGLAS DE GEOMETRÍA (ESTRICTAS - PRIORIDAD ABSOLUTA):
        1. CONGELA LA POSICIÓN Y EL TAMAÑO: La imagen resultante debe superponerse perfectamente píxel por píxel con la original. NO hagas zoom, NO recortes, NO cambies el encuadre.
        2. MANTÉN LA SILUETA EXACTA: El contorno del mueble no puede cambiar ni un milímetro. Respeta patas, brazos y estructura rígida.
        3. PERSPECTIVA INTACTA: No rotes ni inclines el objeto.

        REGLAS DE COMPORTAMIENTO TEXTIL:
        1. ADAPTACIÓN DE SUPERFICIE: Aplica la nueva textura sobre el volumen existente.
        2. GESTIÓN DE ARRUGAS: Si el mueble original tiene arrugas profundas (ej. cuero viejo) y la nueva tela es rígida, ALISA la superficie visualmente, pero SIN cambiar el volumen del cojín.
        3. ILUMINACIÓN: Conserva las sombras y luces originales para mantener el realismo.
        
        ESTILO: Fotorrealismo de producto. Fondo idéntico al original.
        ${physicalContext}
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview', // NANO BANANA PRO
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: furnitureImageBase64 } },
                    { inlineData: { mimeType: 'image/jpeg', data: fabricSwatchBase64 } },
                    { text: prompt }
                ]
            },
            config: {
                imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
            }
        });

        const candidate = response.candidates?.[0];
        if (!candidate) throw new Error("La IA no pudo procesar la imagen.");

        for (const part of candidate.content.parts) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        
        throw new Error("No se recibió el renderizado.");

    } catch (error: any) {
        if (error?.message?.includes("Requested entity was not found")) {
            throw new Error("API_KEY_RESET");
        }
        throw error;
    }
};

/**
 * Chatbot con búsqueda en Google.
 */
export const chatWithExpert = async (message: string, history: any[], catalogContext?: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  try {
    const systemInstruction = `Eres el experto de 'Creata Collection'. Ayuda con dudas técnicas. ${catalogContext || ''}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [...history, { role: 'user', parts: [{ text: message }] }],
      config: { tools: [{ googleSearch: {} }], systemInstruction }
    });
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title || 'Fuente',
      uri: chunk.web?.uri || '#'
    })) || [];
    return { text: response.text, sources };
  } catch (error) { return { text: "Error de conexión.", sources: [] }; }
};
