/**
 * api.js
 * Centralized service for all external API calls.
 * Uses Google Gemini for AI, YouTube Data API for metadata,
 * and a mock/Firecrawl for web research.
 *
 * NOTE: In a real production app these calls would go through
 * your own server-side proxy so keys are never exposed.
 * For this client-only demo, keys are read from environment variables.
 */


const GEMINI_API_KEY = "AIzaSyB9vtH-VrzPM5TN1hDiHrSoesY5RA8cEyM";
const YOUTUBE_API_KEY = "AIzaSyASOrmX6jHYj_sMScGWIOByZFxf24JNgn4";
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ─── Helper: call Gemini ─────────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured in your environment.');

  const res = await fetch(`${GEMINI_BASE}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Gemini API Error Output]:', err);
    throw new Error(`Gemini AI Error (${res.status}): ${err?.error?.message || 'Check your API key or usage limits.'}`);
  }

  const data = await res.json();
  console.log('[Gemini API Full Response]:', data);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── YouTube helpers ──────────────────────────────────────────────────────────

/**
 * extractVideoId – pulls the 11-char video ID from any YouTube URL format.
 * @param {string} url
 * @returns {string|null}
 */
function extractVideoId(url) {
  if (!url) return null;
  const re = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(re);
  return match ? match[1] : null;
}

/**
 * fetchYouTubeMetadata – fetches title + description via YouTube Data API.
 * Falls back to a mock if no API key is provided.
 * @param {string} videoId
 */
async function fetchYouTubeMetadata(videoId) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YouTube API Key is missing. Please ensure it is set in your environment configuration.');
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${YOUTUBE_API_KEY}`;

  const res = await fetch(url);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.error('[YouTube API Error Output]:', errorData);

    if (res.status === 400 || res.status === 403) {
      throw new Error(`YouTube API Invalid Request (${res.status}): ${errorData?.error?.message || 'Check your API key and permissions.'}`);
    } else if (res.status >= 500) {
      throw new Error(`YouTube API Server Error (${res.status}): Please try again later.`);
    } else {
      throw new Error(`YouTube API error ${res.status}: ${errorData?.error?.message || 'Unknown error'}`);
    }
  }

  const data = await res.json();
  console.log('[YouTube API Full Response]:', data);

  const item = data.items?.[0]?.snippet;
  if (!item) throw new Error(`Video not found for ID: ${videoId}`);

  return {
    title: item.title,
    description: item.description,
    thumbnail: item.thumbnails?.high?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/**
 * summarizeYouTubeVideo – fetches metadata then asks Gemini to summarize.
 * @param {string} videoUrl
 * @returns {{ title, thumbnail, summary, keyPoints: string[] }}
 */
async function summarizeYouTubeVideo(videoUrl) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) throw new Error('Invalid YouTube URL');

  const meta = await fetchYouTubeMetadata(videoId);

  const prompt = `
You are an expert content summarizer. Below is a YouTube video's title and description.

Title: ${meta.title}
Description: ${meta.description}

Please provide:
1. A concise 3-4 sentence summary of what this video is about.
2. A bullet list of 5 key takeaways or points from the video.

Format your response exactly like this:
SUMMARY:
[your summary here]

KEY POINTS:
• [point 1]
• [point 2]
• [point 3]
• [point 4]
• [point 5]
`.trim();

  const raw = await callGemini(prompt);

  // Parse the structured response
  const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]*?)(?=KEY POINTS:|$)/i);
  const keyPointsMatch = raw.match(/KEY POINTS:\s*([\s\S]*)/i);

  const summary = summaryMatch?.[1]?.trim() || raw;
  const keyPoints = keyPointsMatch?.[1]
    ?.split('\n')
    .map(l => l.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean) || [];

  return { title: meta.title, thumbnail: meta.thumbnail, summary, keyPoints };
}

// ─── AI Research ──────────────────────────────────────────────────────────────

/**
 * performAIResearch – answers a user question using Gemini.
 * In production, wire Firecrawl here and pass scraped content to Gemini.
 * @param {string} question
 * @returns {{ answer: string, sources: { title: string, url: string }[] }}
 */
async function performAIResearch(question) {
  if (!question?.trim()) throw new Error('Question cannot be empty');

  const prompt = `
You are an expert AI research assistant. Answer the following question comprehensively and accurately.

Question: ${question}

Provide your response in this EXACT format:

ANSWER:
[Provide a detailed, well-structured answer in 3-5 paragraphs]

SOURCES:
• [Source Title 1] | [https://example-url-1.com]
• [Source Title 2] | [https://example-url-2.com]
• [Source Title 3] | [https://example-url-3.com]

Note: Provide realistic source URLs relevant to the topic.
`.trim();

  const raw = await callGemini(prompt);

  const answerMatch = raw.match(/ANSWER:\s*([\s\S]*?)(?=SOURCES:|$)/i);
  const sourcesMatch = raw.match(/SOURCES:\s*([\s\S]*)/i);

  const answer = answerMatch?.[1]?.trim() || raw;

  const sources = (sourcesMatch?.[1] || '')
    .split('\n')
    .map(l => l.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('|').map(s => s.trim());
      return { title: parts[0] || 'Source', url: parts[1] || '#' };
    });

  return { answer, sources };
}

/**
 * generateAINoteSearch – uses Gemini to semantically search notes.
 * @param {string} query
 * @param {{ title: string, content: string }[]} notes
 * @returns {number[]} indices of matching notes
 */
async function generateAINoteSearch(query, notes) {
  if (!notes.length) return [];

  const noteList = notes.map((n, i) =>
    `[${i}] Title: ${n.title}\nContent: ${n.content.slice(0, 300)}`
  ).join('\n\n');

  const prompt = `
Given the following notes, return ONLY the indices (numbers) of notes that are relevant to the query.
Return them as a comma-separated list. If none match, return "NONE".

Query: ${query}

Notes:
${noteList}

Relevant note indices:
`.trim();

  try {
    const raw = await callGemini(prompt);
    if (raw.includes('NONE')) return [];
    return raw.match(/\d+/g)?.map(Number) || [];
  } catch {
    return [];
  }
}

// Attach to window for global access
window.extractVideoId = extractVideoId;
window.fetchYouTubeMetadata = fetchYouTubeMetadata;
window.summarizeYouTubeVideo = summarizeYouTubeVideo;
window.performAIResearch = performAIResearch;
window.generateAINoteSearch = generateAINoteSearch;
