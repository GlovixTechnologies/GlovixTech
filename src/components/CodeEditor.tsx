import Editor, { loader, Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useStore } from '../store';
import { useRef } from 'react';

loader.config({ monaco });

const getLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        json: 'json', html: 'html', css: 'css', scss: 'scss', md: 'markdown',
        py: 'python', yaml: 'yaml', yml: 'yaml',
    };
    return langMap[ext || ''] || 'plaintext';
};

export function CodeEditor() {
    const { files, setFiles, selectedFile, theme } = useStore();
    const isDark = theme === 'dark';
    const monacoRef = useRef<Monaco | null>(null);

    const content = selectedFile ? files[selectedFile]?.file.contents : '';

    const handleEditorWillMount = (monaco: Monaco) => {
        monacoRef.current = monaco;
        // Define custom dark theme with #141414 background
        monaco.editor.defineTheme('glovix-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': '#141414',
                'editor.lineHighlightBackground': '#1a1a1a',
                'editorLineNumber.foreground': '#444444',
                'editorLineNumber.activeForeground': '#888888',
                'editor.selectionBackground': '#264f78',
                'editorWidget.background': '#1a1a1a',
                'editorWidget.border': '#2a2a2a',
                'input.background': '#1a1a1a',
                'dropdown.background': '#1a1a1a',
            }
        });
    };

    if (!selectedFile) {
        return (
            <div className={`h-full flex items-center justify-center ${isDark ? 'bg-[#141414] text-[#525252]' : 'bg-white text-gray-400'}`}>
                <p>Select a file to edit</p>
            </div>
        );
    }

    return (
        <div className={`h-full w-full relative ${isDark ? 'bg-[#141414]' : 'bg-white'}`}>
            <Editor
                height="100%"
                language={getLanguage(selectedFile)}
                value={content}
                theme={isDark ? 'glovix-dark' : 'light'}
                beforeMount={handleEditorWillMount}
                onChange={(value) => {
                    if (selectedFile && value !== undefined) {
                        setFiles({ ...files, [selectedFile]: { file: { contents: value } } });
                    }
                }}
                options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineHeight: 20,
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                }}
            />
        </div>
    );
}
