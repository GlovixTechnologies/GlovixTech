# Glovix Open Source

<div align="center">
  <img src="public/logo.png" alt="Glovix Logo" width="120" />
  <h3>AI-Powered Web Development Environment</h3>
  <p>Build, run, and debug web applications directly in your browser</p>
</div>

## ✨ Features

- 🤖 **AI Assistant** - Intelligent code generation and debugging
- 💻 **In-Browser Node.js** - Full Node.js environment powered by WebContainers
- 📝 **Monaco Editor** - VS Code-like editing experience
- 🎨 **Live Preview** - Real-time application preview
- 🔧 **Terminal** - Built-in terminal for running commands
- 📁 **File Explorer** - Intuitive file management
- 🌓 **Dark/Light Theme** - Customizable appearance
- 💾 **Local Storage** - No backend required, runs entirely in browser

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Chrome-based browser (required for WebContainers)
- AI Provider API Key (OpenAI, Anthropic, or compatible endpoint)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/glovix/glovixtech.git
    cd glovixtech
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    ```bash
    cp .env.example .env
    ```
    
    Edit `.env` and add your API keys:
    ```env
    VITE_USE_LOCAL_STORAGE=true
    VITE_AI_ENDPOINT=https://api.openai.com/v1/chat/completions
    VITE_AI_API_KEY=your_api_key_here
    VITE_AI_MODEL=gpt-4
    VITE_TAVILY_API_KEY=your_tavily_key_here
    ```

4.  **Start the Development Server**:
    ```bash
    npm run dev
    ```

5.  **Open in Browser**:
    Navigate to `http://localhost:5174`

## 🔧 Configuration

### Backend-less Mode

Set `VITE_USE_LOCAL_STORAGE=true` to enable local-only mode:
- Authentication: Auto-login with demo user
- Data Storage: All data stored in browser localStorage
- No Backend Required: Runs entirely client-side

### AI Provider Setup

Glovix supports any OpenAI-compatible API endpoint:

- **OpenAI**: `https://api.openai.com/v1/chat/completions`
- **Anthropic**: Use with proxy
- **Local Models**: Point to your local LLM server
- **Custom Endpoints**: Any compatible API

### Web Search (Optional)

For AI web search capabilities, add a Tavily API key:
```env
VITE_TAVILY_API_KEY=your_key_here
```

Get your key at: https://tavily.com

## 🏗️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Editor**: Monaco Editor
- **Runtime**: WebContainer API
- **State**: Zustand
- **Routing**: React Router
- **Terminal**: xterm.js

## 📦 Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory. Deploy to any static hosting service.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [WebContainer API](https://webcontainers.io/) by StackBlitz
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) by Microsoft
- All our amazing contributors

## 📞 Support
- 📧 Email: mail@askhub.tech

---

<div align="center">
  Made with ❤️ by the Glovix Team
</div>
