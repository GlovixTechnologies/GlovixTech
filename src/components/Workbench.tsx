import { useState, useEffect, useRef } from 'react';
import { Code2, Play, ChevronDown, ChevronUp, RotateCw, Download, Zap, Loader2 } from 'lucide-react';
import { useStore } from '../store';
import { CodeEditor } from './CodeEditor';
import { Terminal } from './Terminal';
import { FileExplorer } from './FileExplorer';
import { SkeletonFileTree, SkeletonCodeEditor } from './SkeletonLoader';
import { executeCommand, mountFiles } from '../lib/webcontainer';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export function Workbench() {
    const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
    const [terminalTab, setTerminalTab] = useState<'bolt' | 'terminal'>('bolt');
    const { previewUrl, addTerminalOutput, files, theme } = useStore();
    const [status, setStatus] = useState<'idle' | 'installing' | 'starting' | 'running' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [showTerminal, setShowTerminal] = useState(true);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);



    const isDark = theme === 'dark';

    const handleReloadPreview = () => {
        if (iframeRef.current) {
            iframeRef.current.src = iframeRef.current.src;
        }
    };

    useEffect(() => {
        const init = async () => {
            if (Object.keys(files).length > 0) {
                await mountFiles(files);
            }
        };
        init();
    }, [files]);

    const startServer = async () => {
        if (status === 'installing' || status === 'starting' || status === 'running') return;

        setStatus('installing');
        setErrorMsg('');

        try {
            addTerminalOutput('$ npm install\n');
            const installExitCode = await executeCommand('npm', ['install'], (output) => {
                addTerminalOutput(output);
            });

            if (installExitCode !== 0) {
                throw new Error(`npm install failed with code ${installExitCode}`);
            }

            setStatus('starting');
            addTerminalOutput('$ npm run dev\n');
            await executeCommand('npm', ['run', 'dev'], (output) => {
                addTerminalOutput(output);
            });
            // Note: npm run dev typically doesn't exit, so we stay in 'starting' until previewUrl is set
            // effectively acting as 'running' state for the process.
            setStatus('running');
        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || 'Failed to start server');
            setStatus('error');
        }
    };

    const handleDownload = async () => {
        if (Object.keys(files).length === 0) {
            addTerminalOutput('No files to download.\n');
            return;
        }
        const zip = new JSZip();
        for (const [path, file] of Object.entries(files)) {
            zip.file(path, file.file.contents);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        saveAs(blob, 'project.zip');
    };

    return (
        <div className={`flex-1 h-full flex flex-col overflow-hidden pt-2 pr-2 pb-2 gap-1.5 ${isDark ? 'bg-[#141414]' : 'bg-gray-100'}`}>
            {/* Top bar */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1">
                    <div className={`flex items-center rounded-lg p-0.5 ${isDark ? 'bg-[#1a1a1a]' : 'bg-gray-200'}`}>
                        <button
                            onClick={() => setActiveTab('code')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'code' ? (isDark ? 'bg-[#2a2a2a] text-white' : 'bg-white text-gray-900 shadow-sm') : (isDark ? 'text-[#666] hover:text-[#999]' : 'text-gray-400 hover:text-gray-600')}`}
                        >
                            <Code2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setActiveTab('preview')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'preview' ? (isDark ? 'bg-[#2a2a2a] text-white' : 'bg-white text-gray-900 shadow-sm') : (isDark ? 'text-[#666] hover:text-[#999]' : 'text-gray-400 hover:text-gray-600')}`}
                        >
                            <Play className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={handleDownload}
                        className={`p-2 rounded-lg transition-colors ${isDark ? 'text-[#666] hover:text-white hover:bg-[#1a1a1a]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
                        title="Download"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main content block - Files + Editor */}
            <div className={`flex-1 flex overflow-hidden rounded-xl border ${isDark ? 'bg-[#141414] border-[#1f1f1f]' : 'bg-white border-gray-200'}`}>
                {activeTab === 'code' ? (
                    <>
                        {/* Files sidebar */}
                        <div className={`w-56 flex flex-col overflow-hidden border-r ${isDark ? 'border-[#1f1f1f]' : 'border-gray-200'}`}>
                            <div className={`h-9 flex items-center gap-3 px-3 border-b text-xs ${isDark ? 'border-[#1f1f1f] text-[#888]' : 'border-gray-200 text-gray-500'}`}>
                                <span className={`font-medium ${isDark ? 'text-[#ccc]' : 'text-gray-700'}`}>Files</span>
                                <span className="opacity-50">Search</span>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {Object.keys(files).length === 0 ? (
                                    <SkeletonFileTree isDark={isDark} />
                                ) : (
                                    <FileExplorer />
                                )}
                            </div>
                        </div>

                        {/* Editor only */}
                        <div className="flex-1 flex flex-col min-w-0">
                            <div className="flex-1 overflow-hidden">
                                {Object.keys(files).length === 0 ? (
                                    <SkeletonCodeEditor isDark={isDark} />
                                ) : (
                                    <CodeEditor />
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col">
                        {previewUrl ? (
                            <>
                                <div className={`h-9 border-b flex items-center px-3 gap-2 ${isDark ? 'border-[#1f1f1f]' : 'border-gray-200'}`}>
                                    <button onClick={handleReloadPreview} className={`p-1.5 rounded-md ${isDark ? 'text-[#666] hover:text-white hover:bg-[#1a1a1a]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                                        <RotateCw className="w-3.5 h-3.5" />
                                    </button>
                                    <div className={`flex-1 px-2 py-1 rounded-md text-xs truncate ${isDark ? 'bg-[#1a1a1a] text-[#666]' : 'bg-gray-100 text-gray-400'}`}>
                                        {previewUrl}
                                    </div>
                                </div>
                                <div ref={previewContainerRef} className="flex-1 relative">
                                    <iframe ref={iframeRef} src={previewUrl} className="absolute inset-0 w-full h-full border-none bg-white" title="Preview" />
                                </div>
                            </>
                        ) : (
                            <div className={`flex flex-col items-center justify-center h-full gap-2 ${isDark ? 'text-[#444]' : 'text-gray-300'}`}>
                                {status === 'installing' && (
                                    <>
                                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                        <p className="text-sm text-gray-400">Installing dependencies...</p>
                                        <p className="text-xs text-gray-500">This may take a moment</p>
                                    </>
                                )}
                                {status === 'starting' && (
                                    <>
                                        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                                        <p className="text-sm text-gray-400">Starting development server...</p>
                                    </>
                                )}
                                {status === 'error' && (
                                    <>
                                        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-2">
                                            <Zap className="w-6 h-6 text-red-500" />
                                        </div>
                                        <p className="text-sm text-red-400 font-medium">Failed to start server</p>
                                        <p className="text-xs text-gray-500 mb-4">{errorMsg}</p>
                                        <button
                                            onClick={() => setStatus('idle')}
                                            className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                                        >
                                            Try Again
                                        </button>
                                    </>
                                )}
                                {status === 'idle' && (
                                    <button
                                        onClick={startServer}
                                        className="group flex flex-col items-center justify-center gap-2 hover:scale-105 transition-all duration-300"
                                    >
                                        <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 border-dashed ${isDark ? 'border-[#333] group-hover:border-blue-500' : 'border-gray-300 group-hover:border-blue-500'} animate-[spin_10s_linear_infinite]`}>
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDark ? 'bg-[#222] group-hover:bg-blue-500/20' : 'bg-gray-100 group-hover:bg-blue-50'} transition-colors`}>
                                                <Play className={`w-6 h-6 ml-1 ${isDark ? 'text-gray-400 group-hover:text-blue-400' : 'text-gray-400 group-hover:text-blue-500'} transition-colors`} />
                                            </div>
                                        </div>
                                        <p className="text-sm opacity-50 group-hover:opacity-100 transition-opacity">Run Project</p>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Terminal - full width at bottom */}
            <div className={`flex flex-col rounded-xl border transition-all duration-200 ${showTerminal ? 'h-48' : 'h-10'} ${isDark ? 'bg-[#141414] border-[#1f1f1f]' : 'bg-white border-gray-200'}`}>
                <div className={`h-10 flex items-center justify-between px-3 ${isDark ? 'bg-[#141414]' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => { setTerminalTab('bolt'); setShowTerminal(true); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${terminalTab === 'bolt' ? (isDark ? 'bg-[#1f1f1f] text-white' : 'bg-gray-200 text-gray-900') : (isDark ? 'text-[#666] hover:text-[#999]' : 'text-gray-400 hover:text-gray-600')}`}
                        >
                            <Zap className="w-3.5 h-3.5 text-[#22c55e]" />
                            Glovix
                        </button>
                    </div>
                    <button
                        onClick={() => setShowTerminal(!showTerminal)}
                        className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-[#444] hover:text-[#666] hover:bg-[#1f1f1f]' : 'text-gray-300 hover:text-gray-400 hover:bg-gray-100'}`}
                    >
                        {showTerminal ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                </div>
                {showTerminal && (
                    <div className={`flex-1 overflow-hidden rounded-b-xl ${isDark ? 'bg-[#141414]' : 'bg-white'}`}>
                        <Terminal />
                    </div>
                )}
            </div>
        </div>
    );
}
