
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
    // Optional: Try to parse a substring if the end is malformed (e.g. truncated)
    // This is a basic recovery attempt for common truncation cases
    if (typeof text === 'string') {
        const firstBrace = text.indexOf('{');
        // Try to find the last closing brace
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

    return safeJsonParse(response.text);
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
    
    const result = safeJsonParse(response.text);
    return {
        colorName: result.colorName || "Desconocido",
        supplierName: result.supplierName || ""
    };
  });
};

/**
 * Visualizador Pro: Aplica la tela al mueble (Nano Banana Pro / Gemini 3 Pro Image).
 * Ahora soporta opcionalmente una textura de madera (Input 3).
 */
export const visualizeUpholstery = async (
    furnitureBase64: string, 
    fabricBase64: string,
    woodBase64?: string
): Promise<string | null> => {
  return retryWithBackoff(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Prompt optimizado para MANTENER GEOMETRÍA ABSOLUTA
    let promptText = `
      You are a specialized texture mapping engine. You are NOT a creative generator.
      
      INPUTS:
      1. Base Furniture Image (The "Target").
      2. Fabric Texture (The "Material").
      ${woodBase64 ? '3. Wood Texture (The "Finish").' : ''}
      
      OBJECTIVE:
      Apply the materials to the target object using strict digital compositing rules.
      
      CRITICAL CONSTRAINTS (DO NOT VIOLATE):
      - **ZERO GEOMETRY CHANGE**: The output furniture MUST align pixel-perfectly with Input 1. Do not rotate, zoom, crop, or change the perspective. The silhouette must be identical.
      - **PRESERVE BACKGROUND**: Do not regenerate the floor, walls, or background. Keep them exactly as they are in Input 1.
      - **PRESERVE SHADOWS**: The lighting shadows on the floor and the self-shadows on the furniture cushions must remain exactly where they are.
      
      TASKS:
      1. **Fabric Application**: Identify the soft upholstery parts of Input 1. Replace the original surface pixel data with the texture from Input 2.
         - *Scaling*: The fabric swatch (Input 2) is a macro close-up. **You MUST tile and scale it down SIGNIFICANTLY (reduce scale by roughly 60-70%)** so the weave pattern appears fine and realistic relative to the furniture size. The texture should look like a high-quality furniture fabric, not a zoomed-in microscope shot.
         - *Blending*: Multiply the new texture with the original lighting/shadow map to keep the volume.
         
      ${woodBase64 ? '2. **Wood Application**: Identify rigid structure parts (legs, arms, base). Replace their surface color/grain with Input 3. Maintain the original specularity (shine) and form.' : ''}
      
      Output the final composite image.
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
      contents: {
        parts: parts
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
