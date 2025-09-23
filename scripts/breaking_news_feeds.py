import asyncio
import datetime
import json
import logging
import traceback
import httpx
import os
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

SOURCES = {
    "India": {"handle": "ndtv", "keyword": "#BREAKING"},
    "Israel": {"handle": "N12News", "keyword": "#BREAKING"},
    "Belarus": {"handle": "Pozirk_online", "keyword": "Belarus"},
    "Iraq": {"handle": "SHAFAQNEWSENG", "keyword": "#Iraq"},
    "Saudi Arabia": {"handle": "Saudi_Gazette", "keyword": "#BREAKING"},
    "Cameroon": {"handle": "TheCameroonianZ", "keyword": "#Cameroon"},
    "Qatar": {"handle": "dohanews", "keyword": "#Qatar"},
    "China": {"handle": "ChinaDaily", "keyword": "China"},
}


# ----------------------------
# Save logs to FeedLog table
# ----------------------------
async def save_log(db: Prisma, feed_type: str, url: str, data: dict, status: str):
    try:
        await db.feedlog.create(
            data={
                "feed_type": feed_type,
                "url": url,
                "response": json.dumps(data, ensure_ascii=False),
                "status": status,
            }
        )
    except Exception as e:
        print(f"⚠️ Failed to log in FeedLog: {e}")


# ----------------------------
# Twitter API call
# ----------------------------
async def get_tweetsOld(username: str, keyword: str = None, limit: int = 10):
    global API_HITS
    username = username.lstrip('@')
    headers = {"Authorization": f"Bearer {BEARER_TOKEN}"}

    query = f"from:{username}"
    if keyword:
        query += f" {keyword}"

    # Restrict to past 48 hours
    start_time = (datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)).isoformat()    

    API_HITS += 1
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/tweets/search/recent",
            headers=headers,
            params={
                "query": query,
                "max_results": min(limit, 100),
                "tweet.fields": "created_at",
                "expansions": "attachments.media_keys",
                "media.fields": "url,preview_image_url,type",
                "start_time": start_time
            }
        )
        if resp.status_code != 200:
            logging.error(f"❌ Error {resp.status_code} for {username}: {resp.text}")
            return []

        tweets_json = resp.json()

        # Map media
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


async def get_tweets(db: Prisma, username: str, keyword: str = None, limit: int = 10):
    global API_HITS
    username = username.lstrip('@')
    headers = {"Authorization": f"Bearer {BEARER_TOKEN}"}

    query = f"from:{username}"
    if keyword:
        query += f" {keyword}"

    start_time = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=LOOKBACK_HOURS)).isoformat()

    API_HITS += 1
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/tweets/search/recent",
            headers=headers,
            params={
                "query": query,
                "max_results": min(limit, 100),
                "tweet.fields": "created_at",
                "expansions": "attachments.media_keys",
                "media.fields": "url,preview_image_url,type",
                "start_time": start_time
            }
        )

        if resp.status_code != 200:
            await save_log(db, "BREAKING_NEWS", str(resp.url), resp.json(), f"error_{resp.status_code}")
            return []

        tweets_json = resp.json()
        await save_log(db, "BREAKING_NEWS", str(resp.url), tweets_json, "success")

        # Map media
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

# ----------------------------
# Scrape + Save
# ----------------------------
async def scrape_country_breaking(db: Prisma, country, handle: str, keyword: str):
    try:
        tweets = await get_tweets(db, handle, keyword, limit=10)

        rss_json = {
            "channel": {
                "title": f"{country.name} Breaking News Feed",
                "description": f"Breaking news tweets from {handle}",
                "link": f"https://twitter.com/{handle}",
                "items": tweets,
                "meta": {
                    "status": "success" if tweets else "empty",
                    "tweet_count": len(tweets),
                    "api_hits": API_HITS,
                },
                "image": {
                    "url": "https://abs.twimg.com/icons/apple-touch-icon-192x192.png",
                    "title": f"{country.name} Breaking News",
                    "link": f"https://twitter.com/{handle}",
                }
            }
        }

        saved_row = await db.scrapperdata.find_first(
            where={"country_id": country.id, "feed_type": "BREAKING_NEWS"}
        )

        if saved_row:
            await db.scrapperdata.update(
                where={"id": saved_row.id},
                data={
                    "content": json.dumps(rss_json, ensure_ascii=False),
                    "updated_at": datetime.datetime.now(),
                }
            )
        else:
            await db.scrapperdata.create(
                data={
                    "feed_type": "BREAKING_NEWS",
                    "country_id": country.id,
                    "content": json.dumps(rss_json, ensure_ascii=False),
                }
            )

        logging.info(f"[BREAKING_NEWS][{country.name}] → {len(tweets)} tweets (API_HITS={API_HITS})")
        return len(tweets)

    except Exception as e:
        logging.error(f"[BREAKING_NEWS][{country.name}] failed: {e}")
        traceback.print_exc()
        return 0

# ----------------------------
# Main runner
# ----------------------------
async def main():
    db = Prisma()
    await db.connect()

    total = 0
    for country_name, info in SOURCES.items():
        country = await db.country.find_first(where={"name": country_name})
        if not country:
            logging.warning(f"⚠️ Country '{country_name}' not found in DB")
            continue

        count = await scrape_country_breaking(db, country, info["handle"], info["keyword"])
        total += count

    logging.info(f"SUMMARY: BREAKING_NEWS={total} tweets, API_HITS={API_HITS}")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
