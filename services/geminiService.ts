
import { GoogleGenAI, Type } from "@google/genai";
import { Shift, BakeryItem, AIInsight } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeShift = async (shift: Shift, items: BakeryItem[]): Promise<AIInsight | null> => {
  try {
    const totalProduction = shift.production.reduce((acc, p) => acc + p.quantity, 0);
    const totalSales = shift.sales.reduce((acc, s) => acc + s.quantity, 0);
    const revenue = shift.sales.reduce((acc, s) => {
      const item = items.find(i => i.id === s.itemId);
      return acc + (item ? item.sellingPrice * s.quantity : 0);
    }, 0);

    const prompt = `
      Analyze this bakery shift data and provide insights.
      Items: ${JSON.stringify(items)}
      Production Log: ${JSON.stringify(shift.production)}
      Sales Log: ${JSON.stringify(shift.sales)}
      Opening Cash: ${shift.openingCash}
      Revenue: ${revenue}
      Items Produced: ${totalProduction}
      Items Sold: ${totalSales}
      
      Provide a business analysis including top-selling items, efficiency suggestions, and projected waste management.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "Executive summary of the shift performance." },
            suggestions: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Actionable steps to improve profitability or operations." 
            },
            projectedWaste: { type: Type.STRING, description: "Analysis of leftover production versus sales." }
          },
          required: ["summary", "suggestions", "projectedWaste"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AIInsight;
    }
    return null;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return null;
  }
};
