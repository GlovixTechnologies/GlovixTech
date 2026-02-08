import { executeCommand, writeFile, readFile, renameFile, deleteFile } from './webcontainer';
import { useStore } from '../store';
import { parseToolArguments } from './utils';

// Tool definitions for AI
export const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'createFile',
            description: 'Create or update a file in the file system.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'The file path, e.g., src/App.tsx' },
                    content: { type: 'string', description: 'The content of the file.' },
                },
                required: ['path', 'content'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'editFile',
            description: 'Edit a specific part of a file by replacing old content with new content. Use this instead of createFile when you only need to change a small portion of a file. The oldContent must match exactly (including whitespace and indentation).',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'The file path to edit, e.g., src/App.tsx' },
                    oldContent: { type: 'string', description: 'The exact content to find and replace. Must match exactly including whitespace.' },
                    newContent: { type: 'string', description: 'The new content to replace the old content with.' },
                },
                required: ['path', 'oldContent', 'newContent'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'readFile',
            description: 'Read the content of a file.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'The file path, e.g., src/App.tsx' },
                },
                required: ['path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'deleteFile',
            description: 'Delete a file or directory.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'The path to delete.' },
                },
                required: ['path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'renameFile',
            description: 'Rename or move a file.',
            parameters: {
                type: 'object',
                properties: {
                    oldPath: { type: 'string', description: 'The current file path.' },
                    newPath: { type: 'string', description: 'The new file path.' },
                },
                required: ['oldPath', 'newPath'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'listFiles',
            description: 'List all files and folders in the project. Returns the project structure as a tree.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'runCommand',
            description: 'Run a shell command in the terminal.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The command to run, e.g., npm install' },
                },
                required: ['command'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'typeCheck',
            description: 'Run TypeScript type checking to find type errors in the project.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'searchWeb',
            description: 'Search the web for information, documentation, or images. Returns summaries, source links, and related images.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query.' },
                    includeDomains: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Optional: Limit search to specific domains (e.g., ["github.com", "stackoverflow.com"])'
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'inspectNetwork',
            description: 'Debug network requests by fetching a URL and returning headers/status. Use this to check if local server endpoints are responsive.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The URL to inspect (e.g., http://localhost:5173)' },
                    method: { type: 'string', description: 'HTTP method (GET, POST, etc.)', default: 'GET' },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'checkDependencies',
            description: 'Check package.json for outdated or conflicting dependencies using npm outdated.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'drawDiagram',
            description: 'Generate and display an architecture diagram using Mermaid syntax.',
            parameters: {
                type: 'object',
                properties: {
                    mermaidCode: { type: 'string', description: 'The Mermaid diagram syntax code.' },
                    title: { type: 'string', description: 'Title of the diagram' },
                },
                required: ['mermaidCode'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'extractPage',
            description: 'Extract the full content of a specific webpage as markdown. Use this to read documentation pages, articles, or any URL.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The URL to extract content from' },
                },
                required: ['url'],
            },
        },
    },
];

// Tool execution context
export interface ToolContext {
    addTerminalOutput: (output: string) => void;
    setSelectedFile: (path: string) => void;
}

// Individual tool handlers
export async function handleCreateFile(
    args: { path: string; content: string },
    ctx: ToolContext
): Promise<string> {
    const { path, content } = args;

    if (!path || typeof path !== 'string') {
        return 'Error: Invalid file path';
    }
    if (content === undefined || content === null) {
        return `Error: Invalid file content for ${path}`;
    }

    try {
        ctx.setSelectedFile(path);

        await writeFile(path, content);
        const state = useStore.getState();
        state.setFiles({
            ...state.files,
            [path]: { file: { contents: content } }
        });
        return `[SYSTEM] File created: ${path}`;
    } catch (e: any) {
        return `Error creating file ${path}: ${e.message}`;
    }
}

export async function handleEditFile(
    args: { path: string; oldContent: string; newContent: string }
): Promise<string> {
    const { path, oldContent, newContent } = args;

    try {
        const currentContent = await readFile(path);

        if (!currentContent.includes(oldContent)) {
            return `Error editing ${path}: Could not find the specified content to replace. Make sure oldContent matches exactly.`;
        }

        const matches = currentContent.split(oldContent).length - 1;
        if (matches > 1) {
            return `Error editing ${path}: Found ${matches} matches for oldContent. Please provide more specific content to ensure unique match.`;
        }

        const newFileContent = currentContent.replace(oldContent, newContent);

        await writeFile(path, newFileContent);
        const state = useStore.getState();
        state.setFiles({
            ...state.files,
            [path]: { file: { contents: newFileContent } }
        });

        return `[SYSTEM] File edited: ${path}`;
    } catch (e: any) {
        return `Error editing file ${path}: ${e.message}`;
    }
}

export async function handleReadFile(args: { path: string }): Promise<string> {
    const { path } = args;
    try {
        const content = await readFile(path);
        return `[SYSTEM] File content of ${path}:\n${content}`;
    } catch (e: any) {
        return `Error reading file ${path}: ${e.message}`;
    }
}

export async function handleDeleteFile(args: { path: string }): Promise<string> {
    const { path } = args;
    try {
        await deleteFile(path);
        const state = useStore.getState();
        const newFiles = { ...state.files };
        if (newFiles[path]) {
            delete newFiles[path];
            state.setFiles(newFiles);
        }
        return `[SYSTEM] File deleted: ${path}`;
    } catch (e: any) {
        return `Error deleting file ${path}: ${e.message}`;
    }
}

export async function handleRenameFile(
    args: { oldPath: string; newPath: string }
): Promise<string> {
    const { oldPath, newPath } = args;
    try {
        await renameFile(oldPath, newPath);
        const state = useStore.getState();
        const newFiles = { ...state.files };
        if (newFiles[oldPath]) {
            newFiles[newPath] = newFiles[oldPath];
            delete newFiles[oldPath];
            state.setFiles(newFiles);
        }
        return `[SYSTEM] File renamed from ${oldPath} to ${newPath}`;
    } catch (e: any) {
        return `Error renaming file ${oldPath}: ${e.message}`;
    }
}

export function handleListFiles(): string {
    try {
        const files = useStore.getState().files;
        const paths = Object.keys(files).sort();

        if (paths.length === 0) {
            return '[SYSTEM] Project is empty. No files found.';
        }

        const tree: string[] = [];
        const dirs = new Set<string>();

        for (const path of paths) {
            const parts = path.split('/');
            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
                currentPath += (currentPath ? '/' : '') + parts[i];
                dirs.add(currentPath);
            }
        }

        const allPaths = [...Array.from(dirs).map(d => d + '/'), ...paths].sort();

        for (const path of allPaths) {
            const depth = path.split('/').length - 1;
            const indent = '  '.repeat(depth);
            const name = path.split('/').filter(Boolean).pop() || path;
            const isDir = path.endsWith('/');
            tree.push(`${indent}${isDir ? '📁 ' : '📄 '}${name}`);
        }

        return `[SYSTEM] Project structure:\n${tree.join('\n')}`;
    } catch (e: any) {
        return `Error listing files: ${e.message}`;
    }
}

export async function handleRunCommand(
    args: { command: string },
    ctx: ToolContext
): Promise<string> {
    const { command } = args;
    try {
        const [cmd, ...cmdArgs] = command.split(' ');

        // Special handling for long-running commands like 'npm run dev'
        const isDevServer = cmd === 'npm' && (
            (cmdArgs.includes('run') && cmdArgs.includes('dev')) ||
            cmdArgs.join(' ').includes('run dev')
        );

        if (isDevServer) {
            executeCommand(cmd, cmdArgs, (output) => {
                ctx.addTerminalOutput(output);
            });
            return `[SYSTEM] Command "${command}" started in background. ✅ DEV SERVER IS NOW RUNNING! Your task is complete - do not run any more commands.`;
        } else {
            let outputBuffer = '';
            const exitCode = await executeCommand(cmd, cmdArgs, (output) => {
                outputBuffer += output;
                ctx.addTerminalOutput(output);
            });

            // Truncate output if too long to save tokens
            const MAX_OUTPUT_LENGTH = 2000;
            let finalOutput = outputBuffer;
            if (finalOutput.length > MAX_OUTPUT_LENGTH) {
                finalOutput = '...' + finalOutput.slice(-MAX_OUTPUT_LENGTH);
            }

            return `[SYSTEM] Command "${command}" finished with exit code ${exitCode}.\nOutput:\n${finalOutput}`;
        }
    } catch (e: any) {
        return `Error running command: ${e.message}`;
    }
}

export async function handleTypeCheck(ctx: ToolContext): Promise<string> {
    try {
        let output = '';
        const exitCode = await executeCommand('npx', ['tsc', '--noEmit', '--pretty'], (data) => {
            output += data;
            ctx.addTerminalOutput(data);
        });
        if (exitCode === 0) {
            return '[SYSTEM] TypeScript check passed: No type errors found.';
        } else {
            return `[SYSTEM] TypeScript check found errors:\n${output}`;
        }
    } catch (e: any) {
        return `Error running TypeScript check: ${e.message}`;
    }
}

export async function handleSearchWeb(args: { query: string; includeDomains?: string[] }): Promise<string> {
    const { query, includeDomains } = args;
    try {
        const requestBody: any = {
            api_key: import.meta.env.VITE_TAVILY_API_KEY,
            query,
            include_answer: "basic",
            search_depth: "advanced",
            max_results: 5,
            include_images: true,
            include_image_descriptions: true,
        };

        if (includeDomains && includeDomains.length > 0) {
            requestBody.include_domains = includeDomains;
        }

        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new Error(`Tavily API Error: ${response.statusText}`);
        }

        const data = await response.json();

        // Format results with images for AI to use
        let result = '';
        
        if (data.answer) {
            result += `${data.answer}\n\n`;
        }
        
        if (data.results && data.results.length > 0) {
            result += `**Sources:** ${data.results.map((r: any) => r.title).join(', ')}\n\n`;
        }
        
        // Add images in markdown format so they render in chat
        if (data.images && data.images.length > 0) {
            result += `**Images:**\n\n`;
            data.images.slice(0, 6).forEach((img: any, idx: number) => {
                // Direct markdown image - will render in chat
                result += `![${img.description || `Image ${idx + 1}`}](${img.url})\n\n`;
            });
        }

        return result;
    } catch (e: any) {
        return `Error: ${e.message}`;
    }
}

export async function handleExtractPage(args: { url: string }): Promise<string> {
    const { url } = args;
    try {
        const response = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: import.meta.env.VITE_TAVILY_API_KEY,
                urls: [url],
            }),
        });

        if (!response.ok) {
            throw new Error(`Tavily Extract API Error: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const result = data.results[0];
            let formatted = `[SYSTEM] Extracted content from ${url}\n\n`;
            formatted += `## ${result.title || 'Page Content'}\n\n`;
            formatted += result.raw_content || result.content || 'No content extracted';
            return formatted;
        }

        return `[SYSTEM] No content could be extracted from ${url}`;
    } catch (e: any) {
        return `Error extracting page: ${e.message}`;
    }
}

// Main tool executor
// New Tool Handlers

export async function handleInspectNetwork(args: { url: string; method?: string }, ctx: ToolContext): Promise<string> {
    const { url } = args;
    try {
        // Use Node.js to fetch URL directly from the container environment
        // This is more reliable than assuming curl is installed
        return await handleRunCommand({
            command: `node -e "const h=require('${url.startsWith('https') ? 'https' : 'http'}'); h.get('${url}', r => { console.log('Status: '+r.statusCode); console.log(r.headers); r.resume() }).on('error', e=>console.log(e.message))"`
        }, ctx);
    } catch (e: any) {
        return `Error inspecting network: ${e.message}`;
    }
}

export async function handleCheckDependencies(ctx: ToolContext): Promise<string> {
    try {
        // Check outdated
        const outdated = await handleRunCommand({ command: 'npm outdated' }, ctx);
        // Also read package.json to show current
        const pkg = await handleReadFile({ path: 'package.json' });

        return `${pkg}\n\n[NPM OUTDATED REPORT]:\n${outdated}`;
    } catch (e: any) {
        return `Error checking dependencies: ${e.message}`;
    }
}

export async function handleDrawDiagram(args: { mermaidCode: string; title?: string }): Promise<string> {
    try {
        const { mermaidCode, title } = args;

        // 1. Check for unbalanced brackets (common AI error)
        const openSq = (mermaidCode.match(/\[/g) || []).length;
        const closeSq = (mermaidCode.match(/\]/g) || []).length;
        if (openSq !== closeSq) {
            throw new Error(`Syntax Error: Unbalanced brackets [] detected (${openSq} vs ${closeSq}). check your node definitions.`);
        }

        // 2. Check for unbalanced parentheses
        const openParen = (mermaidCode.match(/\(/g) || []).length;
        const closeParen = (mermaidCode.match(/\)/g) || []).length;
        if (openParen !== closeParen) {
            throw new Error(`Syntax Error: Unbalanced parentheses () detected (${openParen} vs ${closeParen}).`);
        }

        // 3. Strict Check: Parentheses inside brackets MUST be quoted or escaped
        // Bad: [Some (Thing)] -> Mermaid confuses ( as shape start
        // Good: ["Some (Thing)"]
        // Regex looks for [ followed by non-quotes, then (, then non-quotes, then ]
        if (/\[[^"\]]*\([^\)\]]+\)[^"\]]*\]/.test(mermaidCode)) {
            throw new Error(`Syntax Error: Found parentheses () inside node labels without quotes. Example: A[Text (Info)] is INVALID. Use A["Text (Info)"] instead.`);
        }

        // 4. Strict Check: Nested brackets or arrays are forbidden in labels
        // Pattern: [ followed by anything not ], followed by another [
        // This catches A[ B[C] ]
        if (/\[[^\]]*\[/.test(mermaidCode)) {
            throw new Error(`Syntax Error: Nested brackets [ ... [ ... ] ] detected. This breaks Mermaid parsing. If you need brackets in text, use quotes: A["Text [Details]"].`);
        }

        // Pattern: Double closing brackets ]]
        if (mermaidCode.includes(']]')) {
            throw new Error(`Syntax Error: Double closing brackets ]] detected. This implies nested brackets, which are invalid. Use quotes.`);
        }

        return `[SYSTEM] Diagram generated.\n\n### ${title || 'Architecture'}\n\`\`\`mermaid\n${mermaidCode}\n\`\`\``;
    } catch (e: any) {
        return `Error generating diagram: ${e.message}\n\nPlease fix the syntax and try again.`;
    }
}

// Main tool executor
export async function executeTool(
    name: string,
    argsString: string,
    ctx: ToolContext
): Promise<string> {
    // Handle tools without arguments
    if (name === 'typeCheck') return handleTypeCheck(ctx);
    if (name === 'listFiles') return handleListFiles();
    if (name === 'checkDependencies') return handleCheckDependencies(ctx);

    // Parse arguments
    const argsList = parseToolArguments(argsString);
    if (argsList.length === 0) {
        return 'Error: Invalid arguments. Could not parse JSON.';
    }

    const results: string[] = [];

    for (const args of argsList) {
        let result: string;

        switch (name) {
            case 'createFile':
                result = await handleCreateFile(args, ctx);
                break;
            case 'editFile':
                result = await handleEditFile(args);
                break;
            case 'readFile':
                result = await handleReadFile(args);
                break;
            case 'deleteFile':
                result = await handleDeleteFile(args);
                break;
            case 'renameFile':
                result = await handleRenameFile(args);
                break;
            case 'runCommand':
                result = await handleRunCommand(args, ctx);
                break;
            case 'searchWeb':
                result = await handleSearchWeb(args);
                break;
            case 'inspectNetwork':
                result = await handleInspectNetwork(args, ctx);
                break;
            case 'drawDiagram':
                result = await handleDrawDiagram(args);
                break;
            case 'extractPage':
                result = await handleExtractPage(args);
                break;
            default:
                result = `Unknown tool: ${name}`;
        }

        results.push(result);
    }

    return results.join('\n');
}
