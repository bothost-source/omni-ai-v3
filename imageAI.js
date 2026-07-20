// imageAI.js - AI Image Generation for Telegram
const { generateGeminiImage } = require('./utils/ai');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

async function downloadImage(url) {
  try {
    const { data } = await axios.get(url, { 
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return Buffer.from(data);
  } catch (e) {
    return null;
  }
}

module.exports = {
  async handleCommand(ctx, args) {
    if (!args) return ctx.reply('Usage: /generate <description> or /image <description>');

    await ctx.sendChatAction('upload_photo');

    try {
      // Try Gemini first
      const result = await generateGeminiImage(args);

      if (result.images && result.images.length) {
        for (const img of result.images.slice(0, 4)) {
          await ctx.replyWithPhoto(
            { source: Buffer.from(img.data) },
            { 
              caption: `🎨 ${args.slice(0, 100)}`,
              reply_to_message_id: ctx.message?.message_id
            }
          );
        }
        return;
      }
    } catch (e) {
      // Gemini failed, try Pollinations
    }

    // Fallback: Pollinations AI (free, no API key)
    try {
      await ctx.reply('🎨 Generating image...');

      const encodedPrompt = encodeURIComponent(args);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;

      // Download the image
      const imageBuffer = await downloadImage(imageUrl);

      if (imageBuffer) {
        const tempPath = path.join(process.cwd(), 'temp', `gen-${Date.now()}.jpg`);
        await fs.ensureDir(path.dirname(tempPath));
        await fs.writeFile(tempPath, imageBuffer);

        await ctx.replyWithPhoto(
          { source: tempPath },
          { 
            caption: `🎨 ${args.slice(0, 100)}`,
            reply_to_message_id: ctx.message?.message_id
          }
        );

        // Clean up temp file
        setTimeout(async () => {
          try { await fs.unlink(tempPath); } catch (e) {}
        }, 60000);

        return;
      }

      // If download failed, send URL as last resort
      return ctx.reply(`🎨 Image URL: ${imageUrl}

⚠️ Could not download image. Click link to view.`);
    } catch (e) {
      return ctx.reply(`❌ Image generation failed: ${e.message}`);
    }
  }
};
