
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

// Inicializar cliente
// NOTA: La API Key se inyecta vía process.env.API_KEY según la configuración de vite.config.ts
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper para reintentar operaciones cuando el modelo está sobrecargado (503).
 * Espera exponencialmente: 2s -> 4s -> 8s
 */
async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.response?.status;
      const message = error?.message || JSON.stringify(error);
      
      // Detectar error 503 o mensajes de sobrecarga
      const isOverloaded = status === 503 || message.includes('503') || message.includes('overloaded') || message.includes('capacity');
      
      if (isOverloaded && i < retries - 1) {
        const waitTime = delay * Math.pow(2, i);
        console.warn(`⚠️ Modelo saturado (503). Reintentando en ${waitTime/1000}s... (Intento ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Si no es un error de sobrecarga o se acabaron los intentos, lanzar error
      if (!isOverloaded) throw error;
    }
  }
  throw lastError;
}

/**
 * Extrae datos técnicos de una tela a partir de una imagen o PDF.
 */
export const extractFabricData = async (base64Data: string, mimeType: string): Promise<any> => {
  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: "Analyze this fabric swatch or technical sheet. Extract: name (string), supplier (string), technicalSummary (string), and specs object with composition, weight, martindale, usage. Return JSON." }
        ]
      },
      config: {
        responseMimeType: "application/json",
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
                weight: { type: Type.STRING },
                martindale: { type: Type.STRING },
                usage: { type: Type.STRING }
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  });
};

/**
 * Identifica el nombre del color dominante en una muestra.
 */
export const extractColorFromSwatch = async (base64Data: string): Promise<string> => {
  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: "What is the single best color name for this fabric swatch? Return only the color name (e.g. 'Navy Blue', 'Mustard', 'Charcoal'). in Spanish." }
        ]
      }
    });
    return response.text?.trim() || "Desconocido";
  });
};

/**
 * Visualizador Pro: Aplica la tela al mueble (Nano Banana Pro / Gemini 3 Pro Image).
 */
export const visualizeUpholstery = async (
    furnitureBase64: string, 
    fabricBase64: string,
    fabricInfo?: any
): Promise<string | null> => {
  return retryWithBackoff(async () => {
    const promptText = `
      Act as a professional photo editor. 
      Image 1 is a piece of furniture.
      Image 2 is a fabric texture.
      Task: Retouch Image 1 by replacing the existing upholstery with the fabric texture from Image 2.
      
      Requirements:
      - Maintain perfect perspective, folds, shadows, and lighting from the original furniture image.
      - The fabric pattern scale should be realistic for the furniture size.
      - If the furniture has legs or wood parts, DO NOT change them. Only change the fabric.
      - Output a high-quality photorealistic image.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: furnitureBase64 } },
          { inlineData: { mimeType: "image/jpeg", data: fabricBase64 } },
          { text: promptText }
        ]
      },
      config: {
        // No soportado responseMimeType/responseSchema para modelos de imagen nano banana
      }
    });

    // Buscar la parte de imagen en la respuesta
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    
    throw new Error("No image generated by the model");
  });
};

/**
 * Generador de diseños de tela (Image Gen).
 */
export const generateFabricDesign = async (prompt: string, aspectRatio: string = "1:1", size: string = "1K"): Promise<string> => {
  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [{ text: `Design a seamless fabric pattern: ${prompt}. High quality, detailed texture.` }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any, 
          imageSize: size as any
        }
      }
    });

    for (const candidate of response.candidates || []) {
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No design generated");
  });
};

/**
 * ChatBot Experto.
 */
export const chatWithExpert = async (message: string, history: any[], context: string): Promise<{ text: string, sources?: any[] }> => {
  return retryWithBackoff(async () => {
    const systemInstruction = `You are an expert textile consultant for 'Creata Collection'. 
    Use the following catalog data to answer questions: 
    ${context}
    
    If the answer is not in the context, use your general knowledge but mention it's general info.
    Be concise, professional, and helpful. Always answer in Spanish.`;

    // Usar generateContent para chat simple (stateless para esta función, aunque history se pasa para contexto si se implementara chat session)
    // Para simplificar y usar grounding, usamos generateContent con systemInstruction
    
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
            ...history, // Mensajes previos
            { role: 'user', parts: [{ text: message }] }
        ],
        config: {
            systemInstruction: systemInstruction,
            tools: [{ googleSearch: {} }] // Activar grounding
        }
    });

    const text = response.text || "";
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || "Fuente Web",
        uri: chunk.web?.uri || "#"
    })).filter((s: any) => s.uri !== "#") || [];

    return { text, sources };
  });
};
