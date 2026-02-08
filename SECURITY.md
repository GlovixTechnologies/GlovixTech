# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Glovix, please report it by emailing security@glovix.tech.

**Please do not report security vulnerabilities through public GitHub issues.**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Time

- We will acknowledge your email within 48 hours
- We will provide a detailed response within 7 days
- We will work on a fix and keep you updated on progress

## Security Best Practices

When using Glovix:

1. **API Keys**: Never commit API keys to version control
2. **Environment Variables**: Always use `.env` files for sensitive data
3. **HTTPS**: Use HTTPS endpoints for AI providers
4. **Updates**: Keep dependencies up to date
5. **Browser**: Use latest Chrome-based browser for WebContainer security

## Known Security Considerations

- WebContainer API requires specific CORS headers
- Local storage is used for data persistence in backend-less mode
- API keys are stored in browser localStorage (use with caution)
- External images may require referrerPolicy for CORS

Thank you for helping keep Glovix secure!
