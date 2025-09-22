import asyncio
import datetime
import traceback
import json
import httpx
import logging
from prisma import Prisma
import os
from dotenv import load_dotenv

# ----------------------------
# Config
# ----------------------------
load_dotenv()
BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN")
BASE_URL = "https://api.twitter.com/2"

TARGET_COUNTRIES = [
    "India",
    "China",
    "Saudi Arabia",
    "Cameroon",
    "Israel",
    "Qatar",
    "Belarus",
    "Iraq",
]

API_HITS = 0
loggers = {}  # cache for separate loggers

# ----------------------------
# Logger Factory
# ----------------------------
def get_logger(feed_type: str):
    """Return a logger that writes to a feed-specific log file."""
    if feed_type in loggers:
        return loggers[feed_type]

    logger = logging.getLogger(feed_type)
    logger.setLevel(logging.INFO)

    fh = logging.FileHandler(f"{feed_type.lower()}.log", encoding="utf-8")
    sh = logging.StreamHandler()

    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh.setFormatter(formatter)
    sh.setFormatter(formatter)

    logger.addHandler(fh)
    logger.addHandler(sh)

    loggers[feed_type] = logger
    return logger


# ----------------------------
# Get Tweets (1 API call per handle)
# ----------------------------
async def get_tweets(username: str, limit: int = 10):
    global API_HITS
    username = username.lstrip('@')  # normalize
    headers = {"Authorization": f"Bearer {BEARER_TOKEN}"}

    API_HITS += 1
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/tweets/search/recent",
            headers=headers,
            params={
                "query": f"from:{username}",
                "max_results": min(limit, 100),
                "tweet.fields": "created_at",
                "expansions": "attachments.media_keys",
                "media.fields": "url,preview_image_url,type"
            }
        )
        if resp.status_code != 200:
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


# ----------------------------
# Scrape & Save for one feed type
# ----------------------------
async def scrape_country_handles(db: Prisma, country, handles: list[str], feed_type: str):
    logger = get_logger(feed_type)
    all_tweets = []
    site_logo = "https://abs.twimg.com/icons/apple-touch-icon-192x192.png"

    try:
        for handle in handles:
            tweets = await get_tweets(handle, limit=10)
            logger.info(f"Handle {handle} returned {len(tweets)} tweets")
            all_tweets.extend(tweets)

        # Sort newest first
        all_tweets.sort(key=lambda x: x["pubDate"], reverse=True)

        status = "success" if all_tweets else "empty"
        rss_json = {
            "channel": {
                "title": f"{country.name} {feed_type.replace('_', ' ').title()} Feed",
                "description": f"Scraped Twitter feeds for {country.name} ({', '.join(handles)})",
                "link": "https://twitter.com/",
                "items": all_tweets,
                "meta": {
                    "status": status,
                    "tweet_count": len(all_tweets),
                },
                "image": {
                    "url": site_logo,
                    "title": f"{country.name} {feed_type.replace('_', ' ').title()}",
                    "link": "https://twitter.com/"
                }
            }
        }

        # Save / update DB
        saved_row = await db.scrapperdata.find_first(
            where={"country_id": country.id, "feed_type": feed_type}
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
                    "feed_type": feed_type,
                    "country_id": country.id,
                    "content": json.dumps(rss_json, ensure_ascii=False),
                }
            )

        logger.info(f"[{feed_type}][{country.name}] → {status} ({len(all_tweets)} tweets)")
        return len(all_tweets)

    except Exception as e:
        logger.error(f"[{feed_type}][{country.name}] exception: {e}")
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
            continue

        # GOVERNMENT_MESSAGING
        gov_handles = await db.governmentmessaging.find_many(where={"countryId": country.id})
        if gov_handles:
            total += await scrape_country_handles(
                db, country, [g.handle for g in gov_handles if g.handle], "GOVERNMENT_MESSAGING"
            )

        # LEADERSHIP_MESSAGING
        leader_handles = await db.leadershipmessaging.find_many(where={"countryId": country.id})
        if leader_handles:
            total += await scrape_country_handles(
                db, country, [l.handle for l in leader_handles if l.handle], "LEADERSHIP_MESSAGING"
            )

        # EMBASSY_MENTION
        embassy_handles = await db.embassypresence.find_many(where={"countryId": country.id})
        if embassy_handles:
            total += await scrape_country_handles(
                db, country, [e.handle for e in embassy_handles if e.handle], "EMBASSY_MENTION"
            )

        # AMBASSADOR_MENTION
        diplomat_handles = await db.diplomaticpresence.find_many(where={"countryId": country.id})
        if diplomat_handles:
            total += await scrape_country_handles(
                db, country, [d.handle for d in diplomat_handles if d.handle], "AMBASSADOR_MENTION"
            )

    # Write summary to one file
    with open("summary.log", "a", encoding="utf-8") as f:
        f.write(f"{datetime.datetime.now()} SUMMARY: TOTAL_TWEETS={total}, API_HITS={API_HITS}\n")

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
