const axios = require('axios');

const BASE_URL = 'https://gzmovieboxapi.septorch.tech/api';
const API_KEY = process.env.MOVIE_API_KEY || 'Godszeal';

// Helper to make API requests
async function apiRequest(endpoint, params = {}) {
  try {
    const { data } = await axios.get(`${BASE_URL}${endpoint}`, {
      params: { ...params, apikey: API_KEY },
      timeout: 30000,
      validateStatus: () => true
    });
    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error.message);
    return null;
  }
}

// Search movies/TV shows
async function searchMovies(query, limit = 5) {
  const data = await apiRequest('/search', {
    query,
    subjectType: 'ALL',
    page: 1,
    perPage: Math.max(limit, 24)
  });

  if (!data || data.status === 'error') {
    return { success: false, error: data?.error || 'No results found' };
  }

  const results = Array.isArray(data) ? data : data.results || data.data || [];

  if (!results.length) {
    return { success: false, error: 'No movies found' };
  }

  return {
    success: true,
    source: 'GZMovie',
    query,
    count: results.length,
    results: results.slice(0, limit).map(r => ({
      id: r.subjectId || r.id || '',
      type: r.subjectType === 6 || (r.title?.toLowerCase().includes('series') || r.title?.toLowerCase().includes('episode')) ? 'tv' : 'movie',
      title: r.title?.replace(/^\s*Watch\s+/i, '').replace(/^\s*Download\s+/i, '').trim() || 'Unknown',
      year: r.releaseDate ? r.releaseDate.split('-')[0] : (r.year || ''),
      synopsis: r.description || r.synopsis || '',
      rating: parseFloat(r.imdbRatingValue) || 0,
      duration: r.duration || '',
      director: r.director || '',
      country: r.country || '',
      quality: r.quality || '',
      poster: r.cover?.url || r.thumbnail || r.poster || '',
      thumbnail: r.thumbnail || r.cover?.url || r.poster || '',
      url: r.url || '',
      detailPath: r.detailPath || '',
      subjectId: r.subjectId || r.id || '',
      hasResource: r.hasResource || false,
      genre: r.genre || '',
      downloads: {}
    }))
  };
}

// Get movie details
async function getMovieDetails(id, type = 'movie') {
  const searchData = await apiRequest('/search', {
    query: id.toString(),
    subjectType: 'ALL',
    page: 1,
    perPage: 5
  });

  const results = Array.isArray(searchData) ? searchData : searchData?.results || searchData?.data || [];
  const match = results.find(r => (r.subjectId || r.id) === id);

  if (!match) return null;

  const detailData = await apiRequest('/media', {
    subjectId: match.subjectId || match.id,
    detailPath: match.detailPath || ''
  });

  if (!detailData || detailData.status === 'error') {
    return {
      id: match.subjectId || match.id,
      type: match.subjectType === 6 || (match.title?.toLowerCase().includes('series')) ? 'tv' : 'movie',
      title: match.title?.replace(/^\s*Watch\s+/i, '').replace(/^\s*Download\s+/i, '').trim() || 'Unknown',
      year: match.releaseDate ? match.releaseDate.split('-')[0] : (match.year || ''),
      synopsis: match.description || match.synopsis || '',
      rating: parseFloat(match.imdbRatingValue) || 0,
      duration: match.duration || '',
      director: match.director || '',
      country: match.country || '',
      quality: match.quality || '',
      poster: match.cover?.url || match.thumbnail || match.poster || '',
      thumbnail: match.thumbnail || match.cover?.url || match.poster || '',
      url: match.url || '',
      detailPath: match.detailPath || '',
      subjectId: match.subjectId || match.id || '',
      hasResource: match.hasResource || false,
      genre: match.genre || '',
      downloads: {}
    };
  }

  const downloads = {};

  if (detailData.streamUrl || detailData.stream_url || detailData.videoUrl) {
    downloads['Stream'] = { 'Primary': detailData.streamUrl || detailData.stream_url || detailData.videoUrl };
  }
  if (detailData.downloadUrl || detailData.download_url) {
    downloads['Download'] = { 'Primary': detailData.downloadUrl || detailData.download_url };
  }
  if (detailData.sources && Array.isArray(detailData.sources)) {
    detailData.sources.forEach((src, i) => {
      const quality = src.quality || src.label || `Source ${i + 1}`;
      if (!downloads[quality]) downloads[quality] = {};
      downloads[quality][src.name || 'Link'] = src.url || src.file || src.src;
    });
  }
  if (detailData.links && Array.isArray(detailData.links)) {
    detailData.links.forEach((link, i) => {
      const quality = link.quality || link.label || `Link ${i + 1}`;
      if (!downloads[quality]) downloads[quality] = {};
      downloads[quality][link.name || 'Direct'] = link.url || link.href;
    });
  }

  const responseStr = JSON.stringify(detailData);
  const m3u8Matches = responseStr.match(/https?:\/\/[^\s"\']+\.m3u8/g);
  const mp4Matches = responseStr.match(/https?:\/\/[^\s"\']+\.mp4/g);

  if (m3u8Matches && m3u8Matches.length) {
    if (!downloads['HLS Stream']) downloads['HLS Stream'] = {};
    m3u8Matches.forEach((url, i) => {
      downloads['HLS Stream'][`Source ${i + 1}`] = url;
    });
  }
  if (mp4Matches && mp4Matches.length) {
    if (!downloads['MP4']) downloads['MP4'] = {};
    mp4Matches.forEach((url, i) => {
      downloads['MP4'][`Source ${i + 1}`] = url;
    });
  }

  return {
    id: match.subjectId || match.id,
    type: match.subjectType === 6 || (match.title?.toLowerCase().includes('series')) ? 'tv' : 'movie',
    title: match.title?.replace(/^\s*Watch\s+/i, '').replace(/^\s*Download\s+/i, '').trim() || 'Unknown',
    year: match.releaseDate ? match.releaseDate.split('-')[0] : (match.year || ''),
    synopsis: detailData.description || detailData.synopsis || match.description || match.synopsis || '',
    rating: parseFloat(detailData.imdbRatingValue || match.imdbRatingValue) || 0,
    duration: detailData.duration || match.duration || '',
    director: detailData.director || match.director || '',
    country: detailData.country || match.country || '',
    quality: detailData.quality || match.quality || '',
    poster: detailData.cover?.url || detailData.poster || match.cover?.url || match.thumbnail || match.poster || '',
    thumbnail: detailData.thumbnail || match.thumbnail || detailData.cover?.url || match.cover?.url || match.poster || '',
    url: detailData.url || match.url || '',
    detailPath: match.detailPath || '',
    subjectId: match.subjectId || match.id || '',
    hasResource: detailData.hasResource || match.hasResource || false,
    genre: detailData.genre || match.genre || '',
    downloads
  };
}

// Format download links
function formatDownloadLinks(movie) {
  if (!movie?.downloads || Object.keys(movie.downloads).length === 0) {
    return '❌ No download links available.';
  }

  let text = `📥 *Download/Stream Links for ${movie.title}*\n\n`;

  for (const [quality, sources] of Object.entries(movie.downloads)) {
    text += `*${quality}:*\n`;
    for (const [name, url] of Object.entries(sources)) {
      text += `• ${name}: ${url}\n`;
    }
    text += `\n`;
  }

  return text;
}

// Format search results
function formatSearchResults(results, max = 5) {
  if (!results?.length) return '❌ No movies found.';

  let text = `🎬 *Search Results* (${results.length} found)\n\n`;

  results.slice(0, max).forEach((movie, i) => {
    const type = movie.type === 'tv' ? '📺 TV' : '🎬 Movie';
    const rating = movie.rating ? `⭐ ${movie.rating.toFixed(1)}` : '';
    const year = movie.year ? `(${movie.year})` : '';
    const quality = movie.quality ? `[${movie.quality}]` : '';
    const hasRes = movie.hasResource ? '✅' : '❌';

    text += `${i + 1}. ${type} *${movie.title}* ${year} ${rating} ${quality} ${hasRes}\n`;
    if (movie.synopsis) {
      text += `   _${movie.synopsis.slice(0, 60)}..._\n`;
    }
    text += `\n`;
  });

  text += `Reply with a number to get details & download links!`;
  return text;
}

// Format movie details
function formatMovieDetails(movie) {
  if (!movie) return '❌ Movie not found.';

  const type = movie.type === 'tv' ? '📺 TV Series' : '🎬 Movie';
  const rating = movie.rating ? `⭐ ${movie.rating.toFixed(1)}/10` : '';
  const year = movie.year ? `📅 ${movie.year}` : '';
  const quality = movie.quality ? `🎞️ ${movie.quality}` : '';
  const duration = movie.duration ? `⏱️ ${movie.duration}` : '';
  const genre = movie.genre ? `🎭 ${movie.genre}` : '';

  let text = `${type}: *${movie.title}*\n`;
  text += `${rating} ${year} ${quality} ${duration} ${genre}\n\n`;

  if (movie.synopsis) {
    text += `📝 ${movie.synopsis.slice(0, 300)}\n\n`;
  }

  if (movie.url) {
    text += `🔗 Watch: ${movie.url}\n`;
  }

  return text;
}

// Get flag emoji
function getFlagEmoji(countryCode) {
  const flags = {
    'GB': '🇬🇧', 'US': '🇺🇸', 'IN': '🇮🇳', 'FR': '🇫🇷', 'ES': '🇪🇸',
    'PT': '🇵🇹', 'DE': '🇩🇪', 'IT': '🇮🇹', 'JP': '🇯🇵', 'TR': '🇹🇷',
    'RU': '🇷🇺', 'BR': '🇧🇷', 'SA': '🇸🇦', 'AU': '🇦🇺', 'CA': '🇨🇦',
    'KR': '🇰🇷', 'MX': '🇲🇽', 'NL': '🇳🇱', 'ID': '🇮🇩', 'USA': '🇺🇸',
    'UK': '🇬🇧', 'PH': '🇵🇭', 'NG': '🇳🇬', 'ZA': '🇿🇦'
  };
  return flags[countryCode?.toUpperCase()] || '🌐';
}

// Get all provider watch URLs
function getAllProviderUrls(id, type = 'movie', season, episode) {
  return {
    'GZMovie': `https://gzmovieboxapi.septorch.tech/api/media?apikey=${API_KEY}&subjectId=${id}`
  };
}

// Get providers list
function getProviders() {
  return [
    { name: 'GZMovie API', key: 'gzmovie', url: BASE_URL }
  ];
}

// Format watch links
function formatWatchLinks(movie) {
  if (!movie?.downloads || Object.keys(movie.downloads).length === 0) {
    return '❌ No stream links available.';
  }
  return formatDownloadLinks(movie);
}

module.exports = {
  searchMovies,
  getMovieDetails,
  formatSearchResults,
  formatMovieDetails,
  formatDownloadLinks,
  formatWatchLinks,
  getFlagEmoji,
  getAllProviderUrls,
  getProviders
};
