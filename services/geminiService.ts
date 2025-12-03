import { GoogleGenAI, Type, SchemaType } from "@google/genai";

// Ensure API Key is present
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

/**
 * Uploads a PDF or Image (base64) to extract Fabric Data.
 * Uses gemini-2.5-flash for efficiency.
 */
export const extractFabricData = async (base64Data: string, mimeType: string) => {
  try {
    const prompt = `
    You are a textile expert assistant for the "Creata Collection" catalog app.
    Analyze the attached document (PDF or Image). 
    
    Extract the following details and **Translate all values to Spanish**:
    1. Fabric Name (Look for headers, bold text, or near the word "Article").
    2. Supplier Name (Look for logos, footers, or legal text).
    3. Technical Summary (Create a 3-4 line summary including composition, weight, martindale cycles, and usage. **In Spanish**).
    4. Composition (Specific string, translate materials to Spanish).
    5. Martindale (Specific string).
    6. Usage (Specific string, e.g., "Tapicería", "Cortinas").

    Return JSON strictly adhering to this schema.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Error extracting fabric data:", error);
    throw error;
  }
};

/**
 * Generates a new fabric design image.
 * Uses gemini-3-pro-image-preview.
 */
export const generateFabricDesign = async (prompt: string, aspectRatio: string = "1:1", size: string = "1K") => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: `Generate a high-quality close-up texture image of a fabric: ${prompt}` }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
          imageSize: size as any,
        }
      }
    });
    
    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
       if (part.inlineData) {
         return `data:image/png;base64,${part.inlineData.data}`;
       }
    }
    return null;
  } catch (error) {
    console.error("Error generating fabric:", error);
    throw error;
  }
};

/**
 * Edits an existing fabric image using text prompts.
 * Uses gemini-2.5-flash-image.
 */
export const editFabricImage = async (base64Image: string, prompt: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Optimized for editing/multimodal
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: base64Image } },
          { text: prompt }
        ]
      }
    });

     // Extract image
     for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
   }
   return null;
  } catch (error) {
    console.error("Error editing fabric:", error);
    throw error;
  }
};

/**
 * Chatbot with Grounding.
 * Uses gemini-3-pro-preview + googleSearch.
 */
export const chatWithExpert = async (message: string, history: any[]) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are a helpful expert assistant for 'Creata Collection', a premium fabric catalog. You help designers find trends, technical info, and fabric care advice. Respond in Spanish."
      }
    });

    const text = response.text;
    const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    const sources = grounding?.map((chunk: any) => ({
      title: chunk.web?.title || 'Source',
      uri: chunk.web?.uri || '#'
    })) || [];

    return { text, sources };
  } catch (error) {
    console.error("Error in chat:", error);
    return { text: "I'm having trouble connecting to the design studio. Please try again.", sources: [] };
  }
};