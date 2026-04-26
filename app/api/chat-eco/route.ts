import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { message, context } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ response: 'API key missing' });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: context + '\n\nUser question: ' + message }] }]
        })
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return NextResponse.json({ response: `API error: ${data.error?.message || response.status}` });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
    return NextResponse.json({ response: reply });

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ response: 'Something went wrong: ' + String(error) });
  }
}