# Contributing to Glovix

Thank you for your interest in contributing to Glovix! We welcome contributions from the community.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/glovixtech.git`
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Test locally: `pnpm dev`
7. Build check: `pnpm build`
8. Commit: `git commit -m "Add your feature"`
9. Push: `git push origin feature/your-feature-name`
10. Open a Pull Request

## Development Setup

```bash
pnpm install
cp .env.example .env
# Add your AI API key to .env
pnpm dev
```

## Project Architecture

- **Components** (`src/components/`) — React UI components
- **Libraries** (`src/lib/`) — Core logic: AI communication, tools, WebContainer management
- **Store** (`src/store/`) — Zustand state management
- **Styling** — Tailwind CSS utility classes, dark/light theme support

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai.ts` | AI API streaming, message handling |
| `src/lib/tools.ts` | All 18 AI tools (file ops, terminal, search, etc.) |
| `src/lib/systemPrompts.ts` | AI system prompt |
| `src/lib/webcontainer.ts` | WebContainer boot, file mounting, process management |
| `src/components/Chat.tsx` | Main chat UI with tool execution loop |
| `src/store/index.ts` | Global state (messages, files, settings) |

## Code Style

- TypeScript for all code (strict mode)
- Tailwind CSS for styling (no CSS modules)
- Functional components with hooks
- Zustand for state (individual selectors, not destructuring)
- `pnpm` as package manager
- Meaningful commit messages

## Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Update README.md if adding user-facing features
- Ensure `pnpm build` passes with no errors
- Follow existing code patterns and naming conventions
- Test in Chrome (WebContainers require Chrome-based browsers)

## Reporting Issues

- Use the GitHub issue tracker
- Provide clear description and steps to reproduce
- Include browser version and OS
- Add screenshots or error logs if relevant

## Questions?

Open an issue for any questions or discussions.
