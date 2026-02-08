import { create } from 'zustand';
import { Message, ModelType } from '../lib/ai';
import { User } from '../lib/auth';
import { UserTokens, ChatHistory } from '../lib/api';

interface FileSystem {
    [key: string]: {
        file: {
            contents: string;
        };
    };
}

interface AppState {
    // Auth
    user: User | null;
    userTokens: UserTokens | null; // User's monthly token limits

    // Chat
    currentChatId: string | null;
    messages: Message[];
    tokenCount: number; // Token count for current chat

    // Files
    files: FileSystem;
    selectedFile: string | null;

    // Terminal & Preview
    terminalOutput: string[];
    previewUrl: string | null;

    // Settings
    selectedModel: ModelType;
    isDeploying: boolean;
    theme: 'dark' | 'light';
    showTokenCounter: boolean;

    // Auth actions
    setUser: (user: User | null) => void;
    setUserTokens: (tokens: UserTokens | null) => void;

    // Chat actions
    setCurrentChatId: (id: string | null) => void;
    setMessages: (messages: Message[]) => void;
    addMessage: (message: Message) => void;
    updateLastMessage: (content: string, toolCalls?: any[], thinking?: string, thinkingDuration?: number) => void;
    setTokenCount: (count: number) => void;

    // File actions
    setFiles: (files: FileSystem) => void;
    setSelectedFile: (file: string | null) => void;

    // Terminal actions
    addTerminalOutput: (output: string) => void;
    clearTerminalOutput: () => void;

    // Other actions
    setPreviewUrl: (url: string | null) => void;
    setIsDeploying: (isDeploying: boolean) => void;
    setSelectedModel: (model: ModelType) => void;
    setTheme: (theme: 'dark' | 'light') => void;
    setShowTokenCounter: (show: boolean) => void;
    // Chats
    chats: ChatHistory[];
    setChats: (chats: ChatHistory[]) => void;
    // System Prompt
    systemPrompt: string | null;
    setSystemPrompt: (prompt: string) => void;

    // AI Provider Settings
    aiProvider: string;
    aiApiKey: string;
    aiBaseUrl: string;
    aiModel: string;

    setAiProvider: (provider: string) => void;
    setAiApiKey: (key: string) => void;
    setAiBaseUrl: (url: string) => void;
    setAiModel: (model: string) => void;

    // Model context limit (in tokens)
    modelContextLimit: number;
    setModelContextLimit: (limit: number) => void;
}

export const useStore = create<AppState>((set) => ({
    // Initial state
    user: null,
    userTokens: null,
    currentChatId: null,
    messages: [],
    tokenCount: 0,
    files: {},
    selectedFile: null,
    terminalOutput: [],
    previewUrl: null,
    selectedModel: 'mimo-v2-flash',
    isDeploying: false,
    theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
    showTokenCounter: localStorage.getItem('showTokenCounter') === 'true',

    // Auth actions
    setUser: (user) => set({ user }),
    setUserTokens: (userTokens) => set({ userTokens }),

    // Chat actions
    setCurrentChatId: (currentChatId) => set({ currentChatId }),
    setMessages: (messages) => set({ messages }),
    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
    updateLastMessage: (content, toolCalls, thinking, thinkingDuration) => set((state) => {
        const messages = [...state.messages];
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1] as any;
            lastMsg.content = content;
            if (toolCalls) {
                lastMsg.tool_calls = toolCalls;
            }
            if (thinking) {
                lastMsg.thinking = thinking;
            }
            if (thinkingDuration !== undefined) {
                lastMsg.thinkingDuration = thinkingDuration;
            }
        }
        return { messages };
    }),
    setTokenCount: (tokenCount) => set({ tokenCount }),

    // File actions
    setFiles: (files) => set({ files }),
    setSelectedFile: (selectedFile) => set({ selectedFile }),

    // Terminal actions
    addTerminalOutput: (output) => set((state) => ({
        terminalOutput: [...state.terminalOutput, output]
    })),
    clearTerminalOutput: () => set({ terminalOutput: [] }),

    // Other actions
    setPreviewUrl: (url) => set({ previewUrl: url }),
    setIsDeploying: (isDeploying) => set({ isDeploying }),
    setSelectedModel: (selectedModel) => set({ selectedModel }),
    setTheme: (theme) => {
        localStorage.setItem('theme', theme);
        set({ theme });
    },
    setShowTokenCounter: (showTokenCounter) => {
        localStorage.setItem('showTokenCounter', String(showTokenCounter));
        set({ showTokenCounter });
    },
    // Chats
    chats: [],
    setChats: (chats) => set({ chats }),

    // System Prompt
    systemPrompt: null,
    setSystemPrompt: (systemPrompt) => set({ systemPrompt }),

    // AI Provider Settings
    aiProvider: localStorage.getItem('aiProvider') || 'glovix',
    aiApiKey: localStorage.getItem('aiApiKey') || '',
    aiBaseUrl: localStorage.getItem('aiBaseUrl') || 'https://api.openai.com/v1',
    aiModel: localStorage.getItem('aiModel') || 'gpt-4o',

    // AI Provider Actions
    setAiProvider: (provider) => {
        localStorage.setItem('aiProvider', provider);
        set({ aiProvider: provider });
    },
    setAiApiKey: (key) => {
        localStorage.setItem('aiApiKey', key);
        set({ aiApiKey: key });
    },
    setAiBaseUrl: (url) => {
        localStorage.setItem('aiBaseUrl', url);
        set({ aiBaseUrl: url });
    },
    setAiModel: (model) => {
        localStorage.setItem('aiModel', model);
        set({ aiModel: model });
    },

    // Model Context Limit
    modelContextLimit: parseInt(localStorage.getItem('modelContextLimit') || '200000'),
    setModelContextLimit: (modelContextLimit) => {
        localStorage.setItem('modelContextLimit', String(modelContextLimit));
        set({ modelContextLimit });
    },
}));
