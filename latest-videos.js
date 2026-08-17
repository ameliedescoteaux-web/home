// Cloudflare Pages Function — served at /latest-videos
// Resolves the @yogastrongbyamelie channel handle to its channel ID, reads the
// channel's public RSS feed, and returns the 3 most recent videos as JSON.
// No API key needed. Cached at the edge for an hour to stay light on requests.

const HANDLE = "yogastrongbyamelie";

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request("https://cache.internal/latest-videos");
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const channelId = await resolveChannelId(HANDLE);
    const feedRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );
    if (!feedRes.ok) throw new Error("feed fetch failed");
    const xml = await feedRes.text();

    const entries = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)]
      .slice(0, 3)
      .map((m) => {
        const block = m[0];
        const id = (block.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
        const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
        const thumb = (block.match(/<media:thumbnail url="(.*?)"/) || [])[1];
        return id ? { id, title: decodeHtml(title || ""), thumb } : null;
      })
      .filter(Boolean);

    const body = JSON.stringify(entries);
    const response = new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600",
      },
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

async function resolveChannelId(handle) {
  const res = await fetch(`https://www.youtube.com/@${handle}`, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  const html = await res.text();
  const match = html.match(/"channelId":"(UC[^"]+)"/);
  if (!match) throw new Error("channel id not found");
  return match[1];
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
