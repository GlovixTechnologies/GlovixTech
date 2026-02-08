import { WebContainer, FileSystemTree, DirectoryNode } from '@webcontainer/api';

import { useStore } from '../store';

declare global {
    interface Window {
        _webContainerInstance: WebContainer;
        _bootPromise: Promise<WebContainer>;
    }
}

let webContainerInstance: WebContainer | null = null;

export async function getWebContainer() {
    if (webContainerInstance) return webContainerInstance;
    if (window._webContainerInstance) {
        webContainerInstance = window._webContainerInstance;
        return webContainerInstance;
    }

    if (!window._bootPromise) {
        window._bootPromise = WebContainer.boot().then(instance => {
            window._webContainerInstance = instance;
            webContainerInstance = instance;
            instance.on('server-ready', (port, url) => {
                console.log('Server ready:', port, url);
                useStore.getState().setPreviewUrl(url);
            });
            return instance;
        });
    }

    return window._bootPromise;
}

export async function mountFiles(files: Record<string, { file: { contents: string } }>) {
    const instance = await getWebContainer();

    const tree: FileSystemTree = {};

    for (const [path, file] of Object.entries(files)) {
        const parts = path.split('/');
        let current = tree;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = { directory: {} };
            }

            const node = current[part];
            if (!('directory' in node)) {
                console.warn(`Path collision: ${path}. ${part} is treated as a file but expected as directory.`);
                current[part] = { directory: {} };
            }

            current = (current[part] as DirectoryNode).directory;
        }

        const fileName = parts[parts.length - 1];
        current[fileName] = { file: { contents: file.file.contents } };
    }

    console.log('Mounting file tree:', tree);
    await instance.mount(tree);
}

export async function writeFile(path: string, content: string) {
    const instance = await getWebContainer();

    // Ensure parent directory exists
    const parts = path.split('/');
    if (parts.length > 1) {
        const dir = parts.slice(0, -1).join('/');
        await instance.fs.mkdir(dir, { recursive: true });
    }

    await instance.fs.writeFile(path, content);
}

export async function readFile(path: string): Promise<string> {
    const instance = await getWebContainer();

    // Add timeout to prevent hanging
    const timeoutMs = 10000;
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout reading file: ${path}`)), timeoutMs);
    });

    try {
        const content = await Promise.race([
            instance.fs.readFile(path, 'utf-8'),
            timeoutPromise
        ]);
        return content;
    } catch (error: any) {
        // Check if file exists
        if (error.message?.includes('ENOENT') || error.message?.includes('no such file')) {
            throw new Error(`File not found: ${path}`);
        }
        throw error;
    }
}

export async function renameFile(oldPath: string, newPath: string) {
    const instance = await getWebContainer();
    const content = await instance.fs.readFile(oldPath);
    await writeFile(newPath, typeof content === 'string' ? content : new TextDecoder().decode(content));
    await instance.fs.rm(oldPath);
}

export async function deleteFile(path: string) {
    const instance = await getWebContainer();
    await instance.fs.rm(path, { recursive: true });
}

export async function executeCommand(
    command: string,
    args: string[],
    onOutput: (data: string) => void
): Promise<number> {
    const instance = await getWebContainer();
    const process = await instance.spawn(command, args);

    process.output.pipeTo(new WritableStream({
        write(data) {
            onOutput(data);
        }
    }));

    return process.exit;
}

let shellProcess: Awaited<ReturnType<WebContainer['spawn']>> | null = null;
let shellWriter: WritableStreamDefaultWriter<string> | null = null;

export async function startShell(onOutput: (data: string) => void) {
    const instance = await getWebContainer();

    shellProcess = await instance.spawn('jsh', {
        terminal: { cols: 80, rows: 20 }
    });

    shellProcess.output.pipeTo(new WritableStream({
        write(data) {
            onOutput(data);
        }
    }));

    shellWriter = shellProcess.input.getWriter();

    return shellProcess;
}

export async function writeToShell(data: string) {
    if (shellWriter) {
        await shellWriter.write(data);
    }
}

export async function resizeShell(cols: number, rows: number) {
    if (shellProcess) {
        shellProcess.resize({ cols, rows });
    }
}
