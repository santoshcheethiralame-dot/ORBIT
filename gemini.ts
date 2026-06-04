const API_KEY_STORAGE = 'orbit-openrouter-key';
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function getApiKey(): string {
    try {
        const stored = localStorage.getItem(API_KEY_STORAGE);
        if (stored && stored.trim()) return stored.trim();
    } catch { }
    return '';
}

export function setApiKey(key: string): void {
    try {
        if (key && key.trim()) localStorage.setItem(API_KEY_STORAGE, key.trim());
        else localStorage.removeItem(API_KEY_STORAGE);
    } catch { }
}

export function hasApiKey(): boolean {
    return !!getApiKey();
}

export type TaskComplexity = 'simple' | 'standard' | 'complex' | 'vision';

// Free models, tried IN ORDER. If a provider is down/overloaded ("provider returned
// error") or returns nothing, the next one is tried automatically — different providers
// for resilience. Verified against https://openrouter.ai/api/v1/models (2026-06).
export const FALLBACKS: Record<TaskComplexity, string[]> = {
    simple: ['google/gemma-4-26b-a4b-it:free', 'google/gemma-4-31b-it:free', 'moonshotai/kimi-k2.6:free'],
    standard: ['google/gemma-4-31b-it:free', 'moonshotai/kimi-k2.6:free', 'google/gemma-4-26b-a4b-it:free'],
    complex: ['google/gemma-4-31b-it:free', 'moonshotai/kimi-k2.6:free', 'google/gemma-4-26b-a4b-it:free'],
    vision: ['google/gemma-4-31b-it:free', 'moonshotai/kimi-k2.6:free'],
};

export const MODELS: Record<TaskComplexity, string> = {
    simple: FALLBACKS.simple[0],
    standard: FALLBACKS.standard[0],
    complex: FALLBACKS.complex[0],
    vision: FALLBACKS.vision[0],
};

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
        try { return await fn(); } catch (e: any) {
            lastErr = e;
            const statusMatch = e?.message?.match(/OpenRouter (\d+)/);
            if (statusMatch) {
                const status = parseInt(statusMatch[1], 10);
                if (status === 401 || status === 403 || status === 400) throw e;
            }
            if (i < retries) await new Promise(r => setTimeout(r, 800 * (i + 1)));
        }
    }
    throw lastErr;
}

if (!getApiKey()) {
    console.warn('[Orbit AI] No OpenRouter API key set. Add one in Settings → AI Assistant to enable AI features.');
}

function buildHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`,
        'HTTP-Referer': 'https://orbit.study',
        'X-Title': 'Orbit Study App',
    };
}

export interface AIOptions { temperature?: number; reasoningEffort?: 'low' | 'medium' | 'high'; }

function tuning(options?: AIOptions): Record<string, unknown> {
    return {
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options?.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
    };
}

export async function geminiChat(
    messages: GeminiMessage[],
    systemPrompt?: string,
    maxTokens = 1024,
    complexity: TaskComplexity = 'standard',
    options?: AIOptions,
): Promise<string> {
    const models = FALLBACKS[complexity] ?? [MODELS[complexity]];
    let lastErr: any = new Error('No response');
    for (const model of models) {
        try {
            return await withRetry(async () => {
                const res = await fetch(BASE_URL, {
                    method: 'POST',
                    headers: buildHeaders(),
                    body: JSON.stringify({
                        model,
                        max_tokens: maxTokens,
                        messages: toOR(messages, systemPrompt),
                        ...tuning(options),
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err?.error?.message || `OpenRouter ${res.status}`);
                }
                const data = await res.json();
                if (data?.error) throw new Error(data.error.message || 'Provider returned error');
                const content = data?.choices?.[0]?.message?.content ?? '';
                if (!content) throw new Error('Empty response');
                return content;
            });
        } catch (e) { lastErr = e; }
    }
    throw lastErr;
}

export async function geminiStream(
    messages: GeminiMessage[],
    systemPrompt: string,
    onChunk: (delta: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    maxTokens = 1024,
    complexity: TaskComplexity = 'standard',
    signal?: AbortSignal,
    options?: AIOptions,
): Promise<void> {
    const models = FALLBACKS[complexity] ?? [MODELS[complexity]];
    let lastErr = 'No response';
    let produced = false;
    for (const model of models) {
        try {
            const res = await fetch(BASE_URL, {
                method: 'POST',
                headers: buildHeaders(),
                signal,
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    stream: true,
                    messages: toOR(messages, systemPrompt),
                    ...tuning(options),
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                lastErr = err?.error?.message || `OpenRouter ${res.status}`;
                continue;
            }
            const reader = res.body?.getReader();
            if (!reader) { lastErr = 'No response body'; continue; }
            const decoder = new TextDecoder();
            let buffer = '';
            let streamErr = '';
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
                        if (json?.error) { streamErr = json.error.message || 'Provider returned error'; continue; }
                        const text = json?.choices?.[0]?.delta?.content ?? '';
                        if (text) { produced = true; onChunk(text); }
                    } catch { }
                }
            }
            if (produced) { onDone(); return; }
            lastErr = streamErr || lastErr;
        } catch (e: any) {
            if (e?.name === 'AbortError') return;
            if (produced) { onDone(); return; }
            lastErr = e?.message ?? 'Unknown error';
        }
    }
    onError(lastErr);
}

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
        headers: buildHeaders(),
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
            headers: buildHeaders(),
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
                } catch { }
            }
        }
        onDone();
    } catch (e: any) {
        onError(e?.message ?? 'Unknown error');
    }
}

export async function fetchUrlContent(url: string): Promise<{ text: string; images: string[] }> {
    try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        const html: string = data.contents ?? '';

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('script,style,nav,header,footer,aside,.nav,.header,.footer,.sidebar').forEach(el => el.remove());
        const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 12000);

        const imgMatches = html.match(/src=["'](https?:\/\/[^"']+\.(?:png|jpg|jpeg|gif|webp|svg))[^"']*/gi) ?? [];
        const images = imgMatches
            .map((m: string) => m.replace(/src=["']/, '').replace(/["'].*/, ''))
            .slice(0, 4);

        return { text, images };
    } catch {
        return { text: '', images: [] };
    }
}

export async function fetchUrlText(url: string): Promise<string> {
    const { text } = await fetchUrlContent(url);
    return text;
}

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

export interface AnkiCard {
    front: string;
    back: string;
    tags: string[];
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
        700,
        'standard',
        { temperature: 0.3 },
    );
    try {
        return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
        return [];
    }
}
