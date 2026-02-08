import { useEffect, useRef } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useStore } from '../store';
import { startShell, writeToShell, resizeShell } from '../lib/webcontainer';

export function Terminal() {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const shellStartedRef = useRef(false);
    const isDisposedRef = useRef(false);
    const { terminalOutput, theme } = useStore();
    const lastOutputIndex = useRef(0);
    const isDark = theme === 'dark';

    // Initialize terminal
    useEffect(() => {
        if (!terminalRef.current) return;

        isDisposedRef.current = false;
        console.log('[Terminal] Initializing xterm...');

        const term = new XTerminal({
            theme: isDark ? {
                background: '#141414',
                foreground: '#e5e5e5',
                cursor: '#3b82f6',
                selectionBackground: '#334155',
                black: '#141414',
                brightBlack: '#666666',
                red: '#ef4444',
                brightRed: '#f87171',
                green: '#22c55e',
                brightGreen: '#4ade80',
                yellow: '#eab308',
                brightYellow: '#facc15',
                blue: '#3b82f6',
                brightBlue: '#60a5fa',
                magenta: '#a855f7',
                brightMagenta: '#c084fc',
                cyan: '#06b6d4',
                brightCyan: '#22d3ee',
                white: '#e5e5e5',
                brightWhite: '#ffffff',
            } : {
                background: '#ffffff',
                foreground: '#1f2937',
                cursor: '#3b82f6',
                selectionBackground: '#bfdbfe',
            },
            fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.5,
            cursorBlink: true,
            convertEol: true,
            allowProposedApi: true,
            scrollback: 1000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        fitAddonRef.current = fitAddon;

        term.open(terminalRef.current);
        xtermRef.current = term;

        console.log('[Terminal] xterm opened');

        // Restore terminal history from store
        if (terminalOutput.length > 0) {
            console.log('[Terminal] Restoring history:', terminalOutput.length, 'entries');
            terminalOutput.forEach(output => {
                if (!isDisposedRef.current) {
                    term.write(output);
                }
            });
            lastOutputIndex.current = terminalOutput.length;
        }

        // Safe fit function with disposed check
        const fitTerminal = () => {
            if (isDisposedRef.current) return;
            try {
                // Check if element is actually visible in DOM
                if (terminalRef.current && xtermRef.current && fitAddonRef.current) {
                    // Safety check for xterm internals
                    // @ts-ignore
                    if (!xtermRef.current.element || !xtermRef.current.element.offsetParent) {
                        return; // Terminal not visible/mounted
                    }

                    const rect = terminalRef.current.getBoundingClientRect();
                    if (rect.width > 10 && rect.height > 10) {
                        fitAddonRef.current.fit();
                        resizeShell(xtermRef.current.cols, xtermRef.current.rows);
                    }
                }
            } catch (e) {
                // Ignore fit errors - commonly happens if viewport is not ready
                console.warn('Axterm fit error:', e);
            }
        };

        // Delay fit to ensure container is rendered
        const fitTimeout = setTimeout(fitTerminal, 300);

        // Start interactive shell
        if (!shellStartedRef.current) {
            shellStartedRef.current = true;
            console.log('[Terminal] Starting shell...');

            startShell((data) => {
                if (xtermRef.current && !isDisposedRef.current) {
                    xtermRef.current.write(data);
                }
            }).then(() => {
                console.log('[Terminal] Shell started successfully');
            }).catch((err) => {
                console.error('[Terminal] Shell failed to start:', err);
            });
        }

        // Handle user input - send to shell
        const dataHandler = term.onData((data) => {
            if (!isDisposedRef.current) {
                console.log('[Terminal] User typed:', JSON.stringify(data));
                writeToShell(data);
            }
        });

        // Handle resize with debounce
        let resizeTimeout: NodeJS.Timeout;
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(fitTerminal, 100);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            console.log('[Terminal] Disposing...');
            isDisposedRef.current = true;
            clearTimeout(fitTimeout);
            clearTimeout(resizeTimeout);
            dataHandler.dispose();
            window.removeEventListener('resize', handleResize);

            // Delay dispose to avoid race conditions
            setTimeout(() => {
                try {
                    term.dispose();
                } catch (e) {
                    // Ignore dispose errors
                }
            }, 50);
        };
    }, []);

    // Write AI command output to terminal
    useEffect(() => {
        if (xtermRef.current && !isDisposedRef.current) {
            const term = xtermRef.current;
            for (let i = lastOutputIndex.current; i < terminalOutput.length; i++) {
                term.write(terminalOutput[i]);
            }
            lastOutputIndex.current = terminalOutput.length;
        }
    }, [terminalOutput]);

    // Update terminal theme when theme changes
    useEffect(() => {
        if (xtermRef.current && !isDisposedRef.current) {
            xtermRef.current.options.theme = isDark ? {
                background: '#141414',
                foreground: '#e5e5e5',
                cursor: '#3b82f6',
                selectionBackground: '#334155',
                black: '#141414',
                brightBlack: '#666666',
                red: '#ef4444',
                brightRed: '#f87171',
                green: '#22c55e',
                brightGreen: '#4ade80',
                yellow: '#eab308',
                brightYellow: '#facc15',
                blue: '#3b82f6',
                brightBlue: '#60a5fa',
                magenta: '#a855f7',
                brightMagenta: '#c084fc',
                cyan: '#06b6d4',
                brightCyan: '#22d3ee',
                white: '#e5e5e5',
                brightWhite: '#ffffff',
            } : {
                background: '#ffffff',
                foreground: '#1f2937',
                cursor: '#3b82f6',
                selectionBackground: '#bfdbfe',
            };
        }
    }, [isDark]);

    const handleClick = () => {
        if (xtermRef.current && !isDisposedRef.current) {
            xtermRef.current.focus();
        }
    };

    return (
        <div className={`h-full w-full overflow-hidden p-2 ${isDark ? 'bg-[#141414]' : 'bg-white'}`}>
            <div
                ref={terminalRef}
                onClick={handleClick}
                className="h-full w-full cursor-text overflow-hidden"
            />
        </div>
    );
}
