import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(request: NextRequest) {
  const { text } = await request.json();
  if (!text?.trim()) return NextResponse.json({ translated: '' });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Translate the following Korean animation prompt to English. Output ONLY the translated English text, no explanation, no quotes.

Korean: ${text}
English:`,
  });

  const translated = response.text?.trim() ?? '';
  return NextResponse.json({ translated });
}
