// gemini.ts — AI wrapper using OpenRouter (free models, works globally)

const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY as string;
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openrouter/free';

// Vision-capable model for image analysis
const VISION_MODEL = 'google/gemini-2.0-flash-exp:free';

export interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

// Multimodal content part
export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };  // base64 data URL or https URL

// Convert Gemini-style messages to OpenRouter format
function toOR(messages: GeminiMessage[], systemPrompt?: string) {
    const result: { role: string; content: string }[] = [];
    if (systemPrompt) result.push({ role: 'system', content: systemPrompt });
    for (const m of messages) {
        result.push({ role: m.role === 'model' ? 'assistant' : 'user', content: m.parts.map(p => p.text).join('') });
    }
    return result;
}

// ─── Single-shot (non-streaming) ──────────────────────────────────────────────
export async function geminiChat(
    messages: GeminiMessage[],
    systemPrompt?: string,
    maxTokens = 1024,
): Promise<string> {
    const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: maxTokens,
            messages: toOR(messages, systemPrompt),
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `OpenRouter error ${res.status}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
}

// ─── Multimodal chat — supports images + text ─────────────────────────────────
export async function geminiChatMultimodal(
    contentParts: ContentPart[],
    systemPrompt?: string,
    maxTokens = 2000,
): Promise<string> {
    const messages: { role: string; content: ContentPart[] | string }[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: contentParts });

    const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            model: VISION_MODEL,
            max_tokens: maxTokens,
            messages,
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `OpenRouter error ${res.status}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
}

// ─── Streaming multimodal ─────────────────────────────────────────────────────
export async function geminiStreamMultimodal(
    contentParts: ContentPart[],
    systemPrompt: string,
    onChunk: (delta: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    maxTokens = 2000,
): Promise<void> {
    try {
        const messages: { role: string; content: ContentPart[] | string }[] = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: contentParts });

        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
                model: VISION_MODEL,
                max_tokens: maxTokens,
                stream: true,
                messages,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            onError(err?.error?.message || `OpenRouter error ${res.status}`);
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
                } catch {
                    // partial JSON, skip
                }
            }
        }
        onDone();
    } catch (e: any) {
        onError(e?.message ?? 'Unknown error');
    }
}

// ─── Streaming ────────────────────────────────────────────────────────────────
export async function geminiStream(
    messages: GeminiMessage[],
    systemPrompt: string,
    onChunk: (delta: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    maxTokens = 1024,
): Promise<void> {
    try {
        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: maxTokens,
                stream: true,
                messages: toOR(messages, systemPrompt),
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            onError(err?.error?.message || `OpenRouter error ${res.status}`);
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
                } catch {
                    // partial JSON, skip
                }
            }
        }
        onDone();
    } catch (e: any) {
        onError(e?.message ?? 'Unknown error');
    }
}

// ─── Fetch URL content for notes ──────────────────────────────────────────────
export async function fetchUrlContent(url: string): Promise<{ text: string; images: string[] }> {
    try {
        // Use a CORS proxy approach — fetch the page text
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error('Failed to fetch URL');
        const data = await res.json();
        const html = data.contents ?? '';

        // Strip HTML tags to get readable text
        const div = document.createElement('div');
        div.innerHTML = html;
        // Remove scripts, styles, nav, header, footer
        div.querySelectorAll('script,style,nav,header,footer,aside,.nav,.header,.footer,.sidebar').forEach(el => el.remove());
        const text = (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 12000);

        // Extract image src attributes
        const imgMatches = html.match(/src=["'](https?:\/\/[^"']+\.(?:png|jpg|jpeg|gif|webp|svg))[^"']*/gi) ?? [];
        const images = imgMatches
            .map((m: string) => m.replace(/src=["']/, '').replace(/["'].*/, ''))
            .slice(0, 4);

        return { text, images };
    } catch (e) {
        return { text: '', images: [] };
    }
}

// ─── Extract PDF pages as images using canvas ─────────────────────────────────
export async function extractPdfImages(dataUrl: string): Promise<string[]> {
    try {
        // Dynamically load pdf.js if not available
        if (!(window as any).pdfjsLib) {
            await new Promise<void>((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.onload = () => resolve();
                script.onerror = reject;
                document.head.appendChild(script);
            });
            (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        const pdfjsLib = (window as any).pdfjsLib;
        const loadingTask = pdfjsLib.getDocument(dataUrl);
        const pdf = await loadingTask.promise;
        const numPages = Math.min(pdf.numPages, 8); // max 8 pages to avoid huge payloads

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
    } catch (e) {
        console.error('PDF extraction failed:', e);
        return [];
    }
}