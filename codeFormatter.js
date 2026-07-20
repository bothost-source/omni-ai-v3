// ═══════════════════════════════════════════════════════════
// OMNI AI - CODE FORMATTER
// Sends code using Telegram Markdown code blocks + document
// ═══════════════════════════════════════════════════════════

const fs = require('fs-extra');
const path = require('path');

class CodeFormatter {
    constructor() {
        this.tempDir = path.join(process.cwd(), 'temp_code');
        this.ensureDir();
    }

    async ensureDir() {
        await fs.ensureDir(this.tempDir);
    }

    /**
     * Send code as Telegram document with proper formatting
     * Uses Telegram Markdown style with ``` code blocks
     */
    async sendCode(ctx, code, filename, options = {}) {
        try {
            const ext = path.extname(filename) || '.js';
            const langMap = {
                '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
                '.java': 'java', '.cpp': 'cpp', '.c': 'c', '.go': 'go',
                '.rs': 'rust', '.rb': 'ruby', '.php': 'php', '.sh': 'bash',
                '.html': 'html', '.css': 'css', '.json': 'json', '.sql': 'sql',
                '.md': 'markdown', '.yml': 'yaml', '.yaml': 'yaml', '.xml': 'xml'
            };
            const lang = langMap[ext] || 'code';

            // 1. Send formatted code message with Telegram native code block
            const formattedMessage = 
                `💻 *Code: \\${filename}*\n\n` +
                `\`\`\`${lang}\n` +
                `${code}\n` +
                `\`\`\`\n\n` +
                `📋 *Copy the code above*\n` +
                `📥 *Or download the file below*\n\n` +
                `⚠️ *Use at your own risk*`;

            const replyOptions = { parse_mode: 'Markdown' };
            if (options.replyToMessageId) {
                replyOptions.reply_to_message_id = options.replyToMessageId;
            }

            await ctx.reply(formattedMessage, replyOptions);

            // 2. Also send as document file for easy download
            const tempFile = path.join(this.tempDir, filename);
            await fs.writeFile(tempFile, code);

            const docOptions = { caption: `📄 ${filename}` };
            if (options.replyToMessageId) {
                docOptions.reply_to_message_id = options.replyToMessageId;
            }

            await ctx.replyWithDocument(
                { source: tempFile, filename },
                docOptions
            );

            // Clean up temp file after delay
            setTimeout(async () => {
                try {
                    await fs.unlink(tempFile);
                } catch (e) {}
            }, 300000); // 5 minutes

            return { success: true };

        } catch (err) {
            console.error('[CODE] Error sending code:', err);
            throw err;
        }
    }

    /**
     * Format code with line numbers for display
     */
    formatWithLineNumbers(code) {
        const lines = code.split('\n');
        return lines.map((line, i) => `${(i + 1).toString().padStart(3, '0')}| ${line}`).join('\n');
    }
}

module.exports = new CodeFormatter();
