import os
import httpx
import asyncio
import datetime
import json
from dotenv import load_dotenv
from prisma import Prisma

# ----------------------------
# Config
# ----------------------------
load_dotenv()
BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN")
LOOKBACK_HOURS = int(os.getenv("TWITTER_LOOKBACK_HOURS", "48"))
BASE_URL = "https://api.twitter.com/2"
API_HITS = 0


# ----------------------------
# Save logs to FeedLog table
# ----------------------------
async def save_log(db: Prisma, feed_type: str, url: str, data: dict, status: str):
    await db.feedlog.create(
        data={
            "feed_type": feed_type,
            "url": url,
            "response": json.dumps(data, ensure_ascii=False),
            "status": status,
            "created_at": datetime.datetime.now(),
        }
    )


# ----------------------------
# Get Tweets (with rate limit handling)
# ----------------------------
async def get_tweets(db: Prisma, username: str, feed_type: str, limit: int = 10):
    global API_HITS
    username = username.lstrip('@')  # normalize
    headers = {"Authorization": f"Bearer {BEARER_TOKEN}"}

    # Restrict to past 48 hours
    #start_time = (datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)).isoformat()
    start_time = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=LOOKBACK_HOURS)).isoformat()
    
    async with httpx.AsyncClient(timeout=30) as client:
        while True:  # retry loop
            API_HITS += 1
            resp = await client.get(
                f"{BASE_URL}/tweets/search/recent",
                headers=headers,
                params={
                    "query": f"from:{username}",
                    "max_results": min(limit, 100),
                    "tweet.fields": "created_at",
                    "expansions": "attachments.media_keys",
                    "media.fields": "url,preview_image_url,type",
                    "start_time": start_time
                }
            )

            # ✅ Handle Rate Limit (429)
            if resp.status_code == 429:
                reset_after = int(resp.headers.get("x-rate-limit-reset", 0))
                now = int(datetime.datetime.now().timestamp())
                wait_time = max(reset_after - now, 15)
                await save_log(db, feed_type, resp.url.__str__(), {"error": "429 Too Many Requests"}, "rate_limited")
                print(f"⚠️ Rate limit hit for {username}. Sleeping {wait_time}s...")
                await asyncio.sleep(wait_time)
                continue  # retry after sleeping

            # ✅ Other errors
            if resp.status_code != 200:
                await save_log(db, feed_type, resp.url.__str__(), resp.json(), f"error_{resp.status_code}")
                return []

            break  # success → exit loop

        tweets_json = resp.json()
        await save_log(db, feed_type, resp.url.__str__(), tweets_json, "success")

        # 🔹 Map media
        media_map = {}
        for m in tweets_json.get("includes", {}).get("media", []):
            if m["type"] == "photo" and "url" in m:
                media_map[m["media_key"]] = m["url"]
            elif m["type"] in ("video", "animated_gif") and "preview_image_url" in m:
                media_map[m["media_key"]] = m["preview_image_url"]

        tweets_data = []
        for t in tweets_json.get("data", []):
            tweets_data.append({
                "title": t["text"][:50] + "..." if len(t["text"]) > 50 else t["text"],
                "description": t["text"],
                "link": f"https://twitter.com/{username}/status/{t['id']}",
                "guid": {"isPermaLink": True, "value": f"https://twitter.com/{username}/status/{t['id']}"},
                "dc:creator": username,
                "pubDate": t["created_at"],
                "images": [
                    media_map[m] for m in t.get("attachments", {}).get("media_keys", [])
                    if m in media_map
                ],
            })

        return tweets_data
