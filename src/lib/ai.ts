// LocalStorage-only AI for OpenSource version

export const CANOPYWAVE_API_URL = '/api/ai/chat';

export type ModelType = 'mimo-v2-flash';

export const MODEL_NAMES: Record<ModelType, string> = {
    'mimo-v2-flash': 'MiMo V2 Flash',
};

export const MODEL_IDS: Record<ModelType, string> = {
    'mimo-v2-flash': 'xiaomi/mimo-v2-flash:free',
};

export interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | null | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

// Re-export tool definitions from tools.ts
import { TOOL_DEFINITIONS } from './tools';
export { TOOL_DEFINITIONS as TOOLS } from './tools';

export interface SendMessageOptions {
    userId?: string;
    email?: string;
    enableThinking?: boolean;
}

export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

import { useStore } from '../store';

export async function sendMessage(
    messages: Message[],
    _model: ModelType,
    _apiKey: string,
    onChunk: (content: string | null, toolCalls: ToolCall[] | null, thinking?: string | null) => void,
    signal?: AbortSignal,
    onToolCallStream?: (toolName: string, partialArgs: string, toolCallId: string) => void
): Promise<TokenUsage> {
    try {
        const { aiApiKey, aiModel } = useStore.getState();

        const apiUrl = '/api/ai/chat';
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        // Get API key from env or settings
        const envKey = import.meta.env.VITE_AI_API_KEY;
        const apiKeyToUse = (envKey && envKey !== 'your_api_key_here') ? envKey : aiApiKey;

        if (!apiKeyToUse) {
            throw new Error("Missing API Key. Please set VITE_AI_API_KEY in .env or configure it in Settings.");
        }

        headers['Authorization'] = `Bearer ${apiKeyToUse}`;

        // Use env model or fallback
        const actualModelId = import.meta.env.VITE_AI_MODEL || aiModel || 'gpt-4';

        // Model context limits (approximate)
        const MODEL_CONTEXT_LIMITS: Record<string, number> = {
            'mimo-v2-flash': 128000,
            'gpt-4o': 128000,
            'gpt-4-turbo': 128000,
            'claude-3-opus': 200000,
            'claude-3-sonnet': 200000,
        };

        // Estimate input tokens (~4 chars per token)
        const estimateTokens = (text: string) => Math.ceil(text.length / 4);
        const inputTokens = messages.reduce((acc, msg) => {
            if (typeof msg.content === 'string') return acc + estimateTokens(msg.content);
            if (Array.isArray(msg.content)) {
                return acc + msg.content.reduce((a, p) => a + (p.type === 'text' ? estimateTokens(p.text) : 1000), 0);
            }
            return acc + 100;
        }, 0);

        // Calculate max_tokens dynamically: context_limit - input_tokens - buffer
        const contextLimit = MODEL_CONTEXT_LIMITS[actualModelId] || 128000;
        const safetyBuffer = 1000;
        const maxTokens = Math.min(
            Math.max(contextLimit - inputTokens - safetyBuffer, 4000),
            32000
        );

        console.log(`[AI] Model: ${actualModelId}, Input: ~${inputTokens} tokens`);

        // Build request body with tools
        const requestBody: any = {
            model: actualModelId,
            messages,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            stream: true,
            max_tokens: maxTokens,
        };

        // Create abort controller
        const controller = new AbortController();
        if (signal) {
            signal.addEventListener('abort', () => controller.abort());
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });

        if (!response.ok) {
            // Enhanced Error Handling for 404 on Proxy
            if (response.status === 404 && apiUrl.includes('/api/ai/chat')) {
                throw new Error("Backend Not Found (404). You are likely running in backend-less mode but haven't configured a Custom AI Provider in Settings -> AI.");
            }
            const error = await response.text();
            throw new Error(`API Error: ${response.status} - ${error}`);
        }

        if (!response.body) {
            throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let currentToolCalls: Record<number, ToolCall> = {};
        let buffer = '';
        let thinkingContent = '';
        let totalOutputChars = 0;
        let usage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                // Process any remaining buffer content
                if (buffer.trim()) {
                    const trimmedLine = buffer.trim();
                    if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
                        try {
                            const data = trimmedLine.slice(6);
                            const parsed = JSON.parse(data);
                            if (parsed.choices && parsed.choices.length > 0) {
                                const choice = parsed.choices[0];
                                if (choice.delta?.content) {
                                    onChunk(choice.delta.content, null, null);
                                }
                            }
                        } catch (e) {
                            console.warn('Final buffer parse failed:', buffer);
                        }
                    }
                }
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // Keep the last line in the buffer as it might be incomplete
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                if (trimmedLine === 'data: [DONE]') {
                    continue;
                }

                if (trimmedLine.startsWith('data: ')) {
                    const data = trimmedLine.slice(6);
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices && parsed.choices.length > 0) {
                            const choice = parsed.choices[0];
                            const delta = choice.delta;
                            const finishReason = choice.finish_reason;

                            // Log finish reason and delta for debugging
                            if (finishReason) {
                                console.log(`[AI] Stream finished with reason: ${finishReason}`, delta ? `delta: ${JSON.stringify(delta).slice(0, 100)}` : 'no delta');
                            }

                            // Handle thinking/reasoning content from various APIs
                            const thinkingDelta = delta?.thinking || delta?.reasoning_content || delta?.reasoning;
                            if (thinkingDelta) {
                                thinkingContent += thinkingDelta;
                                onChunk(null, null, thinkingContent);
                            }

                            if (delta?.content) {
                                totalOutputChars += delta.content.length;
                                onChunk(delta.content, null, null);
                            }

                            // Capture usage from stream if available
                            if (parsed.usage) {
                                usage = {
                                    prompt_tokens: parsed.usage.prompt_tokens || 0,
                                    completion_tokens: parsed.usage.completion_tokens || 0,
                                    total_tokens: parsed.usage.total_tokens || 0
                                };
                            }

                            if (delta?.tool_calls) {
                                delta.tool_calls.forEach((tc: any) => {
                                    const index = tc.index ?? 0;
                                    if (!currentToolCalls[index]) {
                                        currentToolCalls[index] = {
                                            id: tc.id || `tool_${index}_${Date.now()}`,
                                            type: 'function',
                                            function: { name: tc.function?.name || '', arguments: '' },
                                        };
                                    }

                                    // Handle tool name - it always comes complete, not in parts
                                    // Just set it if we don't have one yet
                                    if (tc.function?.name && !currentToolCalls[index].function.name) {
                                        currentToolCalls[index].function.name = tc.function.name;
                                    }

                                    if (tc.function?.arguments) {
                                        currentToolCalls[index].function.arguments += tc.function.arguments;
                                    }

                                    // Stream tool call updates (name or args) in real-time
                                    // Always notify regardless of name presence to start UI immediately (using ID as key)
                                    if (onToolCallStream) {
                                        onToolCallStream(
                                            currentToolCalls[index].function.name || '',
                                            currentToolCalls[index].function.arguments || '',
                                            currentToolCalls[index].id
                                        );
                                    }
                                });
                            }

                            // If we have a finish_reason with tool_calls, send them immediately
                            if (finishReason === 'tool_calls' || finishReason === 'stop') {
                                const finalToolCalls = Object.values(currentToolCalls);
                                if (finalToolCalls.length > 0 && finishReason === 'tool_calls') {
                                    console.log(`[AI] Sending ${finalToolCalls.length} tool calls`);
                                    onChunk(null, finalToolCalls);
                                    currentToolCalls = {}; // Reset after sending
                                }
                            }
                        }
                    } catch (e) {
                        // Only log if it's not empty or whitespace
                        if (data.trim()) {
                            console.error('Error parsing chunk:', e, 'Data:', data.substring(0, 200));
                        }
                    }
                }
            }
        }

        // Return any remaining tool calls at the end
        const finalToolCalls = Object.values(currentToolCalls);
        if (finalToolCalls.length > 0) {
            console.log(`[AI] Sending remaining ${finalToolCalls.length} tool calls`);
            onChunk(null, finalToolCalls);
        }

        // If API didn't provide usage, estimate from chars (~4 chars per token)
        if (usage.total_tokens === 0) {
            const estimatedOutput = Math.ceil(totalOutputChars / 4);
            usage = {
                prompt_tokens: inputTokens,
                completion_tokens: estimatedOutput,
                total_tokens: inputTokens + estimatedOutput
            };
        }

        console.log(`[AI] Usage: ${usage.prompt_tokens} in + ${usage.completion_tokens} out = ${usage.total_tokens} total`);
        return usage;

    } catch (error) {
        console.error('Error in sendMessage:', error);
        throw error;
    }
}
