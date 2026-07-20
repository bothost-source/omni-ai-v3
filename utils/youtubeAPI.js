const axios = require('axios');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_BASE_URL = 'https://www.googleapis.com/youtube/v3';

// Check if YouTube API is configured
function isConfigured() {
  return Boolean(YOUTUBE_API_KEY && YOUTUBE_API_KEY.length > 10);
}

// Search YouTube videos
async function searchVideos(query, maxResults = 5) {
  if (!isConfigured()) {
    return { success: false, error: 'YouTube API not configured. Set YOUTUBE_API_KEY in .env' };
  }

  try {
    const { data } = await axios.get(`${YOUTUBE_BASE_URL}/search`, {
      params: {
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: maxResults,
        key: YOUTUBE_API_KEY,
        videoEmbeddable: true
      },
      timeout: 15000
    });

    if (!data.items || !data.items.length) {
      return { success: false, error: 'No videos found' };
    }

    const videos = data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      url: `https://youtube.com/watch?v=${item.id.videoId}`
    }));

    return { success: true, videos };
  } catch (error) {
    console.error('YouTube API error:', error.response?.data?.error?.message || error.message);
    return { success: false, error: error.response?.data?.error?.message || 'YouTube API error' };
  }
}

// Get video details (duration, etc)
async function getVideoDetails(videoId) {
  if (!isConfigured()) return null;

  try {
    const { data } = await axios.get(`${YOUTUBE_BASE_URL}/videos`, {
      params: {
        part: 'contentDetails,snippet,statistics',
        id: videoId,
        key: YOUTUBE_API_KEY
      },
      timeout: 15000
    });

    if (!data.items || !data.items.length) return null;

    const video = data.items[0];
    return {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.medium?.url,
      channel: video.snippet.channelTitle,
      duration: video.contentDetails.duration, // PT4M30S format
      viewCount: video.statistics?.viewCount,
      likeCount: video.statistics?.likeCount,
      url: `https://youtube.com/watch?v=${video.id}`
    };
  } catch (error) {
    console.error('YouTube details error:', error.message);
    return null;
  }
}

// Format duration from PT4M30S to readable
function formatDuration(isoDuration) {
  if (!isoDuration) return '';
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const seconds = match[3] ? parseInt(match[3]) : 0;

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Format search results for chat
function formatVideoResults(videos, query) {
  if (!videos?.length) return '❌ No videos found.';

  let text = `🎬 *YouTube Results for "${query}"*\n\n`;

  videos.forEach((video, i) => {
    text += `${i + 1}. *${video.title}*\n`;
    text += `   👤 ${video.channel}\n`;
    text += `   🔗 ${video.url}\n\n`;
  });

  text += `Reply with a number to get the video!`;
  return text;
}

// Format single video for sending
function formatVideoMessage(video) {
  const duration = formatDuration(video.duration);
  const views = video.viewCount ? `👁️ ${parseInt(video.viewCount).toLocaleString()} views` : '';

  return `🎬 *${video.title}*\n\n👤 ${video.channel}\n⏱️ ${duration}\n${views}\n\n🔗 ${video.url}`;
}

// Check if text is asking for a YouTube video
function isYouTubeRequest(text = '') {
  const lower = String(text).toLowerCase();
  const patterns = [
    /\b(get|find|show|play|send|give).{0,20}(me|us).{0,30}(video|youtube|trailer|clip|movie)/i,
    /\b(trailer|clip|video).{0,20}(for|of|about|from)/i,
    /\b(youtube|yt).{0,20}(search|find|get)/i,
    /\b(search|look).{0,20}(youtube|video)/i,
    /\b(can you|could you|please).{0,30}(get|find|show|play).{0,30}(video|trailer|clip|youtube)/i,
    /\b(i want|i need|i\'d like).{0,30}(video|trailer|clip|youtube)/i,
    /\b(what is|where is|how to watch).{0,30}(trailer|video|clip)/i,
    /\b(show|send).{0,20}(me|us).{0,20}(a|the).{0,20}(video|trailer|clip)/i,
  ];
  return patterns.some(p => p.test(lower));
}

// Extract search query from YouTube request
function extractYouTubeQuery(text = '') {
  const lower = String(text).toLowerCase();

  // Remove common prefixes
  let query = text
    .replace(/\b(can you|could you|please|can u|could u)\b/gi, '')
    .replace(/\b(get|find|show|play|send|give)\s+(me|us)\b/gi, '')
    .replace(/\b(i want|i need|i\'d like)\b/gi, '')
    .replace(/\b(search|look)\s+(for|on|youtube|yt)\b/gi, '')
    .replace(/\b(a|the)\s+(video|trailer|clip|movie|youtube)\s+(of|for|about|from)\b/gi, '')
    .replace(/\b(the|a)\s+(trailer|clip|video|movie)\s+(for|of)\b/gi, '')
    .replace(/\b(youtube|yt)\b/gi, '')
    .replace(/\b(video|trailer|clip|movie)\b/gi, '')
    .replace(/\b(show|send|play|get|find)\s+(me|us)\b/gi, '')
    .replace(/[?!.]/g, '')
    .trim();

  return query || text; // Fallback to original if stripping removed everything
}

module.exports = {
  searchVideos,
  getVideoDetails,
  formatVideoResults,
  formatVideoMessage,
  formatDuration,
  isYouTubeRequest,
  extractYouTubeQuery,
  isConfigured
};