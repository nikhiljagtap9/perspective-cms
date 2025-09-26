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
async def save_feed_log(db: Prisma, feed_type: str, url: str, data: dict, status: str):
    await db.feedlog.create(
        data={
            "feed_type": feed_type,
            "url": url,
            "response": json.dumps(data, ensure_ascii=False),
            "status": status,
           # "created_at": datetime.datetime.now(),
        }
    )


# ----------------------------
# Get Tweets (with rate limit handling)
# ----------------------------

async def get_tweets(db: Prisma, username: str, feed_type: str, limit: int = 10, mode: str = "self"):
    global API_HITS

    # Skip if handle is empty or not a string
    if not username or not isinstance(username, str):
        await save_feed_log(db, feed_type, "N/A", {"error": "Invalid handle"}, "skipped")
        return []

    username = username.strip().lstrip('@')  # normalize
    if not username:
        await save_feed_log(db, feed_type, "N/A", {"error": "Empty handle after cleanup"}, "skipped")
        return []

    headers = {"Authorization": f"Bearer {BEARER_TOKEN}"}

    # Restrict to past 48 hours
    start_time = (
        datetime.datetime.now(datetime.timezone.utc)
        - datetime.timedelta(hours=LOOKBACK_HOURS)
    ).isoformat()

    # 🔹 Build search query based on mode
    if mode == "self":
        search_query = f"from:{username} -is:retweet -is:reply"  # exclude RTs & replies  # only this user’s tweets
    elif mode == "about":
        search_query = f"@{username} -from:{username}"   # tweets by others mentioning the user
    else:
        search_query = username   # fallback → simple keyword search

    async with httpx.AsyncClient(timeout=30) as client:
        while True:  # retry loop
            API_HITS += 1
            resp = await client.get(
                f"{BASE_URL}/tweets/search/recent",
                headers=headers,
                params={
                    "query": search_query, 
                    "max_results": min(limit, 100),
                    "tweet.fields": "created_at",
                    "expansions": "attachments.media_keys,author_id",  # include user info + media
                    "media.fields": "url,preview_image_url,type,variants",
                    "user.fields": "name,username,profile_image_url",   # get avatar
                    "start_time": start_time,
                },
            )

            # ✅ Handle Rate Limit (429)
            if resp.status_code == 429:
                reset_after = int(resp.headers.get("x-rate-limit-reset", 0))
                now = int(datetime.datetime.now().timestamp())
                wait_time = max(reset_after - now, 15)
                await save_feed_log(
                    db, feed_type, str(resp.url),
                    {"error": "429 Too Many Requests"},
                    "rate_limited"
                )
                print(f"⚠️ Rate limit hit for {username}. Sleeping {wait_time}s...")
                await asyncio.sleep(wait_time)
                continue  # retry after sleeping

            # ✅ Other errors
            if resp.status_code != 200:
                await save_feed_log(
                    db, feed_type, str(resp.url),
                    resp.json(),
                    f"error_{resp.status_code}"
                )
                return []

            break  # success → exit loop

        tweets_json = resp.json()
        await save_feed_log(db, feed_type, str(resp.url), tweets_json, "success")

        # 🔹 Map media
        media_map = {}
        for m in tweets_json.get("includes", {}).get("media", []):
            if m["type"] == "photo" and "url" in m:
                media_map[m["media_key"]] = m["url"]
            elif m["type"] in ("video", "animated_gif") and "preview_image_url" in m:
                #    media_map[m["media_key"]] = m["preview_image_url"]
                thumb = m["preview_image_url"]
                # try to upgrade quality if possible
                if "?name=" not in thumb:
                    thumb = thumb + "?name=orig"
                media_map[m["media_key"]] = thumb

        # 🔹 Map user profiles (author_id → username + profile image)
        user_map = {}
        for u in tweets_json.get("includes", {}).get("users", []):
            user_map[u["id"]] = {
                "username": u.get("username"),
                "name": u.get("name"),
                "profile_image_url": u.get("profile_image_url"),
            }

        tweets_data = []
        for t in tweets_json.get("data", []):
            author_id = t.get("author_id")
            user_info = user_map.get(author_id, {})
            author_username = user_info.get("username", "unknown")
            profile_photo = user_info.get("profile_image_url")

            # Convert created_at → datetime object
            dt = datetime.datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))

            # Format like Twitter style: "7:40 PM · Sep 24, 2025"
            pub_date = dt.strftime("%-I:%M %p · %b %d, %Y")

            # pick first media url or fallback to avatar
            media_keys = t.get("attachments", {}).get("media_keys", [])
            thumbnail_url = None
            for mk in media_keys:
                if mk in media_map:
                    thumbnail_url = media_map[mk]
                    break

            tweets_data.append({
                "title": user_info.get("name", author_username).title(),
                "description": t["text"],
                "link": f"https://twitter.com/{author_username}/status/{t['id']}",  # correct author
                "guid": {
                    "isPermaLink": True,
                    "value": f"https://twitter.com/{author_username}/status/{t['id']}"
                },
                "dc:creator": f"@{author_username}" if author_username else "",  # real author, not the searched handle
                "pubDate": pub_date,
                "images": [
                    media_map[m]
                    for m in t.get("attachments", {}).get("media_keys", [])
                    if m in media_map
                ],
                "thumbnails": profile_photo,  # avatar
                "thumbnail_url": thumbnail_url  # main media
            })
        return tweets_data
