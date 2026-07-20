/**
 * AI  Help Command
 * Created by: lordtarrific
 */

function buildHelpText(prefix = '/') {
  return `🤖 *AI assistant* — Your Advanced Telegram Agent
_Created by lordtarrific_

*Chat Commands:*
${prefix}help — Show this message
${prefix}model — Check current AI model
${prefix}groq — Switch to Groq AI
${prefix}gemini — Switch to Gemini AI
${prefix}logs — View recent bot logs
${prefix}workspace — List your workspace files
${prefix}getfile <path> — Send a file from workspace
${prefix}run <command> — Run terminal command
${prefix}gitpush — Push workspace to GitHub

*Media Commands:*
${prefix}play <song> — Download song
${prefix}video <url> — Download video from URL
${prefix}image <prompt> — Generate AI image
${prefix}voice <text> — Text to speech

*Dev Commands:*
${prefix}llamacoder <idea> — Build React app
${prefix}users — List users (admin only)
${prefix}ban <id> — Ban user (admin only)
${prefix}unban <id> — Unban user (admin only)
${prefix}resetuser <id> — Reset user limits (admin only)

*Movie Commands:*
${prefix}movie <name> — Search movies (OMDB)
${prefix}moviedetail <IMDb ID> — Get details & watch links
${prefix}movietv <ID> <S> <E> — TV episode links
${prefix}movieprovider — List providers
${prefix}tmdb <name> — Search recent movies (TMDB)
${prefix}nowplaying — Movies in theaters now
${prefix}popular — Popular movies
${prefix}toprated — Top rated movies
${prefix}pdmovie <name> — Search public domain movies

*Download Commands:*
${prefix}apk <app name> — Download APK file
${prefix}download <url> — Download any file from URL

*Natural Commands:*
Just mention me or reply to my messages
- "download [song]" — Music
- "generate [prompt]" — Image
- "sticker" — Reply to image to make sticker
- "download [movie]" — Public domain movie
- "movie [name]" — Search movies
- "apk [app name]" — Download APK

💡 *Tip:* Add GROQ_API_KEY or GEMINI_API_KEY to .env for full AI power!`;
}

module.exports = { buildHelpText };
