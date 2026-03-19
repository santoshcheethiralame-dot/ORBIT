// gemini.ts v2.1 — Centralized AI wrapper: model routing, retry, streaming, shared utilities
// ALL AI calls in the app should go through this file.

const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY as string;
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

/* ─────────────────────────────────────────────────────────────────────────────
   MODEL ROUTING
   Pick the right model for the job — match complexity to cost.
───────────────────────────────────────────────────────────────────────────── */

export type TaskComplexity = 'simple' | 'standard' | 'complex' | 'vision';

export const MODELS: Record<TaskComplexity, string> = {
    simple: 'openrouter/free',                    // Insights, labels, short JSON (≤200 tokens)
    standard: 'google/gemini-flash-1.5',            // Chat, grading, summaries
    complex: 'google/gemini-flash-1.5',            // Exam gen, deep notes (upgrade to haiku when budget allows)
    vision: 'google/gemini-2.0-flash-exp:free',   // Diagram/image analysis
};

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────────────────── */

export interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

interface ORMessage {
    role: string;
    content: string | ContentPart[];
}

/* ─────────────────────────────────────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────────────────────────────────────── */

function toOR(messages: GeminiMessage[], systemPrompt?: string): ORMessage[] {
    const result: ORMessage[] = [];
    if (systemPrompt) result.push({ role: 'system', content: systemPrompt });
    for (const m of messages) {
        result.push({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.parts.map(p => p.text).join(''),
        });
    }
    return result;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
        try { return await fn(); } catch (e) {
            lastErr = e;
            if (i < retries) await new Promise(r => setTimeout(r, 800 * (i + 1)));
        }
    }
    throw lastErr;
}

const HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    'HTTP-Referer': 'https://orbit.study',
    'X-Title': 'Orbit Study App',
};

/* ─────────────────────────────────────────────────────────────────────────────
   SINGLE-SHOT (non-streaming) — use for JSON generation, short responses
───────────────────────────────────────────────────────────────────────────── */

export async function geminiChat(
    messages: GeminiMessage[],
    systemPrompt?: string,
    maxTokens = 1024,
    complexity: TaskComplexity = 'standard',
): Promise<string> {
    return withRetry(async () => {
        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
                model: MODELS[complexity],
                max_tokens: maxTokens,
                messages: toOR(messages, systemPrompt),
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `OpenRouter ${res.status}`);
        }
        const data = await res.json();
        return data?.choices?.[0]?.message?.content ?? '';
    });
}

/* ─────────────────────────────────────────────────────────────────────────────
   STREAMING — use for chat, notes, long-form generation
───────────────────────────────────────────────────────────────────────────── */

export async function geminiStream(
    messages: GeminiMessage[],
    systemPrompt: string,
    onChunk: (delta: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    maxTokens = 1024,
    complexity: TaskComplexity = 'standard',
): Promise<void> {
    try {
        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
                model: MODELS[complexity],
                max_tokens: maxTokens,
                stream: true,
                messages: toOR(messages, systemPrompt),
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            onError(err?.error?.message || `OpenRouter ${res.status}`);
            return;
        }

        const reader = res.body?.getReader();
        if (!reader) { onError('No response body'); return; }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (raw === '[DONE]') continue;
                try {
                    const json = JSON.parse(raw);
                    const text = json?.choices?.[0]?.delta?.content ?? '';
                    if (text) onChunk(text);
                } catch { /* partial JSON, skip */ }
            }
        }
        onDone();
    } catch (e: any) {
        onError(e?.message ?? 'Unknown error');
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   MULTIMODAL — vision tasks (diagram analysis, handwritten notes)
───────────────────────────────────────────────────────────────────────────── */

export async function geminiChatMultimodal(
    contentParts: ContentPart[],
    systemPrompt?: string,
    maxTokens = 2000,
): Promise<string> {
    const messages: ORMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: contentParts });

    const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ model: MODELS.vision, max_tokens: maxTokens, messages }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `OpenRouter ${res.status}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
}

export async function geminiStreamMultimodal(
    contentParts: ContentPart[],
    systemPrompt: string,
    onChunk: (delta: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    maxTokens = 2000,
): Promise<void> {
    try {
        const messages: ORMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: contentParts },
        ];

        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ model: MODELS.vision, max_tokens: maxTokens, stream: true, messages }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            onError(err?.error?.message || `OpenRouter ${res.status}`);
            return;
        }

        const reader = res.body?.getReader();
        if (!reader) { onError('No response body'); return; }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (raw === '[DONE]') continue;
                try {
                    const json = JSON.parse(raw);
                    const text = json?.choices?.[0]?.delta?.content ?? '';
                    if (text) onChunk(text);
                } catch { /* skip */ }
            }
        }
        onDone();
    } catch (e: any) {
        onError(e?.message ?? 'Unknown error');
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED URL FETCHER
   Single source of truth — previously duplicated in AIStudyAssistant.tsx
───────────────────────────────────────────────────────────────────────────── */

export async function fetchUrlContent(url: string): Promise<{ text: string; images: string[] }> {
    try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        const html = data.contents ?? '';

        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll('script,style,nav,header,footer,aside,.nav,.header,.footer,.sidebar').forEach(el => el.remove());
        const text = (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 12000);

        const imgMatches = html.match(/src=["'](https?:\/\/[^"']+\.(?:png|jpg|jpeg|gif|webp|svg))[^"']*/gi) ?? [];
        const images = imgMatches
            .map((m: string) => m.replace(/src=["']/, '').replace(/["'].*/, ''))
            .slice(0, 4);

        return { text, images };
    } catch {
        return { text: '', images: [] };
    }
}

/** Convenience: fetch URL and return just the text string (for notes generator) */
export async function fetchUrlText(url: string): Promise<string> {
    const { text } = await fetchUrlContent(url);
    return text;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED PDF UTILITIES
   Two modes: text extraction (for text models) and image extraction (for vision)
───────────────────────────────────────────────────────────────────────────── */

async function ensurePdfJs(): Promise<any> {
    if (!(window as any).pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            s.onload = () => resolve();
            s.onerror = reject;
            document.head.appendChild(s);
        });
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    return (window as any).pdfjsLib;
}

/** Extract plain text from PDF pages — for standard text models */
export async function extractPdfText(dataUrl: string, maxPages = 20): Promise<string> {
    try {
        const pdfjsLib = await ensurePdfJs();
        const pdf = await pdfjsLib.getDocument(dataUrl).promise;
        const numPages = Math.min(pdf.numPages, maxPages);
        const pageTexts: string[] = [];
        for (let p = 1; p <= numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const pageText = content.items.map((item: any) => item.str).join(' ').replace(/\s+/g, ' ').trim();
            if (pageText) pageTexts.push(`[Page ${p}]\n${pageText}`);
        }
        return pageTexts.join('\n\n').slice(0, 14000);
    } catch (e) {
        console.error('PDF text extract failed:', e);
        return '';
    }
}

/** Extract PDF pages as images — for vision models (diagrams, handwriting) */
export async function extractPdfImages(dataUrl: string, maxPages = 8): Promise<string[]> {
    try {
        const pdfjsLib = await ensurePdfJs();
        const pdf = await pdfjsLib.getDocument(dataUrl).promise;
        const numPages = Math.min(pdf.numPages, maxPages);
        const images: string[] = [];
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d')!;
            await page.render({ canvasContext: ctx, viewport }).promise;
            images.push(canvas.toDataURL('image/jpeg', 0.8));
        }
        return images;
    } catch {
        return [];
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   FEYNMAN EXPLAINER
   Rewrites any explanation as if teaching a curious 16-year-old
───────────────────────────────────────────────────────────────────────────── */

export async function feynmanify(
    concept: string,
    context: string,
    onChunk: (d: string) => void,
    onDone: () => void,
    onError: (e: string) => void,
): Promise<void> {
    await geminiStream(
        [{
            role: 'user',
            parts: [{
                text: `Apply the Feynman Technique to explain this concept.

Concept: ${concept}
Context: ${context}

Structure your explanation:
1. **Plain-English definition** (one sentence, zero jargon)
2. **Real-world analogy** (vivid, not from a textbook)
3. **Worked example** (show ONE concrete case — formula/process if applicable)
4. **The tricky part most people miss:** [one key insight]

Write like you're talking to a smart 16-year-old. Define any jargon you must use.` }],
        }],
        'You are a master teacher. Explain complex ideas using the Feynman Technique — simple language, vivid analogies, concrete examples.',
        onChunk, onDone, onError,
        600,
        'standard',
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ANKI CARD GENERATOR
───────────────────────────────────────────────────────────────────────────── */

export interface AnkiCard {
    front: string;   // Question / cloze prompt
    back: string;    // Answer
    tags: string[];  // Subtopic labels
}

export async function generateAnkiCards(
    subjectName: string,
    content: string,
    count = 5,
): Promise<AnkiCard[]> {
    const raw = await geminiChat(
        [{
            role: 'user',
            parts: [{
                text: `Generate ${count} Anki flashcards from this content.

Subject: ${subjectName}
Content: ${content}

Return ONLY a JSON array (no markdown fences):
[{"front":"prompt ≤15 words","back":"answer ≤30 words","tags":["topic"]}]

Rules:
- Use cloze: "The _____ controls X in Y context"
- One concept per card
- Back = dense, scannable
- Tags = lowercase subtopic names` }],
        }],
        'You are an Anki expert. Return only valid JSON array.',
        400,
        'standard',
    );
    try {
        return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
        return [];
    }
}