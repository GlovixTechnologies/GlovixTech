import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, X } from 'lucide-react';

export interface StreamingAction {
    id: string;
    toolName: string;
    displayName: string;
    status: 'pending' | 'running' | 'done' | 'error';
    result?: string;
    args?: any;
}

interface ActionsListProps {
    actions: StreamingAction[];
    isLive?: boolean;
    isDark?: boolean;
}

const VERBS: Record<string, [string, string]> = {
    createFile:        ['Creating', 'Created'],
    editFile:          ['Editing', 'Edited'],
    readFile:          ['Reading', 'Read'],
    deleteFile:        ['Deleting', 'Deleted'],
    renameFile:        ['Renaming', 'Renamed'],
    runCommand:        ['Running', 'Ran'],
    searchWeb:         ['Searching', 'Searched'],
    extractPage:       ['Extracting', 'Extracted'],
    typeCheck:         ['Checking types', 'Type checked'],
    listFiles:         ['Listing files', 'Listed files'],
    inspectNetwork:    ['Inspecting', 'Inspected'],
    checkDependencies: ['Checking deps', 'Checked deps'],
    drawDiagram:       ['Drawing diagram', 'Drew diagram'],
};

interface DeduplicatedAction {
    action: StreamingAction;
    count: number;
}

function deduplicateActions(actions: StreamingAction[]): DeduplicatedAction[] {
    const result: DeduplicatedAction[] = [];
    for (const action of actions) {
        const key = `${action.toolName}::${action.displayName}::${action.status}`;
        const last = result[result.length - 1];
        if (last && `${last.action.toolName}::${last.action.displayName}::${last.action.status}` === key) {
            last.count++;
        } else {
            result.push({ action, count: 1 });
        }
    }
    return result;
}

function ActionRow({ action, count, isDark }: { action: StreamingAction; count: number; isDark: boolean }) {
    const active = action.status === 'running' || action.status === 'pending';
    const pair = VERBS[action.toolName];
    const verb = active ? (pair?.[0] ?? action.toolName) : (pair?.[1] ?? action.toolName);

    const text = `${verb}${action.displayName ? ` ${action.displayName}` : ''}`;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 py-[3px]"
        >
            {/* status icon */}
            {action.status === 'done' ? (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="text-emerald-500 flex-shrink-0"
                >
                    <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                </motion.span>
            ) : action.status === 'error' ? (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="text-red-400 flex-shrink-0"
                >
                    <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                </motion.span>
            ) : (
                <span className="w-3.5 flex-shrink-0" />
            )}

            {/* text */}
            <span
                className={`
                    text-[13px] truncate
                    ${active
                        ? `text-shimmer ${isDark ? 'text-shimmer-dark' : 'text-shimmer-light'}`
                        : action.status === 'error'
                            ? 'text-red-400/80'
                            : isDark ? 'text-zinc-400' : 'text-gray-500'
                    }
                `}
            >
                {text}
            </span>

            {/* count badge */}
            {count > 1 && (
                <span className={`text-[11px] flex-shrink-0 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                    x{count}
                </span>
            )}
        </motion.div>
    );
}

export function ActionsList({ actions, isLive = false, isDark = true }: ActionsListProps) {
    const [collapsed, setCollapsed] = useState(false);

    const deduplicated = useMemo(() => deduplicateActions(actions), [actions]);

    if (actions.length === 0) return null;

    const doneN = actions.filter(a => a.status === 'done').length;
    const errN = actions.filter(a => a.status === 'error').length;
    const runningN = actions.filter(a => a.status === 'running' || a.status === 'pending').length;
    const allActionsFinished = (doneN + errN) === actions.length;
    const allGood = doneN === actions.length && !isLive;
    const show = !collapsed;

    return (
        <div className={`
            my-2 rounded-xl border overflow-hidden
            ${isDark ? 'bg-[#161616] border-[#232323]' : 'bg-gray-50 border-gray-200'}
        `}>
            {/* header */}
            <button
                onClick={() => setCollapsed(c => !c)}
                className={`
                    w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px]
                    ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-black/[0.02]'}
                    cursor-pointer
                    ${isDark ? 'text-zinc-400' : 'text-gray-500'}
                    transition-colors
                `}
            >
                <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.15 }}>
                    <ChevronDown className="w-3.5 h-3.5" />
                </motion.div>

                <span className="font-medium">
                    {runningN > 0
                        ? `Running ${runningN} action${runningN !== 1 ? 's' : ''}...`
                        : allGood
                            ? `${actions.length} action${actions.length !== 1 ? 's' : ''}`
                            : errN > 0
                                ? `${doneN} done, ${errN} failed`
                                : `${actions.length} action${actions.length !== 1 ? 's' : ''}`
                    }
                </span>

                {runningN > 0 && (
                    <span className="relative flex h-2 w-2 ml-auto">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400/40 animate-ping" />
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`} />
                    </span>
                )}

                {allActionsFinished && errN === 0 && runningN === 0 && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className="text-emerald-500 ml-auto"
                    >
                        <Check className="w-4 h-4" strokeWidth={2.5} />
                    </motion.span>
                )}

                {errN > 0 && allActionsFinished && (
                    <span className="text-red-400 ml-auto">
                        <X className="w-4 h-4" strokeWidth={2.5} />
                    </span>
                )}
            </button>

            {/* action rows */}
            <AnimatePresence initial={false}>
                {show && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                    >
                        <div className={`
                            px-3.5 pb-2.5 pt-0.5 space-y-0.5
                            border-t ${isDark ? 'border-[#232323]' : 'border-gray-200'}
                        `}>
                            <AnimatePresence initial={false}>
                                {deduplicated.map(({ action, count }) => (
                                    <ActionRow key={action.id} action={action} count={count} isDark={isDark} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
