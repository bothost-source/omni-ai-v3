// ═══════════════════════════════════════════════════════════
// OMNI AI - COMMAND HANDLER
// Processes all commands with security checks
// ═══════════════════════════════════════════════════════════

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const { CONFIG } = require('./config');
const security = require('./security');
const stickerHandler = require('./stickerHandler');
const mediaDownloader = require('./mediaDownloader');
const tmdbAPI = require('./tmdbAPI');
const fileUploader = require('./fileUploader');
const codeFormatter = require('./codeFormatter');

class CommandHandler {
    constructor() {
        this.activeOperations = new Map();
    }

    /**
     * Main command processor
     */
    async processCommand(ctx, text, userId) {
        const cleanText = text.trim().toLowerCase();
        const chatId = ctx.chat?.id;

        // 1. Check for jailbreak attempts FIRST
        const jailbreak = security.detectJailbreak(text);
        if (jailbreak.detected) {
            security.logEvent(userId, 'JAILBREAK_ATTEMPT', { text: text.substring(0, 100) });
            return await this.sendCleanMessage(ctx, jailbreak.response);
        }

        // 2. Check for sensitive file access
        const sensitive = security.checkSensitiveAccess(text);
        if (sensitive.blocked) {
            security.logEvent(userId, 'SENSITIVE_ACCESS_ATTEMPT', { text: text.substring(0, 100) });
            return await this.sendCleanMessage(ctx, sensitive.response);
        }

        // 3. Handle sticker messages (non-text) - REPLY WITH RANDOM STICKER
        if (ctx.message?.sticker) {
            return await stickerHandler.handleStickerReply(ctx, userId);
        }

        // 4. Route text commands
        if (cleanText.startsWith('/omni ')) {
            const command = cleanText.replace('/omni ', '').trim();
            return await this.handleOmniCommand(ctx, command, text, userId);
        }

        if (cleanText.startsWith('/auth ')) {
            return await this.handleAuth(ctx, text, userId);
        }

        if (cleanText === '/menu' || cleanText === '/help') {
            return await this.showMenu(ctx, userId);
        }

        // Default: AI conversation
        return await this.handleAIChat(ctx, text, userId);
    }

    /**
     * Handle "/omni" prefixed commands
     */
    async handleOmniCommand(ctx, command, fullText, userId) {
        const args = command.split(' ');
        const cmd = args[0];
        const rest = args.slice(1).join(' ');

        switch (cmd) {
            case 'run':
            case 'shell':
            case 'exec':
                return await this.handleRun(ctx, rest, userId);

            case 'ls':
            case 'list':
            case 'dir':
                return await this.handleList(ctx, userId);

            case 'cat':
            case 'read':
            case 'file':
                return await this.handleRead(ctx, rest, userId);

            case 'download':
            case 'movie':
            case 'music':
            case 'song':
                return await this.handleDownload(ctx, rest, userId, cmd);

            case 'scrape':
            case 'site':
            case 'web':
                return await this.handleScrape(ctx, rest, userId);

            case 'upload':
            case 'save':
                return await this.handleUpload(ctx, rest, userId);

            case 'learn':
            case 'remember':
            case 'saveinfo':
                return await this.handleLearn(ctx, rest, userId);

            case 'voice':
            case 'say':
            case 'tts':
                return await this.handleVoice(ctx, rest, userId);

            case 'movies':
            case 'latest':
            case 'tmdb':
                return await this.handleMovies(ctx, rest, userId);

            case 'code':
            case 'js':
            case 'py':
                return await this.handleCode(ctx, rest, userId, cmd);

            case 'sticker':
            case 'stickers':
                return await this.handleStickerInfo(ctx, userId);

            default:
                return await this.sendCleanMessage(ctx, 
                    `❓ *Unknown command: ${cmd}*\n\n` +
                    `📝 Use /menu to see all available commands.`);
        }
    }

    /**
     * Handle authentication
     */
    async handleAuth(ctx, text, userId) {
        const passcode = text.replace(/\/auth /i, '').trim();
        const result = security.authenticate(userId, passcode);

        if (result.success) {
            security.logEvent(userId, 'AUTH_SUCCESS');
        } else {
            security.logEvent(userId, 'AUTH_FAILED');
        }

        return await this.sendCleanMessage(ctx, result.success ? result.message : result.error);
    }

    /**
     * Handle run/shell commands - OWNER ONLY + AUTH REQUIRED
     */
    async handleRun(ctx, command, userId) {
        const auth = security.requireOwner(userId, 'run/shell');
        if (!auth.allowed) {
            return await this.sendCleanMessage(ctx, auth.response);
        }

        const jailbreak = security.detectJailbreak(`/omni run ${command}`);
        if (jailbreak.detected) {
            return await this.sendCleanMessage(ctx, jailbreak.response);
        }

        // Send initial status
        const statusMsg = await this.sendCleanMessage(ctx, 
            `⏳ *Executing command...*\n\n` +
            `📌 *Command:* \`\`\`${command}\`\`\`\n` +
            `🛡️ *User:* Owner\n` +
            `⏱️ Please wait...`);

        try {
            const { stdout, stderr } = await execPromise(command, {
                timeout: 30000,
                maxBuffer: 1024 * 1024,
                cwd: process.cwd(),
                env: { PATH: process.env.PATH }
            });

            const output = stdout || stderr || '✅ Command executed successfully (no output)';
            const truncated = output.length > 3000 
                ? output.substring(0, 3000) + '\n\n... [Output truncated - too long]' 
                : output;

            return await this.editMessage(ctx, statusMsg.message_id, 
                `✅ *Command Executed*\n\n` +
                `📌 *Command:* \`\`\`${command}\`\`\`\n\n` +
                `📤 *Output:*\n\`\`\`\n${truncated}\n\`\`\``);

        } catch (err) {
            return await this.editMessage(ctx, statusMsg.message_id, 
                `❌ *Command Failed*\n\n` +
                `📌 *Command:* \`\`\`${command}\`\`\`\n\n` +
                `⚠️ *Error:* ${err.message}`);
        }
    }

    /**
     * Handle ls/list - Lists files but NEVER sends them
     */
    async handleList(ctx, userId) {
        try {
            const files = await fs.readdir(process.cwd());
            const fileList = await Promise.all(files.map(async (f) => {
                const stats = await fs.stat(path.join(process.cwd(), f));
                const icon = stats.isDirectory() ? '📁' : '📄';
                const size = stats.isFile() ? ` (${(stats.size / 1024).toFixed(1)} KB)` : '';
                return `${icon} ${f}${size}`;
            }));

            return await this.sendCleanMessage(ctx, 
                `📂 *Directory Listing*\n\n` +
                `${fileList.join('\n')}\n\n` +
                `📊 *Total:* ${files.length} items\n\n` +
                `⚠️ *Note:* File contents are protected.\n` +
                `🔒 Owner access required to read files.`);

        } catch (err) {
            return await this.sendCleanMessage(ctx, 
                `❌ *Error listing files:* ${err.message}`);
        }
    }

    /**
     * Handle cat/read - OWNER ONLY + AUTH REQUIRED
     */
    async handleRead(ctx, filename, userId) {
        const auth = security.requireOwner(userId, 'read file');
        if (!auth.allowed) {
            return await this.sendCleanMessage(ctx, auth.response);
        }

        if (!filename) {
            return await this.sendCleanMessage(ctx, 
                `📝 *Usage:* /omni cat <filename>\n\n` +
                `📌 Example: /omni cat readme.txt`);
        }

        const sensitive = security.checkSensitiveAccess(filename);
        if (sensitive.blocked) {
            security.logEvent(userId, 'SENSITIVE_READ_ATTEMPT', { filename });
            return await this.sendCleanMessage(ctx, sensitive.response);
        }

        try {
            const filepath = path.join(process.cwd(), filename);

            if (!filepath.startsWith(process.cwd())) {
                throw new Error('Access denied: Path traversal detected');
            }

            if (!(await fs.pathExists(filepath))) {
                return await this.sendCleanMessage(ctx, 
                    `❌ *File not found:* ${filename}\n\n` +
                    `📝 Use /omni ls to list available files.`);
            }

            const stats = await fs.stat(filepath);
            if (stats.isDirectory()) {
                return await this.sendCleanMessage(ctx, 
                    `📁 *${filename}* is a directory.\n\n` +
                    `📝 Use /omni ls to list contents.`);
            }

            if (stats.size > 1024 * 1024) {
                return await this.sendCleanMessage(ctx, 
                    `⚠️ *File too large:* ${filename}\n` +
                    `📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n\n` +
                    `❌ Max allowed: 1 MB`);
            }

            const content = await fs.readFile(filepath, 'utf8');

            const ext = path.extname(filename);
            if (['.js', '.py', '.json', '.html', '.css'].includes(ext)) {
                return await codeFormatter.sendCode(ctx, content, filename);
            }

            return await this.sendCleanMessage(ctx, 
                `📄 *${filename}*\n\n` +
                `\`\`\`\n${content}\n\`\`\``);

        } catch (err) {
            return await this.sendCleanMessage(ctx, 
                `❌ *Error reading file:* ${err.message}`);
        }
    }

    /**
     * Handle movie/music downloads with images
     */
    async handleDownload(ctx, query, userId, type) {
        if (!query) {
            return await this.sendCleanMessage(ctx, 
                `📝 *Usage:* /omni ${type} <search query>\n\n` +
                `📌 Example: /omni movie Inception\n` +
                `📌 Example: /omni music Blinding Lights`);
        }

        const statusMsg = await this.sendCleanMessage(ctx, 
            `🔍 *Searching for ${type}...*\n\n` +
            `📌 Query: ${query}\n` +
            `⏳ Please wait...`);

        try {
            const result = await mediaDownloader.searchAndDownload(query, type);

            if (result.imageUrl) {
                await ctx.replyWithPhoto(result.imageUrl, { caption: result.caption });
                await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
            } else {
                await this.editMessage(ctx, statusMsg.message_id, result.caption);
            }

            if (result.mediaPath) {
                await ctx.replyWithDocument({ source: result.mediaPath, filename: result.fileName });
            }

        } catch (err) {
            await this.editMessage(ctx, statusMsg.message_id, 
                `❌ *Download failed:* ${err.message}\n\n` +
                `📝 Try a different search term.`);
        }
    }

    /**
     * Handle website scraping
     */
    async handleScrape(ctx, url, userId) {
        if (!url) {
            return await this.sendCleanMessage(ctx, 
                `📝 *Usage:* /omni scrape <url>\n\n` +
                `📌 Example: /omni scrape https://example.com`);
        }

        const statusMsg = await this.sendCleanMessage(ctx, 
            `🌐 *Scraping website...*\n\n` +
            `📌 URL: ${url}\n` +
            `⏳ Please wait...`);

        try {
            const result = await mediaDownloader.scrapeWebsite(url);

            await this.editMessage(ctx, statusMsg.message_id, 
                `✅ *Scrape Complete*\n\n` +
                `📌 *URL:* ${url}\n\n` +
                `📊 *Results:*\n${result}`);

        } catch (err) {
            await this.editMessage(ctx, statusMsg.message_id, 
                `❌ *Scrape failed:* ${err.message}`);
        }
    }

    /**
     * Handle file upload to server
     */
    async handleUpload(ctx, filename, userId) {
        const auth = security.requireOwner(userId, 'upload file');
        if (!auth.allowed) {
            return await this.sendCleanMessage(ctx, auth.response);
        }

        const document = ctx.message?.reply_to_message?.document || 
                        ctx.message?.reply_to_message?.photo ||
                        ctx.message?.reply_to_message?.video;

        if (!document) {
            return await this.sendCleanMessage(ctx, 
                `📝 *Usage:* Reply to a file with /omni upload [filename]\n\n` +
                `📌 The file will be saved to the server directory.`);
        }

        const statusMsg = await this.sendCleanMessage(ctx, 
            `📤 *Uploading file...*\n` +
            `⏳ Please wait...`);

        try {
            const result = await fileUploader.saveFile(ctx, filename);

            await this.editMessage(ctx, statusMsg.message_id, 
                `✅ *Upload Complete*\n\n` +
                `📌 *Filename:* ${result.filename}\n` +
                `📂 *Path:* ${result.path}\n` +
                `📊 *Size:* ${result.size}`);

        } catch (err) {
            await this.editMessage(ctx, statusMsg.message_id, 
                `❌ *Upload failed:* ${err.message}`);
        }
    }

    /**
     * Handle learning/memory
     */
    async handleLearn(ctx, info, userId) {
        if (!info) {
            return await this.sendCleanMessage(ctx, 
                `📝 *Usage:* /omni learn <information to remember>\n\n` +
                `📌 Example: /omni learn My favorite color is blue`);
        }

        try {
            const result = await fileUploader.saveToMemory(userId, info);

            return await this.sendCleanMessage(ctx, 
                `🧠 *Learning Complete*\n\n` +
                `✅ Saved: "${info}"\n\n` +
                `📊 Total memories: ${result.count}`);

        } catch (err) {
            return await this.sendCleanMessage(ctx, 
                `❌ *Error saving memory:* ${err.message}`);
        }
    }

    /**
     * Handle voice notes - Telegram format
     */
    async handleVoice(ctx, text, userId) {
        if (!text) {
            return await this.sendCleanMessage(ctx, 
                `📝 *Usage:* /omni voice <text>\n\n` +
                `📌 Example: /omni voice Hello, how are you?`);
        }

        const statusMsg = await this.sendCleanMessage(ctx, 
            `🎙️ *Generating voice note...*\n` +
            `⏳ Please wait...`);

        try {
            const result = await mediaDownloader.textToVoice(text);

            await ctx.replyWithVoice({ source: result.path }, {
                reply_to_message_id: ctx.message?.message_id
            });

            await this.editMessage(ctx, statusMsg.message_id, 
                `✅ *Voice note sent!*\n\n` +
                `🎙️ Duration: ${result.duration}s`);

            // Clean up temp file
            setTimeout(async () => {
                try {
                    await fs.unlink(result.path);
                } catch (e) {}
            }, 60000);

        } catch (err) {
            await this.editMessage(ctx, statusMsg.message_id, 
                `❌ *Voice generation failed:* ${err.message}\n\n` +
                `⚠️ Make sure ffmpeg is installed.`);
        }
    }

    /**
     * Handle TMDB latest movies
     */
    async handleMovies(ctx, query, userId) {
        const statusMsg = await this.sendCleanMessage(ctx, 
            `🎬 *Fetching latest movies...*\n` +
            `⏳ Please wait...`);

        try {
            const movies = await tmdbAPI.getLatestMovies(query || 'popular');

            for (const movie of movies.slice(0, 5)) {
                if (movie.posterUrl) {
                    await ctx.replyWithPhoto(movie.posterUrl, {
                        caption: `🎥 *${movie.title}* (${movie.year})\n⭐ ${movie.rating}/10`
                    });
                }
            }

            let response = `🎬 *Latest Movies*\n\n`;
            for (const movie of movies.slice(0, 5)) {
                response += `🎥 *${movie.title}* (${movie.year})\n`;
                response += `⭐ Rating: ${movie.rating}/10\n`;
                response += `📝 ${movie.overview.substring(0, 100)}...\n\n`;
            }

            await this.editMessage(ctx, statusMsg.message_id, response);

        } catch (err) {
            await this.editMessage(ctx, statusMsg.message_id, 
                `❌ *Failed to fetch movies:* ${err.message}\n\n` +
                `📝 Make sure TMDB API key is configured in config.js`);
        }
    }

    /**
     * Handle code sending with Telegram format
     */
    async handleCode(ctx, query, userId, type) {
        const auth = security.requireOwner(userId, 'code generation');
        if (!auth.allowed) {
            return await this.sendCleanMessage(ctx, auth.response);
        }

        if (!query) {
            return await this.sendCleanMessage(ctx, 
                `📝 *Usage:* /omni ${type} <description>\n\n` +
                `📌 Example: /omni js create a calculator`);
        }

        const statusMsg = await this.sendCleanMessage(ctx, 
            `💻 *Generating ${type.toUpperCase()} code...*\n` +
            `⏳ Please wait...`);

        try {
            const code = `// Generated ${type.toUpperCase()} code\n// Request: ${query}\n\n// Your code here...`;

            await codeFormatter.sendCode(ctx, code, `generated.${type === 'js' ? 'js' : 'py'}`);

            await this.editMessage(ctx, statusMsg.message_id, 
                `✅ *Code generated and sent!*\n\n` +
                `📌 Format: Telegram Markdown\n` +
                `💾 File: generated.${type === 'js' ? 'js' : 'py'}`);

        } catch (err) {
            await this.editMessage(ctx, statusMsg.message_id, 
                `❌ *Code generation failed:* ${err.message}`);
        }
    }

    /**
     * Handle sticker info
     */
    async handleStickerInfo(ctx, userId) {
        const count = stickerHandler.getStickerCount();
        const isOwner = security.isOwner(userId);

        let info = `🎨 *Sticker Pack Info*\n\n`;
        info += `📊 *Saved stickers:* ${count}\n`;
        info += `📂 *Directory:* ${CONFIG.STICKERS?.STICKER_PACK_PATH || './data/sticker-pack'}\n\n`;
        info += `📝 *How it works:*\n`;
        info += `1. Send any sticker to this bot\n`;
        info += `2. I save it automatically\n`;
        info += `3. When you send a sticker, I reply with a random one!\n\n`;

        if (isOwner) {
            info += `🔐 *Owner Commands:*\n`;
            info += `• Send sticker to save it\n`;
            info += `• Sticker replies are automatic\n`;
        }

        return await this.sendCleanMessage(ctx, info);
    }

    /**
     * Show menu - Hides owner commands from public
     */
    async showMenu(ctx, userId) {
        const isOwner = security.isOwner(userId);
        const isAuth = security.isAuthenticated(userId);

        let menu = `🤖 *OMNI AI - COMMAND MENU*\n\n`;

        menu += `📌 *GENERAL COMMANDS*\n`;
        menu += `• /menu - Show this menu\n`;
        menu += `• /help - Get help\n`;
        menu += `• /omni ls - List files (names only)\n`;
        menu += `• /omni sticker - Sticker pack info\n\n`;

        menu += `🎬 *MEDIA COMMANDS*\n`;
        menu += `• /omni movie <name> - Download movie with poster\n`;
        menu += `• /omni music <name> - Download music with cover\n`;
        menu += `• /omni movies - Latest movies from TMDB\n`;
        menu += `• /omni voice <text> - Text to voice note\n\n`;

        menu += `🌐 *WEB COMMANDS*\n`;
        menu += `• /omni scrape <url> - Scrape website\n\n`;

        menu += `🧠 *AI COMMANDS*\n`;
        menu += `• /omni learn <text> - Teach me something\n`;
        menu += `• Just chat normally - AI conversation\n\n`;

        if (isOwner && isAuth) {
            menu += `\n🔐 *OWNER COMMANDS* (Authenticated)\n`;
            menu += `• /omni run <cmd> - Execute shell commands\n`;
            menu += `• /omni cat <file> - Read file contents\n`;
            menu += `• /omni upload - Upload file to server\n`;
            menu += `• /omni js <desc> - Generate JS code\n`;
            menu += `• /omni py <desc> - Generate Python code\n\n`;
        } else if (isOwner && !isAuth) {
            menu += `\n🔐 *OWNER COMMANDS* (Locked)\n`;
            menu += `⚠️ Use /auth [passcode] to unlock\n`;
            menu += `• /omni run <cmd> - Execute shell commands\n`;
            menu += `• /omni cat <file> - Read file contents\n`;
            menu += `• /omni upload - Upload file to server\n\n`;
        }

        menu += `⚠️ *SECURITY NOTICE*\n`;
        menu += `🔒 Sensitive commands require owner authentication\n`;
        menu += `🛡️ Jailbreak attempts are logged and blocked\n`;
        menu += `📵 File contents are protected from unauthorized access\n\n`;

        if (isOwner) {
            menu += `👑 *You are the Owner*\n`;
            if (!isAuth) menu += `🔓 Use /auth [passcode] to unlock full access\n`;
            else menu += `✅ Full access granted\n`;
        }

        return await this.sendCleanMessage(ctx, menu);
    }

    /**
     * Handle AI chat
     */
    async handleAIChat(ctx, text, userId) {
        const responses = [
            `🤖 *OMNI AI*\n\nI received your message. I'm currently in learning mode.\n\n📝 Try these commands:\n• /menu - Show all commands\n• /omni movie <name> - Download movies\n• /omni music <name> - Download music`,
        ];

        return await this.sendCleanMessage(ctx, responses[0]);
    }

    // ═══════════════════════════════════════════════════════════
    // CLEAN MESSAGE HELPERS (Telegraf ctx)
    // ═══════════════════════════════════════════════════════════

    /**
     * Send a new message
     */
    async sendCleanMessage(ctx, text) {
        return await ctx.reply(text, { parse_mode: 'Markdown' });
    }

    /**
     * Edit an existing message
     */
    async editMessage(ctx, messageId, newText) {
        try {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                messageId,
                undefined,
                newText,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            // Fallback: send new message if edit fails
            await ctx.reply(newText, { parse_mode: 'Markdown' });
        }
    }
}

module.exports = new CommandHandler();
