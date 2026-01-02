
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
 * Safe JSON Parser specifically for AI responses that might contain markdown or be truncated.
 */
const safeJsonParse = (text: string | undefined): any => {
  if (!text) return {};
  try {
    let clean = text.trim();
    // Remove markdown code blocks (```json ... ```)
    if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(clean);
  } catch (e) {
    console.warn("JSON parsing failed (possibly truncated or invalid format). Returning empty object.", e);
    if (typeof text === 'string') {
        const firstBrace = text.indexOf('{');
        for (let i = text.length - 1; i > firstBrace; i--) {
            if (text[i] === '}') {
                try {
                    return JSON.parse(text.substring(firstBrace, i + 1));
                } catch (e2) {
                    continue; 
                }
            }
        }
    }
    return {};
  }
};

/**
 * Extrae datos técnicos de una tela a partir de una imagen o PDF.
 * UPDATED: Includes visual analysis fallback if text is missing.
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
            Analyze this document (PDF or Image). It is a Technical Fabric Specification Sheet.
            
            OBJECTIVE: Extract complete fabric data.
            
            INSTRUCTIONS:
            1. **SUPPLIER NAME**: Search specifically in the HEADER or FOOTER for the brand name (e.g., FORMATEX, ARTEX, CREATA). If found, extract it exactly.
            2. **MODEL NAME**: Look for the largest text usually at the top.
            3. **TECHNICAL SUMMARY (CRITICAL)**: Read the "Description", "Notes", or "General Info" paragraph. Summarize it in Spanish. Include details about texture, usage, or finish (e.g., "Easy Clean"). 
               - IF PDF: You MUST extract this from the text.
               - IF IMAGE with no text: Analyze the texture visually.
            4. **SPECS**: Extract Composition, Weight, Martindale (abrasion), and Usage (Heavy Duty, Decorative, etc.).
            
            Return clean JSON.
          ` }
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
            availableColors: { type: Type.ARRAY, items: { type: Type.STRING } },
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
    return safeJsonParse(response.text);
  });
};

/**
 * Identifica el nombre del color Y el proveedor leyendo la etiqueta (OCR).
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
            Analyze this image of a fabric swatch with a label.
            
            TASK 1: **READ** the specific color name printed on the label (OCR).
               - Look for text like "05 Sand", "Navy Blue", "12 Graphite".
               - Do not describe the visual color (e.g., do NOT say "It is blue"). READ the text.
               - If no text is visible, return "Desconocido".
               
            TASK 2: Look for a Supplier/Brand name on the label (e.g., FORMARTEX).
            
            Return JSON.
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
    const result = safeJsonParse(response.text);
    return {
        colorName: result.colorName || "Desconocido",
        supplierName: result.supplierName || ""
    };
  });
};

/**
 * Visualizador Pro: Aplica la tela al mueble (Gemini 3 Pro Image).
 * PROMPT REFORZADO: BLOQUEO DE GEOMETRÍA Y ESCALA REDUCIDA
 */
export const visualizeUpholstery = async (
    furnitureBase64: string, 
    fabricBase64: string,
    woodBase64?: string
): Promise<string | null> => {
  return retryWithBackoff(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Prompt optimizado con tus requerimientos específicos
    let promptText = `
      Role: Expert 3D Rendering & Texture Mapping Engine.
      
      INPUTS:
      - Image 1 (BASE): Furniture photography (Master Geometry).
      - Image 2 (TEXTURE): Fabric swatch (Close-up).
      ${woodBase64 ? '- Image 3: Wood swatch.' : ''}

      OBJECTIVE: Photo-realistically replace the upholstery of the furniture in Image 1 with the texture from Image 2.

      CRITICAL RULES (STRICT):
      1. **GEOMETRY FREEZE (LOCK) - KEEP ORIGINAL COMPOSITION**: 
         - The output MUST be pixel-perfectly aligned with Image 1. 
         - Do NOT change the camera angle, zoom, or perspective.
         - Do NOT change the background. 
         - Do NOT change the furniture shape or position. 
         - The object in the output MUST match the input object's silhouette exactly.

      2. **TEXTURE SCALE REDUCTION (60% SMALLER / HIGH TILING)**: 
         - The fabric in Image 2 is a macro/close-up shot. 
         - You MUST scale down the texture significantly by tiling it.
         - INCREASE TILING DENSITY. The pattern should repeat multiple times across the furniture surface.
         - The pattern/weave size on the furniture must be 60% smaller than a direct projection.
         - Repeat the pattern to ensure high frequency and realistic fabric grain.
         - Do NOT stretch the texture.

      3. **PHYSICS & LIGHTING**: 
         - Wrap the texture around the cushions and curves naturally.
         - Preserve all original wrinkles, shadows, and highlights (Ambient Occlusion) from Image 1.
    `;

    const parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] = [
      { inlineData: { mimeType: "image/jpeg", data: furnitureBase64 } },
      { inlineData: { mimeType: "image/jpeg", data: fabricBase64 } }
    ];

    if (woodBase64) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: woodBase64 } });
    }

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: { parts: parts },
      config: {
          imageConfig: {
              imageSize: "1K",
              aspectRatio: "1:1"
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
    throw new Error("No image generated by the model");
  });
};

export const generateFabricDesign = async (prompt: string, aspectRatio: string = "1:1", size: string = "1K"): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [{ text: `Design a seamless fabric pattern: ${prompt}. High quality, detailed texture.` }]
      },
      config: {
        imageConfig: { aspectRatio: aspectRatio as any, imageSize: size as any }
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

export const chatWithExpert = async (message: string, history: any[], context: string): Promise<{ text: string, sources?: any[] }> => {
  return retryWithBackoff(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...history, { role: 'user', parts: [{ text: message }] }],
        config: {
            systemInstruction: `You are an expert textile consultant for 'Creata Collection'. Context: ${context}. Answer in Spanish.`,
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
