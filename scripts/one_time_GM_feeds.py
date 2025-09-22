import asyncio
import datetime
import logging
import traceback
import json
import httpx
from prisma import Prisma

# ----------------------------
# Config
# ----------------------------
BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAABwozwEAAAAAUpPEFKhy6EuqSdRDlorutx4GXkk%3D2IRdYYduieHPhcj8sMSSyRQyj3moAxTAcOWjCZRFbZy5ZW1vfW"  # <--- put real token here
BASE_URL = "https://api.twitter.com/2"

# ✅ Only fetch these countries
TARGET_COUNTRIES = [
    "India",
    # "China",
    # "Saudi Arabia",
    # "Cameroon",
    # "Israel",
    # "Qatar",
    # "Belarus",
    # "Iraq",
]

# ----------------------------
# Logging Setup
# ----------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("gov_messaging_twitter.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)

# ----------------------------
# Fetch Tweets for a Handle
# ----------------------------
async def get_tweets(username: str, limit: int = 10):
    username = username.lstrip('@')  # remove leading @ if present
    headers = {"Authorization": f"Bearer {BEARER_TOKEN}"}

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Get user ID
        user_resp = await client.get(f"{BASE_URL}/users/by/username/{username}", headers=headers)
        if user_resp.status_code != 200:
            logging.warning(f"⚠️ Failed to fetch user ID for @{username} ({user_resp.status_code})")
            return []

        user_id = user_resp.json().get("data", {}).get("id")
        if not user_id:
            logging.warning(f"⚠️ No user ID found for @{username}")
            return []

        # 2. Get tweets
        tweets_resp = await client.get(
            f"{BASE_URL}/users/{user_id}/tweets",
            headers=headers,
            params={
                "max_results": min(limit, 100),
                "tweet.fields": "created_at",
                "expansions": "attachments.media_keys",
                "media.fields": "url,preview_image_url,type"
            }
        )
        if tweets_resp.status_code != 200:
            logging.warning(f"⚠️ Failed to fetch tweets for @{username} ({tweets_resp.status_code})")
            return []

        tweets_json = tweets_resp.json()

        # 🔹 Handle media safely
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
                "guid": {
                    "isPermaLink": True,
                    "value": f"https://twitter.com/{username}/status/{t['id']}"
                },
                "dc:creator": username,
                "pubDate": t["created_at"],
                "images": [
                    media_map[m] for m in t.get("attachments", {}).get("media_keys", [])
                    if m in media_map
                ],
            })

        return tweets_data

# ----------------------------
# Scrape & Save for One Country
# ----------------------------
async def scrape_country_tweets(db: Prisma, country, gov_handles: list[str]):
    all_tweets = []
    site_logo = "https://abs.twimg.com/icons/apple-touch-icon-192x192.png"  # Twitter logo

    try:
        for handle in gov_handles:
            tweets = await get_tweets(handle, limit=10)
            all_tweets.extend(tweets)

        # Sort by newest first
        all_tweets.sort(key=lambda x: x["pubDate"], reverse=True)

        status = "success" if all_tweets else "empty"
        rss_json = {
            "channel": {
                "title": f"{country.name} Government Messaging Feed",
                "description": f"Scraped Twitter feeds for {country.name} ({', '.join(gov_handles)})",
                "link": "https://twitter.com/",
                "items": all_tweets,
                "meta": {
                    "status": status,
                    "tweet_count": len(all_tweets),
                },
            }
        }

        # Add Twitter logo
        rss_json["channel"]["image"] = {
            "url": site_logo,
            "title": f"{country.name} Government Messaging",
            "link": "https://twitter.com/",
        }

        # Save / update DB
        saved_row = await db.scrapperdata.find_first(
            where={"country_id": country.id, "feed_type": "GOVERNMENT_MESSAGING"}
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
                    "feed_type": "GOVERNMENT_MESSAGING",
                    "country_id": country.id,
                    "content": json.dumps(rss_json, ensure_ascii=False),
                }
            )

        logging.info(f"[GOVERNMENT_MESSAGING][{country.name}] → {status} ({len(all_tweets)} tweets)")
        return len(all_tweets)

    except Exception as e:
        logging.error(f"[GOVERNMENT_MESSAGING][{country.name}] exception: {e}")
        traceback.print_exc()
        return 0

# ----------------------------
# Main Runner
# ----------------------------
async def main():
    db = Prisma()
    await db.connect()

    total = 0
    for country_name in TARGET_COUNTRIES:
        country = await db.country.find_first(where={"name": country_name})
        if not country:
            logging.warning(f"⚠️ No country found with name '{country_name}'")
            continue

        gov_handles = await db.governmentmessaging.find_many(where={"countryId": country.id})
        handles = [g.handle for g in gov_handles if g.handle]

        if handles:
            count = await scrape_country_tweets(db, country, handles)
            total += count
        else:
            logging.warning(f"⚠️ No GovernmentMessaging handles found for {country_name}")

    logging.info(f"SUMMARY: GOVERNMENT_MESSAGING={total} tweets merged across {len(TARGET_COUNTRIES)} countries")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
