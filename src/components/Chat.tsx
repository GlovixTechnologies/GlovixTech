import React, { useState, useRef, useEffect, RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCode, Plus, Image as ImageIcon, X, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { sendMessage, Message, ToolCall } from '../lib/ai';
import { mountFiles } from '../lib/webcontainer';
import { executeTool, ToolContext } from '../lib/tools';
import { BASE_PROJECT_FILES } from '../lib/projectTemplate';
import { saveChatMessages, saveProject, createChat, updateChatTitle } from '../lib/api';
import { ActionsList, StreamingAction } from './ActionsList';
import { MermaidBlock } from './MermaidBlock';
import { ImageViewer } from './ImageViewer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getSystemPrompt } from '../lib/systemPrompts';

// Keep for future use
// const MODELS: ModelType[] = ['glm-4.7'];
// const MODEL_NAMES = { 'glm-4.7': 'GLM 4.7' };

// Attachment interface
interface FileAttachment {
    name: string;
    type: string;
    size: number;
    content?: string; // Store content for transfer to workbench
}

// Helper to group messages for UI
interface MessageGroup {
    role: 'user' | 'assistant';
    content: string | null | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
    thinking?: string;
    thinkingDuration?: number;
    attachments?: FileAttachment[];
    toolCalls?: {
        call: ToolCall;
        result?: string;
    }[];
}

interface ChatProps {
    scrollRef?: RefObject<HTMLDivElement>;
    onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

const getActionDisplayName = (toolName: string, args: string): string => {
    if (!toolName) return 'Preparing...';

    // Helper to decode HTML entities
    const decodeHtml = (text: string): string => {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
    };

    // Helper to extract value from partial JSON string
    const extract = (key: string) => {
        const match = args.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)`));
        return match ? decodeHtml(match[1]) : '';
    };

    try {
        // Try parsing full JSON first
        const parsed = JSON.parse(args);
        switch (toolName) {
            case 'createFile': return parsed.path || '';
            case 'editFile': return parsed.path || '';
            case 'readFile': return parsed.path || '';
            case 'deleteFile': return parsed.path || '';
            case 'renameFile': return parsed.oldPath ? `${parsed.oldPath} → ${parsed.newPath}` : '';
            case 'runCommand': return decodeHtml(parsed.command || '');
            case 'searchWeb': return decodeHtml(parsed.query || '');
            case 'extractPage': return parsed.url || '';
            case 'typeCheck': return 'Workspace';
            case 'listFiles': return 'Workspace';
            default: return '';
        }
    } catch {
        // Fallback for partial JSON streams - extract what we can
        switch (toolName) {
            case 'createFile':
            case 'editFile':
            case 'readFile':
            case 'deleteFile':
                return extract('path');
            case 'renameFile':
                const oldP = extract('oldPath');
                const newP = extract('newPath');
                return oldP ? `${oldP} → ${newP}` : oldP;
            case 'runCommand': return extract('command');
            case 'searchWeb': return extract('query');
            case 'extractPage': return extract('url');
            default: return '';
        }
    }
};

export function Chat({ scrollRef, onScroll }: ChatProps) {
    const navigate = useNavigate();
    const {
        messages, addMessage, setMessages, selectedModel, addTerminalOutput, updateLastMessage,
        user, currentChatId, setCurrentChatId, theme,
        setSelectedFile, setTokenCount, tokenCount, modelContextLimit,
        setSystemPrompt
    } = useStore();

    // Local actions state
    const [actions, setActions] = useState<StreamingAction[]>([]);

    // Action helpers
    const addAction = (toolName: string, displayName: string) => {
        const id = Math.random().toString(36).substring(7);
        setActions(prev => [...prev, {
            id,
            toolName,
            displayName,
            status: 'pending'
        }]);
        return id;
    };



    const updateAction = (id: string, updates: Partial<StreamingAction>) => {
        setActions(prev => prev.map(a =>
            a.id === id ? { ...a, ...updates } : a
        ));
    };

    const isDark = theme === 'dark';
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [currentThinking, setCurrentThinking] = useState<string>('');
    const [thinkingDuration, setThinkingDuration] = useState<number>(0);
    const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
    const [systemPromptTemplate, setSystemPromptTemplate] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Load system prompt locally
    useEffect(() => {
        if (user) {
            const prompt = getSystemPrompt(selectedModel);
            setSystemPromptTemplate(prompt);
            setSystemPrompt(prompt);
        }
    }, [user, selectedModel]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Initialize base project when chat starts
    const projectInitializedRef = useRef<string | null>(null);

    const initializeBaseProject = async () => {
        if (!currentChatId || projectInitializedRef.current === currentChatId) return;

        const state = useStore.getState();
        // Only initialize if no files exist yet
        if (Object.keys(state.files).length === 0) {
            projectInitializedRef.current = currentChatId;

            try {
                // Mount base project files to WebContainer
                await mountFiles(BASE_PROJECT_FILES);

                // Update store with base files
                state.setFiles(BASE_PROJECT_FILES);

                console.log('Base React project initialized');
            } catch (err) {
                console.error('Failed to initialize base project:', err);
            }
        }
    };

    // Load saved messages when opening an existing chat
    useEffect(() => {
        const loadChatMessages = async () => {
            if (currentChatId && user) {
                try {
                    const { getChatMessages } = await import('../lib/api');
                    const data = await getChatMessages(currentChatId);
                    if (data.messages && data.messages.length > 0) {
                        // Only load if we don't have messages already (to avoid overwriting during active chat)
                        if (messages.length === 0) {
                            setMessages(data.messages);
                        }
                    }
                } catch (err) {
                    console.error('Failed to load chat messages:', err);
                }
            }
        };
        loadChatMessages();
    }, [currentChatId, user]);

    // Auto-process first message from HomePage
    const autoProcessedRef = useRef<string | null>(null);
    useEffect(() => {
        // If we have exactly 1 user message and haven't processed it for this chat, trigger submit
        if (
            messages.length === 1 &&
            messages[0].role === 'user' &&
            !isLoading &&
            currentChatId &&
            autoProcessedRef.current !== currentChatId
        ) {
            autoProcessedRef.current = currentChatId;

            // Initialize base project first
            initializeBaseProject().then(() => {
                // Check for documents from HomePage
                const storedDocs = sessionStorage.getItem(`chat_docs_${currentChatId}`);
                let aiMessage = messages[0];

                if (storedDocs) {
                    try {
                        const docs = JSON.parse(storedDocs) as { name: string; content: string; type: string }[];
                        sessionStorage.removeItem(`chat_docs_${currentChatId}`);

                        // Build AI message with full file contents
                        const displayContent = typeof messages[0].content === 'string'
                            ? messages[0].content
                            : (messages[0].content as any[]).find(p => p.type === 'text')?.text || '';

                        // Remove file names from display text to get original input
                        const originalInput = displayContent.split('\n📎')[0].trim();

                        const docsContext = docs.map(doc =>
                            `\n\n[User attached file: ${doc.name}]\n\`\`\`${doc.type.split('/')[1] || 'text'}\n${doc.content}\n\`\`\``
                        ).join('');
                        const aiText = originalInput + docsContext;

                        aiMessage = { role: 'user', content: aiText };
                    } catch (e) {
                        console.error('Error parsing stored docs:', e);
                    }
                }

                // Trigger the AI response with the message (with full docs if any)
                triggerAIResponse(aiMessage, currentChatId);
            });
        }
    }, [messages, currentChatId, isLoading]);

    // Auto-setup template project
    const templateSetupRef = useRef<string | null>(null);
    useEffect(() => {
        if (!currentChatId || isLoading || templateSetupRef.current === currentChatId) return;

        const templateFlag = sessionStorage.getItem(`template_setup_${currentChatId}`);
        if (templateFlag) {
            templateSetupRef.current = currentChatId;
            sessionStorage.removeItem(`template_setup_${currentChatId}`);

            // Add user message for setup
            const setupMessage: Message = {
                role: 'user',
                content: 'Install dependencies and run the project. Show me the preview.'
            };
            addMessage(setupMessage);

            // Trigger AI response
            setTimeout(() => {
                triggerAIResponse(setupMessage, currentChatId);
            }, 100);
        }
    }, [currentChatId, isLoading]);

    // Group messages to combine tool calls with their results and the assistant message that triggered them
    const groupedMessages: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    for (const msg of messages) {
        if (msg.role === 'user') {
            if (currentGroup) groupedMessages.push(currentGroup);
            currentGroup = {
                role: 'user',
                content: msg.content,
                attachments: (msg as any).attachments
            };
        } else if (msg.role === 'assistant') {
            const isMergeable = currentGroup &&
                currentGroup.role === 'assistant';

            if (isMergeable && currentGroup) {
                // Merge content
                if (msg.content) {
                    const newContent = typeof msg.content === 'string' ? msg.content : '';
                    if (currentGroup.content && typeof currentGroup.content === 'string') {
                        currentGroup.content += '\n\n' + newContent;
                    } else if (!currentGroup.content) {
                        currentGroup.content = newContent;
                    }
                }

                // Merge tool calls
                if (msg.tool_calls) {
                    const newCalls = msg.tool_calls.map(tc => ({ call: tc }));
                    if (currentGroup.toolCalls) {
                        currentGroup.toolCalls.push(...newCalls);
                    } else {
                        currentGroup.toolCalls = newCalls;
                    }
                }

                // Keep the existing thinking or update if missing
                if (!currentGroup.thinking && (msg as any).thinking) {
                    currentGroup.thinking = (msg as any).thinking;
                }
                // Keep the existing thinkingDuration or update if missing
                if (!currentGroup.thinkingDuration && (msg as any).thinkingDuration) {
                    currentGroup.thinkingDuration = (msg as any).thinkingDuration;
                }
            } else {
                if (currentGroup) groupedMessages.push(currentGroup);
                currentGroup = {
                    role: 'assistant',
                    content: msg.content,
                    thinking: (msg as any).thinking,
                    thinkingDuration: (msg as any).thinkingDuration,
                    toolCalls: msg.tool_calls?.map(tc => ({ call: tc }))
                };
            }
        } else if (msg.role === 'tool') {
            if (currentGroup && currentGroup.toolCalls) {
                const toolCallIndex = currentGroup.toolCalls.findIndex(tc => tc.call.id === msg.tool_call_id);
                if (toolCallIndex !== -1) {
                    const output = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) || '';
                    currentGroup.toolCalls[toolCallIndex].result = output;

                    // Automatically show generated diagrams in the chat
                    if (output.includes('```mermaid')) {
                        if (currentGroup.content === null) currentGroup.content = '';
                        if (typeof currentGroup.content === 'string') {
                            currentGroup.content += '\n\n' + output;
                        }
                    }

                    // Search results block removed - don't auto-add to content
                }
            }
        }
    }
    if (currentGroup) groupedMessages.push(currentGroup);

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsLoading(false);
            setActions([]);
            setCurrentThinking('');
        }
    };

    // Tool execution context
    const toolContext: ToolContext = {
        addTerminalOutput,
        setSelectedFile
    };

    const handleToolCall = async (toolCall: ToolCall): Promise<string> => {
        const { name, arguments: argsString } = toolCall.function;
        return executeTool(name, argsString, toolContext);
    };

    const [selectedImages, setSelectedImages] = useState<string[]>([]);
    const [selectedDocuments, setSelectedDocuments] = useState<{ name: string; content: string; type: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const documentInputRef = useRef<HTMLInputElement>(null);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setSelectedImages(prev => [...prev, reader.result as string]);
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const handleDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            for (const file of files) {
                try {
                    const content = await readDocumentContent(file);
                    setSelectedDocuments(prev => [...prev, {
                        name: file.name,
                        content,
                        type: file.type || getFileType(file.name)
                    }]);
                } catch (err) {
                    console.error('Error reading file:', err);
                }
            }
        }
    };

    const getFileType = (filename: string): string => {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const typeMap: Record<string, string> = {
            'txt': 'text/plain',
            'md': 'text/markdown',
            'json': 'application/json',
            'js': 'text/javascript',
            'ts': 'text/typescript',
            'tsx': 'text/typescript',
            'jsx': 'text/javascript',
            'css': 'text/css',
            'html': 'text/html',
            'py': 'text/python',
            'java': 'text/java',
            'c': 'text/c',
            'cpp': 'text/cpp',
            'rs': 'text/rust',
            'go': 'text/go',
            'sql': 'text/sql',
            'yaml': 'text/yaml',
            'yml': 'text/yaml',
            'xml': 'text/xml',
            'csv': 'text/csv',
        };
        return typeMap[ext] || 'text/plain';
    };

    const readDocumentContent = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const content = reader.result as string;
                resolve(content);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setSelectedImages(prev => [...prev, reader.result as string]);
                    };
                    reader.readAsDataURL(blob);
                }
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        files.forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setSelectedImages(prev => [...prev, reader.result as string]);
                };
                reader.readAsDataURL(file);
            }
        });
    };

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Core AI processing function
    const triggerAIResponse = async (userMessage: Message, chatIdOverride?: string) => {
        if (isLoading) return;

        setIsLoading(true);
        abortControllerRef.current = new AbortController();

        const chatId = chatIdOverride || currentChatId;

        const apiKey = import.meta.env.VITE_CANOPYWAVE_API_KEY;

        // Get current project files for context
        const currentFiles = useStore.getState().files;
        const fileList = Object.keys(currentFiles).sort().join('\n') ||
            'package.json, vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js, index.html, src/main.tsx, src/App.tsx, src/index.css';

        // Build system prompt from template
        const promptContent = systemPromptTemplate
            ? systemPromptTemplate.replace('{{FILE_LIST}}', fileList)
            : `You are Glovix, an AI web developer. Project files: ${fileList}. Use tools to create/modify files. Run npm install && npm run dev to start.`;

        const SYSTEM_PROMPT: Message = {
            role: 'system',
            content: promptContent
        };

        // Use model context limit from settings (or default to 200k)
        const modelContextLimit = useStore.getState().modelContextLimit || 200000;
        const MAX_CONTEXT_TOKENS = Math.floor(modelContextLimit * 0.8); // Use 80% to leave room for response

        const estimateTokens = (text: string) => Math.ceil(text.length / 4);

        const getMessageTokens = (msg: any) => {
            let tokens = 0;
            if (typeof msg.content === 'string') {
                tokens += estimateTokens(msg.content);
            } else if (Array.isArray(msg.content)) {
                tokens += msg.content.reduce((sum: number, part: any) => {
                    if (part.type === 'text') return sum + estimateTokens(part.text);
                    return sum + 1000; // Rough estimate for images
                }, 0);
            }
            if (msg.tool_calls) {
                tokens += msg.tool_calls.reduce((sum: number, tc: any) =>
                    sum + estimateTokens(tc.function?.name || '') + estimateTokens(tc.function?.arguments || ''), 0);
            }
            return tokens;
        };

        // Get current messages from store (not from hook to ensure freshness)
        const currentStoreMessages = useStore.getState().messages;

        // Filter out invalid messages
        const validMessages = currentStoreMessages.filter((msg) => {
            if (!msg.role || (msg.role !== 'system' && !msg.content && !msg.tool_calls)) {
                console.warn('Skipping invalid message:', msg);
                return false;
            }
            return true;
        });

        let contextMessages = [...validMessages];

        // Count tokens for system prompt
        let totalTokens = estimateTokens(SYSTEM_PROMPT.content as string);

        // Count all existing context messages
        for (let i = 0; i < contextMessages.length; i++) {
            totalTokens += getMessageTokens(contextMessages[i]);
        }

        // Add the new user message tokens
        const userMessageTokens = getMessageTokens(userMessage);
        totalTokens += userMessageTokens;

        // If we're over limit, remove oldest messages until we fit
        while (totalTokens > MAX_CONTEXT_TOKENS && contextMessages.length > 0) {
            const removedMsg = contextMessages.shift();
            if (removedMsg) {
                totalTokens -= getMessageTokens(removedMsg);
                console.log(`[Context] Removed old message, new total: ${totalTokens} tokens`);
            }
        }

        // Update token count display
        setTokenCount(totalTokens);

        // Track total tokens used in this request for billing
        let sessionTokensUsed = 0;

        // Check if userMessage is already the last message in context (to avoid duplication)
        const lastContextMsg = contextMessages[contextMessages.length - 1];
        const isUserMsgAlreadyInContext = lastContextMsg?.role === 'user' &&
            ((typeof lastContextMsg.content === 'string' && typeof userMessage.content === 'string' &&
                lastContextMsg.content === userMessage.content) ||
                (Array.isArray(lastContextMsg.content) && Array.isArray(userMessage.content)));

        let currentMessages = isUserMsgAlreadyInContext
            ? [...contextMessages]
            : [...contextMessages, userMessage];

        // Track files created in this session to detect loops
        const filesCreatedThisSession = new Set<string>();
        let sameFileCreatedCount = 0;

        try {
            // Auto-generate title for new chats (first message only)
            if (currentStoreMessages.length === 1 && user && chatId) {
                const userContentStr = typeof userMessage.content === 'string'
                    ? userMessage.content
                    : (Array.isArray(userMessage.content) ? (userMessage.content.find(c => c.type === 'text') as { type: 'text', text: string } | undefined)?.text || '' : '');

                if (userContentStr) {
                    const titlePrompt: Message = {
                        role: 'system',
                        content: `You are a title generator. Generate a short, clear title (2-5 words) that describes what the user wants to build or do. 

Rules:
- Be specific and descriptive
- Use simple, clear language
- No quotes, no punctuation at the end
- Even if the user's request is unclear, create a reasonable title based on keywords
- Examples: "Todo App", "Landing Page", "Chat Interface", "API Integration"

User request: "${userContentStr.slice(0, 500)}"

Title:`
                    };

                    try {
                        let generatedTitle = '';
                        await sendMessage(
                            [titlePrompt],
                            'mimo-v2-flash',
                            apiKey,
                            (content) => { if (content) generatedTitle += content; },
                            abortControllerRef.current?.signal,


                        );

                        const cleanTitle = generatedTitle.trim().replace(/^["']|["']$/g, '');
                        if (cleanTitle) {
                            await updateChatTitle(chatId, cleanTitle);

                            // Update local store immediately
                            const currentChats = useStore.getState().chats;
                            if (currentChats.length > 0) {
                                const updatedChats = currentChats.map(c =>
                                    c.id === chatId ? { ...c, title: cleanTitle } : c
                                );
                                useStore.getState().setChats(updatedChats);
                            }
                        }
                    } catch (err) {
                        console.error('Failed to generate initial title:', err);
                    }
                }
            }

            let turns = 0;
            const MAX_TURNS = 50;

            // Track which tools we've already shown in the UI during this session
            // Maps toolCallId -> actionId (our local UI id)
            // Moved outside while loop so it persists across turns
            const toolIdToActionId = new Map<string, string>();

            while (turns < MAX_TURNS) {
                if (abortControllerRef.current?.signal.aborted) break;

                // Add placeholder for assistant response
                addMessage({ role: 'assistant', content: '' });

                let assistantMessageContent = '';
                let toolCalls: ToolCall[] = [];

                let thinkingContent = '';
                setCurrentThinking('');
                setThinkingDuration(0);

                let thinkingStartTimeLocal: number | null = null;
                let thinkingEndTime: number | null = null;
                let lastThinkingUpdate: number | null = null;

                // Log turn info (simplified)
                console.log(`[Chat] Turn ${turns + 1}/${MAX_TURNS}, sending ${currentMessages.length} messages to AI`);


                const usage = await sendMessage(
                    [SYSTEM_PROMPT, ...currentMessages],
                    selectedModel,
                    apiKey,
                    (content, tools, thinking) => {
                        if (abortControllerRef.current?.signal.aborted) return;

                        // Handle thinking from AI
                        if (thinking) {
                            // Start timing on first thinking chunk
                            if (!thinkingStartTimeLocal) {
                                thinkingStartTimeLocal = Date.now();
                                setThinkingStartTime(thinkingStartTimeLocal);
                            }

                            // Track last update time
                            lastThinkingUpdate = Date.now();

                            // Clean thinking of artifacts
                            let cleanThinking = thinking.replace(/<\|tool_calls_section_begin\|>[\s\S]*/g, '').trim();
                            thinkingContent = cleanThinking;
                            setCurrentThinking(cleanThinking);

                            // Update message immediately with thinking so it renders in-place
                            // This prevents the "jumping" issue by executing standard rendering logic
                            updateLastMessage(assistantMessageContent, toolCalls.length > 0 ? toolCalls : undefined, cleanThinking, undefined);
                        }

                        if (content) {
                            assistantMessageContent += content;

                            // Clean content of artifacts
                            assistantMessageContent = assistantMessageContent.replace(/<\|tool_calls_section_begin\|>[\s\S]*/g, '');

                            // CHECK FOR THINKING TAGS (for models that output <think> inside content)
                            const hasThinkStart = assistantMessageContent.includes('<think>');
                            const hasThinkEnd = assistantMessageContent.includes('</think>');

                            // If we just started a <think> block inside content, START the timer if not running
                            if (hasThinkStart && !hasThinkEnd && !thinkingStartTimeLocal) {
                                thinkingStartTimeLocal = Date.now();
                                setThinkingStartTime(thinkingStartTimeLocal);
                            }

                            // If we hit the end of thinking, STOP the timer
                            if (hasThinkEnd && thinkingStartTimeLocal && !thinkingEndTime) {
                                thinkingEndTime = Date.now();
                                const duration = Math.round((thinkingEndTime - thinkingStartTimeLocal) / 1000);
                                setThinkingDuration(Math.max(1, duration));
                                setThinkingStartTime(null); // Stop live timer logic
                            }

                            // If we have content but NO thinking tags and NO native thinking start, ensure timer is off
                            // (This handles the case where we transition from native thinking to content)
                            if (!hasThinkStart && thinkingStartTimeLocal && !thinkingEndTime && !thinking) {
                                // We were thinking (natively), but now we got content. Stop timer.
                                thinkingEndTime = lastThinkingUpdate || Date.now();
                                const duration = Math.round((thinkingEndTime - thinkingStartTimeLocal) / 1000);
                                setThinkingDuration(Math.max(1, duration));
                                setThinkingStartTime(null);
                            }

                            // Parse thinking - model outputs thinking then </think> then actual response
                            if (hasThinkEnd) {
                                const parts = assistantMessageContent.split('</think>');
                                const thinkingPart = parts[0].replace('<think>', '').trim();
                                let responsePart = parts.slice(1).join('</think>').trim();

                                // Clean tool_call tags from response
                                responsePart = responsePart.replace(/<tool_call>/g, '').trim();

                                if (thinkingPart) {
                                    thinkingContent = thinkingPart;
                                    setCurrentThinking(thinkingPart);
                                    // Final duration available here
                                    const confirmedDuration = thinkingEndTime
                                        ? Math.round((thinkingEndTime - thinkingStartTimeLocal!) / 1000)
                                        : (thinkingDuration || undefined);

                                    updateLastMessage(responsePart, toolCalls.length > 0 ? toolCalls : undefined, thinkingContent, confirmedDuration);
                                } else {
                                    updateLastMessage(responsePart, toolCalls.length > 0 ? toolCalls : undefined, undefined, undefined);
                                }
                            }
                            // Still in think block?
                            else if (hasThinkStart) {
                                const thinking = assistantMessageContent.replace('<think>', '').trim();
                                thinkingContent = thinking;
                                setCurrentThinking(thinking);

                                // Show EMPTY content for message, but update thinking
                                updateLastMessage('', toolCalls.length > 0 ? toolCalls : undefined, thinking, undefined);
                            }
                            // Normal content
                            else {
                                updateLastMessage(assistantMessageContent, toolCalls.length > 0 ? toolCalls : undefined, thinkingContent || undefined, thinkingDuration || undefined);
                            }
                        } else if (tools) {
                            toolCalls = tools;
                            // Ensure all tools are in the UI (some may have been added via streaming already)
                            tools.forEach(tc => {
                                if (!toolIdToActionId.has(tc.id)) {
                                    const displayName = getActionDisplayName(tc.function.name, tc.function.arguments || '');
                                    const id = addAction(tc.function.name, displayName);
                                    toolIdToActionId.set(tc.id, id);
                                    updateAction(id, { status: 'running' });
                                }
                            });

                            updateLastMessage(assistantMessageContent, toolCalls, thinkingContent, thinkingEndTime ? Math.max(1, Math.round((thinkingEndTime - thinkingStartTimeLocal!) / 1000)) : undefined);
                        }
                    },
                    abortControllerRef.current?.signal,
                    (toolName, args, toolId) => {
                        // STREAMING TOOLS CALLBACK - called for each chunk of a tool call
                        if (!toolId) return;

                        if (!toolIdToActionId.has(toolId)) {
                            // New tool detected - add to UI immediately
                            const displayName = getActionDisplayName(toolName, args);
                            const id = addAction(toolName || 'Processing...', displayName);
                            toolIdToActionId.set(toolId, id);
                            updateAction(id, { status: 'running' });
                        } else {
                            // Update existing tool with new info
                            const actionId = toolIdToActionId.get(toolId)!;
                            const displayName = getActionDisplayName(toolName, args);
                            updateAction(actionId, { displayName, toolName: toolName || undefined });
                        }
                    }
                );

                // Final update after stream finishes
                if (thinkingContent) {
                    // Ensure duration is set
                    const finalDuration = thinkingDuration || (thinkingStartTimeLocal ? Math.max(1, Math.round((Date.now() - thinkingStartTimeLocal) / 1000)) : undefined);
                    updateLastMessage(assistantMessageContent, toolCalls.length > 0 ? toolCalls : undefined, thinkingContent, finalDuration);
                }

                setThinkingStartTime(null);

                if (abortControllerRef.current?.signal.aborted) break;

                // Add tokens from this turn to session total
                sessionTokensUsed += usage.total_tokens;

                // Update UI token count
                setTokenCount(sessionTokensUsed);

                // Save tokens to DB immediately
                // Token usage tracking (local only)
                if (user?.uid && usage.total_tokens > 0) {
                    console.log(`[Chat] Tokens: ${usage.prompt_tokens} in + ${usage.completion_tokens} out = ${usage.total_tokens}`);
                }

                // Clean content from think tags for display, but keep thinking for context
                let cleanContent = assistantMessageContent;
                if (cleanContent.includes('</think>')) {
                    cleanContent = cleanContent.split('</think>').slice(1).join('</think>').trim();
                }
                cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();

                // Clean tool_call tags that some models output incorrectly
                cleanContent = cleanContent.replace(/<tool_call>/g, '').trim();

                const assistantMessage: Message = {
                    role: 'assistant',
                    content: cleanContent || null,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
                } as any;

                // Store thinking - AI should see its own reasoning for continuity
                if (thinkingContent) {
                    (assistantMessage as any).thinking = thinkingContent;
                }

                // Store thinking separately (not sent to API but shown in UI)
                if (thinkingContent) {
                    (assistantMessage as any).thinking = thinkingContent;
                }

                // Message is already in store via updateLastMessage, just add to context
                currentMessages.push(assistantMessage);

                if (toolCalls.length === 0) {
                    // No tool calls - AI is done or just responded with text
                    console.log('[Chat] AI response (no tool calls):', cleanContent?.slice(0, 200));
                    console.log('[Chat] Done - no tool calls received');
                    break;
                }

                console.log(`[Chat] Running ${toolCalls.length} tool(s)...`);
                let devServerStarted = false;

                for (let i = 0; i < toolCalls.length; i++) {
                    const toolCall = toolCalls[i];
                    if (abortControllerRef.current?.signal.aborted) break;

                    // Ensure action exists for this tool call
                    if (!toolIdToActionId.has(toolCall.id)) {
                        const displayName = getActionDisplayName(toolCall.function.name, toolCall.function.arguments || '');
                        const id = addAction(toolCall.function.name, displayName);
                        toolIdToActionId.set(toolCall.id, id);
                    }

                    // Get action ID by tool call ID (reliable mapping)
                    const actionId = toolIdToActionId.get(toolCall.id);

                    // Set THIS action to 'running' and yield so React paints it
                    if (actionId) {
                        updateAction(actionId, { status: 'running' });
                    }
                    await new Promise(r => requestAnimationFrame(r));

                    // Check for duplicate file creation (loop detection)
                    if (toolCall.function.name === 'createFile') {
                        try {
                            const args = JSON.parse(toolCall.function.arguments || '{}');
                            if (args.path && filesCreatedThisSession.has(args.path)) {
                                sameFileCreatedCount++;
                                console.log(`[Chat] Warning: ${args.path} already created this session (count: ${sameFileCreatedCount})`);
                                if (sameFileCreatedCount >= 5) {
                                    console.log('[Chat] Loop detected - same file created multiple times, breaking');
                                    devServerStarted = true;
                                    break;
                                }
                            }
                            filesCreatedThisSession.add(args.path);
                        } catch { }
                    }

                    let result = '';
                    try {
                        result = await handleToolCall(toolCall);
                    } catch (err: any) {
                        console.error('Tool execution error:', err);
                        result = `Error executing tool ${toolCall.function.name}: ${err.message}`;
                    }

                    // Update action status to done or error
                    if (actionId) {
                        const newStatus = result.startsWith('Error') ? 'error' : 'done';
                        console.log(`[Actions] Updating ${toolCall.function.name} (${actionId}) to ${newStatus}`);
                        updateAction(actionId, {
                            status: newStatus,
                            result
                        });
                    } else {
                        console.warn(`[Actions] No actionId found for toolCall ${toolCall.id}`);
                    }

                    const toolMessage: Message = {
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: result
                    };

                    addMessage(toolMessage);
                    currentMessages.push(toolMessage);

                    // Check if dev server was started
                    if (result.includes('DEV SERVER IS NOW RUNNING')) {
                        devServerStarted = true;
                    }
                }

                // If dev server started, break the loop - task is complete
                if (devServerStarted) {
                    console.log('[Chat] Dev server started, ending AI loop');

                    // Add a final message so user knows the project is ready
                    addMessage({
                        role: 'assistant',
                        content: '✅ **Project is ready!** The development server is now running. You can see the preview on the right side, or click the preview tab to view your application.'
                    });

                    break;
                }
                turns++;
            }

            // Smart AI-powered context compression
            const allMessages = useStore.getState().messages;

            let totalTokens = estimateTokens(SYSTEM_PROMPT.content as string);
            allMessages.forEach(msg => {
                totalTokens += getMessageTokens(msg);
            });

            const modelContextLimit = useStore.getState().modelContextLimit || 200000;
            const MAX_CONTEXT_TOKENS = Math.floor(modelContextLimit * 0.8);
            const COMPRESSION_THRESHOLD = Math.floor(MAX_CONTEXT_TOKENS * 0.8); // 80% of limit

            // Check if we need compression
            if (totalTokens > COMPRESSION_THRESHOLD && allMessages.length > 10) {
                console.log(`[Context] Tokens: ${totalTokens}/${MAX_CONTEXT_TOKENS}, triggering AI compression...`);

                try {
                    // How many messages to keep uncompressed (recent context)
                    const KEEP_RECENT = 8;
                    const messagesToCompress = allMessages.slice(0, -KEEP_RECENT);
                    const recentMessages = allMessages.slice(-KEEP_RECENT);


                    // Create a simple summary (AI summarization would require recursive call)
                    const firstUserMsg = messagesToCompress.find(m => m.role === 'user');
                    const summary = `Previous conversation: ${firstUserMsg ? (typeof firstUserMsg.content === 'string' ? firstUserMsg.content.substring(0, 100) : 'User started conversation') : 'Earlier messages'}... (${messagesToCompress.length} messages compressed to save context)`;

                    // Create summary message
                    const summaryMessage: Message = {
                        role: 'system',
                        content: `📝 ${summary}`
                    };

                    // Replace old messages with summary + keep recent
                    const compressedContext = [summaryMessage, ...recentMessages];
                    setMessages(compressedContext);

                    // Recalculate tokens
                    let newTotal = estimateTokens(SYSTEM_PROMPT.content as string);
                    compressedContext.forEach(msg => {
                        newTotal += getMessageTokens(msg);
                    });

                    setTokenCount(newTotal);

                    // Show notification
                    const compressionNotice: Message = {
                        role: 'assistant',
                        content: `🗜️ Context compressed by AI: ${messagesToCompress.length} old messages summarized. Freed ${totalTokens - newTotal} tokens. Current: ${newTotal.toLocaleString()}/${MAX_CONTEXT_TOKENS.toLocaleString()}`
                    };
                    addMessage(compressionNotice);

                    console.log(`[Context] Compressed ${messagesToCompress.length} messages, saved ${totalTokens - newTotal} tokens`);
                } catch (err) {
                    console.error('[Context] AI compression failed, falling back to simple removal:', err);

                    // Fallback: simple removal of oldest messages
                    let compressedMessages = [...allMessages];
                    let removedCount = 0;

                    while (totalTokens > MAX_CONTEXT_TOKENS && compressedMessages.length > 5) {
                        const removed = compressedMessages.shift();
                        if (removed) {
                            totalTokens -= getMessageTokens(removed);
                            removedCount++;
                        }
                    }

                    if (removedCount > 0) {
                        setMessages(compressedMessages);
                        setTokenCount(totalTokens);

                        const fallbackNotice: Message = {
                            role: 'assistant',
                            content: `🗜️ Context compressed: ${removedCount} old messages removed. Current: ${totalTokens.toLocaleString()}/${MAX_CONTEXT_TOKENS.toLocaleString()}`
                        };
                        addMessage(fallbackNotice);
                    }
                }
            } else {
                // Just update the token count
                setTokenCount(totalTokens);
            }

        } catch (error: any) {
            if (abortControllerRef.current?.signal.aborted) {
                // When stopped, check if last message has incomplete tool_calls
                const state = useStore.getState();
                const lastMsg = state.messages[state.messages.length - 1] as any;

                if (lastMsg?.role === 'assistant' && lastMsg?.tool_calls?.length > 0) {
                    // Add placeholder tool responses for incomplete tool calls
                    for (const tc of lastMsg.tool_calls) {
                        // Check if tool response already exists
                        const hasResponse = state.messages.some(
                            (m: any) => m.role === 'tool' && m.tool_call_id === tc.id
                        );
                        if (!hasResponse) {
                            addMessage({
                                role: 'tool',
                                tool_call_id: tc.id,
                                name: tc.function.name,
                                content: '[Stopped by user]'
                            });
                        }
                    }
                }
                addMessage({ role: 'assistant', content: 'Stopped by user.' });
            } else {
                console.error(error);
                const errorMessage = error?.message || 'Failed to get response';

                // Same check for errors
                const state = useStore.getState();
                const lastMsg = state.messages[state.messages.length - 1] as any;

                if (lastMsg?.role === 'assistant' && lastMsg?.tool_calls?.length > 0) {
                    for (const tc of lastMsg.tool_calls) {
                        const hasResponse = state.messages.some(
                            (m: any) => m.role === 'tool' && m.tool_call_id === tc.id
                        );
                        if (!hasResponse) {
                            addMessage({
                                role: 'tool',
                                tool_call_id: tc.id,
                                name: tc.function.name,
                                content: `[Error: ${errorMessage}]`
                            });
                        }
                    }
                }
                addMessage({ role: 'assistant', content: `Error: ${errorMessage}` });
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
            setCurrentThinking('');

            // Clear actions after a delay to allow smooth transition to completed state
            setTimeout(() => setActions([]), 500);

            if (chatId && user) {
                try {
                    const { useStore } = await import('../store');
                    const state = useStore.getState();

                    await saveChatMessages(chatId, state.messages);

                    if (Object.keys(state.files).length > 0) {
                        await saveProject(chatId, user.uid, state.files);
                    }


                } catch {
                    // Ignore save errors
                }
            }
        }
    };

    // Form submit handler
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!input.trim() && selectedImages.length === 0 && selectedDocuments.length === 0) || isLoading) return;

        // Create chat if not exists
        let chatId = currentChatId;
        if (!chatId && user) {
            try {
                const title = input.slice(0, 50) + (input.length > 50 ? '...' : '');
                const chat = await createChat(user.uid, title);
                chatId = chat.id;
                setCurrentChatId(chat.id);
                navigate(`/c/${chat.id}`, { replace: true });
            } catch (err) {
                console.error('Failed to create chat:', err);
                return;
            }
        }

        // Build AI message (what AI receives) - full file contents
        let aiText = input;
        if (selectedDocuments.length > 0) {
            const docsContext = selectedDocuments.map(doc =>
                `\n\n[User attached file: ${doc.name}]\n\`\`\`${doc.type.split('/')[1] || 'text'}\n${doc.content}\n\`\`\``
            ).join('');
            aiText = input + docsContext;
        }

        // Message for display (stored in state) - just user text, attachments stored separately
        let displayMessage: any;
        if (selectedImages.length > 0) {
            displayMessage = {
                role: 'user',
                content: [
                    { type: 'text', text: input },
                    ...selectedImages.map(img => ({ type: 'image_url' as const, image_url: { url: img } }))
                ]
            };
        } else {
            displayMessage = { role: 'user', content: input };
        }

        // Add attachments with content to display message (for transfer to workbench)
        if (selectedDocuments.length > 0) {
            displayMessage.attachments = selectedDocuments.map(doc => ({
                name: doc.name,
                type: doc.type,
                size: doc.content.length,
                content: doc.content
            }));
        }

        // Message for AI (with full file contents)
        let aiMessage: Message;
        if (selectedImages.length > 0) {
            aiMessage = {
                role: 'user',
                content: [
                    { type: 'text', text: aiText },
                    ...selectedImages.map(img => ({ type: 'image_url' as const, image_url: { url: img } }))
                ]
            };
        } else {
            aiMessage = { role: 'user', content: aiText };
        }

        addMessage(displayMessage);
        setInput('');
        setSelectedImages([]);
        setSelectedDocuments([]);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Send AI message (with full file contents) to AI
        await triggerAIResponse(aiMessage, chatId || undefined);
    };

    const [showModelMenu, setShowModelMenu] = useState(false);

    const markdownComponents = React.useMemo(() => ({
        code({ node, inline, className, children, ...props }: any) {
            const match = /language-([\w-]+)/.exec(className || '');
            if (!inline && match && match[1] === 'mermaid') {
                return <MermaidBlock code={String(children).replace(/\n$/, '')} isDark={isDark} />;
            }
            // Search results block removed - don't render it
            if (!inline && match && match[1] === 'search-results') {
                return null;
            }
            return <code className={className} {...props}>{children}</code>;
        },
        img({ src, alt, ...props }: any) {
            // Use ImageViewer for fullscreen capability
            if (src) {
                return <ImageViewer src={src} alt={alt} isDark={isDark} />;
            }
            return <img src={src} alt={alt} {...props} />;
        }
    }), [isDark]);

    return (
        <div className={`flex flex-col h-full ${isDark ? 'bg-[#141414]' : 'bg-white'}`}>
            {/* Messages Area */}
            <div
                ref={scrollRef}
                onScroll={onScroll}
                className="flex-1 overflow-y-auto scrollbar-hide"
            >
                <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
                    {groupedMessages.map((group, idx) => (
                        <div key={idx} className="space-y-3 animate-fade-in-up">
                            {group.role === 'assistant' && group.thinking && (
                                <ThinkingBlock
                                    thinking={group.thinking}
                                    isDark={isDark}
                                    thinkingTime={group.thinkingDuration || undefined}
                                    startTime={idx === groupedMessages.length - 1 && isLoading ? thinkingStartTime : undefined}
                                />
                            )}

                            {group.role === 'user' && group.attachments && group.attachments.length > 0 && (
                                <div className="flex justify-end mb-1">
                                    <div className="flex flex-col gap-1.5">
                                        {group.attachments.map((file, i) => (
                                            <FileAttachmentBlock key={i} file={file} isDark={isDark} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={`flex ${group.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`text-[14px] leading-relaxed ${group.role === 'user'
                                        ? isDark ? 'bg-[#1f1f1f] text-[#e5e5e5] rounded-2xl px-4 py-2.5 max-w-[85%]' : 'bg-gray-100 text-gray-900 rounded-2xl px-4 py-2.5 max-w-[85%]'
                                        : isDark ? 'text-[#e5e5e5] max-w-full' : 'text-gray-800 max-w-full'
                                        }`}
                                >
                                    {group.content && (
                                        <div className={`prose prose-sm max-w-none ${isDark ? 'prose-invert prose-pre:bg-[#1a1a1a] prose-pre:border prose-pre:border-[#2a2a2a] prose-pre:rounded-lg prose-code:text-[#e5e5e5]' : 'prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:rounded-lg'}`}>
                                            {Array.isArray(group.content) ? (
                                                <div className="space-y-2">
                                                    {group.content.map((part, i) => {
                                                        if (part.type === 'image_url') {
                                                            return (
                                                                <img key={i} src={part.image_url.url} alt="" className="max-w-full rounded-lg max-h-[250px] object-contain" />
                                                            );
                                                        }
                                                        return <ReactMarkdown
                                                            key={i}
                                                            remarkPlugins={[remarkGfm]}
                                                            components={markdownComponents}
                                                        >
                                                            {part.text.replace(/^\[SYSTEM\] .*/gm, '')}
                                                        </ReactMarkdown>;
                                                    })}
                                                </div>
                                            ) : (
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={markdownComponents}
                                                >
                                                    {group.content.replace(/^\[SYSTEM\] .*/gm, '')}
                                                </ReactMarkdown>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions AFTER text content */}
                            {group.role === 'assistant' && (
                                <>
                                    {isLoading && idx === groupedMessages.length - 1 && actions.length > 0 ? (
                                        <ActionsList actions={actions.filter(a => a.toolName !== 'drawDiagram')} isLive={true} isDark={isDark} />
                                    ) : (
                                        group.toolCalls && group.toolCalls.length > 0 && (
                                            <ActionsList
                                                actions={group.toolCalls.filter(tc => tc.call.function.name !== 'drawDiagram').map((tc, i) => ({
                                                    id: `completed_${idx}_${i}`,
                                                    toolName: tc.call.function.name,
                                                    displayName: getActionDisplayName(tc.call.function.name, tc.call.function.arguments || ''),
                                                    status: tc.result?.startsWith('Error') ? 'error' as const : 'done' as const
                                                }))}
                                                isDark={isDark}
                                            />
                                        )
                                    )}
                                </>
                            )}
                        </div>
                    ))}

                    {/* Live Thinking - only when there's no assistant message yet or its thinking isn't set */}
                    {isLoading && currentThinking && (!groupedMessages.length || groupedMessages[groupedMessages.length - 1].role !== 'assistant' || !groupedMessages[groupedMessages.length - 1].thinking) && (
                        <ThinkingBlock thinking={currentThinking} isDark={isDark} thinkingTime={thinkingDuration || undefined} startTime={thinkingStartTime} />
                    )}

                    {/* Live Actions - only show here if there's no assistant message group yet */}
                    {isLoading && actions.length > 0 && (!groupedMessages.length || groupedMessages[groupedMessages.length - 1].role !== 'assistant') && (
                        <ActionsList actions={actions.filter(a => a.toolName !== 'drawDiagram')} isLive={true} isDark={isDark} />
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area - centered with margins */}
            <div className="px-4 pb-4">
                <div className={`max-w-[720px] mx-auto rounded-2xl ${isDark ? 'bg-[#1a1a1a] border border-[#2a2a2a]' : 'bg-gray-50 border border-gray-200'}`}>
                    <form
                        onSubmit={handleSubmit}
                        onPaste={handlePaste}
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        className="flex flex-col"
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            multiple
                            onChange={handleImageSelect}
                        />
                        <input
                            type="file"
                            ref={documentInputRef}
                            className="hidden"
                            accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.css,.html,.py,.java,.c,.cpp,.rs,.go,.sql,.yaml,.yml,.xml,.csv,.log,.sh,.bat,.env,.gitignore"
                            multiple
                            onChange={handleDocumentSelect}
                        />

                        {(selectedImages.length > 0 || selectedDocuments.length > 0) && (
                            <div className={`flex gap-2 px-3 py-2 overflow-x-auto border-b ${isDark ? 'border-[#2a2a2a]' : 'border-gray-200'}`}>
                                {selectedImages.map((img, i) => (
                                    <div key={`img-${i}`} className="relative flex-shrink-0 group">
                                        <img src={img} alt="" className="h-10 w-10 object-cover rounded-lg" />
                                        <button type="button" onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </div>
                                ))}
                                {selectedDocuments.map((doc, i) => (
                                    <div key={`doc-${i}`} className={`relative flex-shrink-0 group h-10 px-2 rounded-lg flex items-center gap-1.5 ${isDark ? 'bg-[#1f1f1f]' : 'bg-gray-100'}`}>
                                        <FileCode className="w-3.5 h-3.5 text-[#555]" />
                                        <span className={`text-[11px] truncate max-w-[60px] ${isDark ? 'text-[#999]' : 'text-gray-600'}`}>{doc.name}</span>
                                        <button type="button" onClick={() => setSelectedDocuments(prev => prev.filter((_, idx) => idx !== i))}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Textarea area */}
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                // Auto-resize
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = `${Math.min(target.scrollHeight, 250)}px`;
                            }}
                            placeholder="How can Glovix help you today?"
                            className={`w-full bg-transparent text-[13px] px-4 pt-4 pb-2 focus:outline-none resize-none overflow-y-auto ${isDark ? 'text-[#e5e5e5] placeholder:text-[#555]' : 'text-gray-900 placeholder:text-gray-400'}`}
                            style={{ height: 'auto', minHeight: '44px', maxHeight: '250px' }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                        />

                        {/* Bottom toolbar - separate from textarea */}
                        <div className="flex items-center justify-between px-3 py-2">
                            <div className="flex items-center gap-1.5 relative">
                                <button type="button" onClick={() => setShowModelMenu(!showModelMenu)}
                                    className={`p-1.5 rounded-md transition-colors ${isDark ? 'text-[#444] hover:text-[#888] hover:bg-[#1f1f1f]' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                                    <Plus className="w-4 h-4" />
                                </button>

                                {showModelMenu && (
                                    <div className={`absolute bottom-full left-0 mb-1 rounded-lg overflow-hidden z-10 min-w-[160px] ${isDark ? 'bg-[#1a1a1a] border border-[#2a2a2a]' : 'bg-white border border-gray-200 shadow-lg'}`}>
                                        <div className="p-1">
                                            <button type="button" onClick={() => { fileInputRef.current?.click(); setShowModelMenu(false); }}
                                                className={`w-full text-left px-2.5 py-1.5 text-[12px] flex items-center gap-2 rounded ${isDark ? 'hover:bg-[#1f1f1f] text-[#ccc]' : 'hover:bg-gray-50 text-gray-700'}`}>
                                                <ImageIcon className="w-3.5 h-3.5" /> Image
                                            </button>
                                            <button type="button" onClick={() => { documentInputRef.current?.click(); setShowModelMenu(false); }}
                                                className={`w-full text-left px-2.5 py-1.5 text-[12px] flex items-center gap-2 rounded ${isDark ? 'hover:bg-[#1f1f1f] text-[#ccc]' : 'hover:bg-gray-50 text-gray-700'}`}>
                                                <FileCode className="w-3.5 h-3.5" /> Document
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Context indicator button */}
                                <div className="relative group">
                                    <button
                                        type="button"
                                        className={`p-1.5 rounded-md transition-colors ${isDark ? 'text-[#444] hover:text-[#888] hover:bg-[#1f1f1f]' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                        </svg>
                                    </button>

                                    {/* Tooltip on hover */}
                                    <div className={`absolute bottom-full left-0 mb-2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20`}>
                                        <div className={`px-3 py-2 rounded-lg shadow-lg whitespace-nowrap ${isDark ? 'bg-[#1a1a1a] border border-[#2a2a2a]' : 'bg-white border border-gray-200'}`}>
                                            <div className={`text-xs mb-1.5 ${isDark ? 'text-[#888]' : 'text-gray-500'}`}>Context Usage</div>
                                            <div className="flex items-center gap-2">
                                                <div className="relative w-24 h-1.5 bg-gray-200 dark:bg-[#2a2a2a] rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all ${(tokenCount / (modelContextLimit * 0.8)) > 0.9
                                                            ? 'bg-red-500'
                                                            : (tokenCount / (modelContextLimit * 0.8)) > 0.7
                                                                ? 'bg-yellow-500'
                                                                : 'bg-green-500'
                                                            }`}
                                                        style={{ width: `${Math.min(100, (tokenCount / (modelContextLimit * 0.8)) * 100)}%` }}
                                                    />
                                                </div>
                                                <span className={`text-xs tabular-nums font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                    {tokenCount.toLocaleString()} / {Math.floor(modelContextLimit * 0.8).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {isLoading ? (
                                    <button
                                        type="button"
                                        onClick={handleStop}
                                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isDark ? 'bg-white hover:bg-gray-200' : 'bg-black hover:bg-gray-800'}`}
                                    >
                                        <div className={`w-3 h-3 rounded-sm ${isDark ? 'bg-black' : 'bg-white'}`} />
                                    </button>
                                ) : (
                                    <button type="submit" disabled={!input.trim() && selectedImages.length === 0}
                                        className={`w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-all ${isDark ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'}`}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

function ThinkingBlock({ thinking, isDark, thinkingTime, startTime }: { thinking: string; isDark: boolean; thinkingTime?: number, startTime?: number | null }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (startTime && !thinkingTime) {
            // Initial calc
            setElapsed(Math.max(1, Math.round((Date.now() - startTime) / 1000)));

            const interval = setInterval(() => {
                setElapsed(Math.max(1, Math.round((Date.now() - startTime) / 1000)));
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [startTime, thinkingTime]);

    if (!thinking) return null;

    // Use finalized time if available, otherwise live elapsed time
    const displayTime = thinkingTime !== undefined ? thinkingTime : (startTime ? elapsed : 0);

    return (
        <div className="mb-2 animate-fade-in">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`flex items-center gap-1.5 text-sm transition-colors ${isDark ? 'text-[#666] hover:text-[#888]' : 'text-gray-400 hover:text-gray-600'}`}
            >
                <span>Thought for {displayTime}s</span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>

            {isExpanded && (
                <div className={`mt-2 text-sm leading-relaxed whitespace-pre-wrap animate-fade-in ${isDark ? 'text-[#555]' : 'text-gray-400'}`}>
                    {thinking}
                </div>
            )}
        </div>
    );
}

function FileAttachmentBlock({ file, isDark }: { file: FileAttachment; isDark: boolean }) {
    const [showMenu, setShowMenu] = useState(false);
    const { setFiles, files, setSelectedFile } = useStore();

    const handleAddToWorkbench = () => {
        if (file.content) {
            setFiles({ ...files, [file.name]: { file: { contents: file.content } } });
            setSelectedFile(file.name);
            setShowMenu(false);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setShowMenu(!showMenu)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${isDark ? 'bg-[#1a1a1a] hover:bg-[#1f1f1f]' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
                <FileCode className={`w-4 h-4 ${isDark ? 'text-[#666]' : 'text-gray-400'}`} />
                <span className={`text-sm ${isDark ? 'text-[#ccc]' : 'text-gray-700'}`}>{file.name}</span>
            </button>

            {showMenu && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className={`absolute top-full left-0 mt-1 rounded-lg overflow-hidden z-20 min-w-[160px] ${isDark ? 'bg-[#1a1a1a] border border-[#2a2a2a]' : 'bg-white border border-gray-200 shadow-lg'}`}>
                        <button
                            onClick={handleAddToWorkbench}
                            disabled={!file.content}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${isDark ? 'hover:bg-[#1f1f1f] text-[#ccc]' : 'hover:bg-gray-50 text-gray-700'} disabled:opacity-50`}
                        >
                            <FileCode className="w-4 h-4" />
                            Add to Workbench
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
