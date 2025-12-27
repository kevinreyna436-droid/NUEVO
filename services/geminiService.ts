
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

/**
 * Helper para reintentar operaciones cuando el modelo está sobrecargado (503) o tiene límites de cuota (429).
 * Espera exponencialmente: 3s -> 6s -> 12s -> 24s -> 48s -> 60s
 */
async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 6, delay = 3000): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.response?.status;
      const message = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      
      // Detectar saturación (503), límites de cuota (429) o disponibilidad (UNAVAILABLE)
      const isOverloaded = status === 503 || status === 429 || 
                          message.includes('503') || message.includes('429') ||
                          message.includes('overloaded') || message.includes('capacity') || 
                          message.includes('UNAVAILABLE') || message.includes('exhausted');
      
      if (isOverloaded && i < retries - 1) {
        const waitTime = Math.min(delay * Math.pow(2, i), 60000);
        console.warn(`⚠️ Motor limitado o saturado. Reintentando en ${waitTime/1000}s... (Intento ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Extrae datos técnicos de una tela a partir de una imagen o PDF.
 * Ahora busca también la lista de colores disponibles en el texto.
 */
export const extractFabricData = async (base64Data: string, mimeType: string): Promise<any> => {
  return retryWithBackoff(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: `
            Analyze this fabric technical document (PDF) or image header.
            
            OBJECTIVE: Extract the main identity of the fabric model.
            
            INSTRUCTIONS:
            1. **MODEL NAME (Crucial)**: Look for the LARGEST text at the top of the page. It is usually a single word like "FINN", "ALANIS", "RON". Ignore generic titles like "Technical Sheet".
            2. **SUPPLIER**: Look for small brand logos, copyright footers, or web addresses (e.g., 'FORMATEX', 'SUNBRELLA').
            3. **TECHNICAL SUMMARY**: Extract a brief description in Spanish found in the text.
            4. **SPECS**: Find technical values for Composition (e.g., '100% Polyester'), Weight (gr/m2), Martindale (cycles).
            
            Return clean JSON.
          ` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "The Model Name found at the top (e.g. FINN)" },
            supplier: { type: Type.STRING },
            technicalSummary: { type: Type.STRING },
            availableColors: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
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
 * Identifica el nombre del color Y el proveedor leyendo la etiqueta (OCR).
 * Retorna un objeto con ambos datos.
 */
export const extractColorFromSwatch = async (base64Data: string): Promise<{ colorName: string, supplierName?: string }> => {
  return retryWithBackoff(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: `
            Analyze this fabric swatch image.
            
            TASK: Extract the **COLOR NAME** text overlaid on the image.
            
            LOCATIONS TO CHECK:
            - **Bottom Left Corner**
            - **Bottom Right Corner**
            - **Center Bottom**
            
            EXAMPLES:
            - If image shows text "Graphite" at the bottom -> Return "Graphite".
            - If image shows text "Nickel" -> Return "Nickel".
            - If text is "FINN GRAPHITE" -> Return "Graphite" (remove the model name if obvious).
            
            Return JSON with:
            - colorName: The exact text found. If no text is found, return "Desconocido".
            - supplierName: If a brand logo is visible (rare).
          ` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                colorName: { type: Type.STRING },
                supplierName: { type: Type.STRING }
            }
        }
      }
    });
    
    const result = JSON.parse(response.text || "{}");
    return {
        colorName: result.colorName || "Desconocido",
        supplierName: result.supplierName || ""
    };
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Prompt actualizado con instrucciones estrictas para NO MODIFICAR la geometría del mueble.
    const promptText = `
      Act as a high-end photo retoucher specializing in furniture upholstery. 
      Input 1: A piece of furniture image.
      Input 2: A close-up fabric texture swatch.
      
      Task: Create a photorealistic visualization by wrapping the fabric from Input 2 onto the upholstery areas of Input 1.
      
      Requirements:
      - STRICT GEOMETRY PRESERVATION: The furniture in the output MUST be identical in shape, size, angle, and position to Input 1. Do NOT rotate, resize, zoom, or distort the furniture object. The outline must match perfectly.
      - BACKGROUND PRESERVATION: Keep the original background and floor shadows exactly as they are.
      - TEXTURE SCALE (CRITICAL): The provided fabric swatch is a macro shot. You MUST reduce the scale of the texture pattern by approximately 70% (make it significantly denser) to look realistic on the large furniture surface.
      - LIGHTING & SHADOWS: Preserve all original shadows, folds, highlights, and micro-creases to maintain volume and depth. The fabric must look like it wraps around the existing foam.
      - MASKING: Keep legs, wooden frames, metal bases, and the surrounding environment completely untouched. Only change the upholstered fabric parts.
      - QUALITY: The final output must look like a professional, high-resolution catalog photograph.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: furnitureBase64 } },
          { inlineData: { mimeType: "image/jpeg", data: fabricBase64 } },
          { text: promptText }
        ]
      }
    });

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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const systemInstruction = `You are an expert textile consultant for 'Creata Collection'. 
    Use the following catalog data to answer questions: 
    ${context}
    
    If the answer is not in the context, use your general knowledge but mention it's general info.
    Be concise, professional, and helpful. Always answer in Spanish.`;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
            ...history,
            { role: 'user', parts: [{ text: message }] }
        ],
        config: {
            systemInstruction: systemInstruction,
            tools: [{ googleSearch: {} }]
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
